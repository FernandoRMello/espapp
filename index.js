// Backend simples para receber pings do ESP32 e expor relatórios
// Rotas principais:
//   POST /api/logs            -> recebe { deviceId, timestamp }
//   GET  /api/logs            -> lista todos os logs (query: deviceId, limit)
//   GET  /api/logs/:deviceId  -> lista logs de um device
//   GET  /api/health          -> saúde do serviço
//   GET  /                    -> info básica

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Em Render a porta vem em process.env.PORT
const PORT = process.env.PORT || 3000;

const app = express();

// CORS: libere seu domínio do Netlify (ajuste se mudar o domínio)
const allowedOrigins = [
  'https://espapp.netlify.app',   // seu front no Netlify
  'http://localhost:5173',        // útil p/ testes locais (vite)
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, cb) {
    // permitir sem Origin (curl/ESP32) e as origens acima
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json({ limit: '256kb' })); // corpo JSON
app.use(morgan('tiny'));

// Armazenamento em memória (para PoC). Em produção, troque por DB.
let LOGS = []; // { deviceId, timestamp, receivedAt }

// Helpers
function isValidPayload(body) {
  if (!body || typeof body !== 'object') return false;
  const { deviceId, timestamp } = body;
  if (typeof deviceId !== 'string' || !deviceId.trim()) return false;
  // aceita timestamp number (segundos) ou string numerica
  const t = Number(timestamp);
  if (!Number.isFinite(t) || t <= 0) return false;
  return true;
}

// Rotas
app.get('/', (req, res) => {
  res.json({
    name: 'ESP32 Ping Logger API',
    version: '1.1.0',
    endpoints: ['/api/health', '/api/logs', '/api/logs/:deviceId']
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', logsCount: LOGS.length, time: new Date().toISOString() });
});

// POST /api/logs  { deviceId, timestamp }
app.post('/api/logs', (req, res) => {
  if (!isValidPayload(req.body)) {
    return res.status(400).json({ error: 'payload inválido: envie { deviceId, timestamp }' });
  }
  const { deviceId } = req.body;
  const timestamp = Number(req.body.timestamp);

  const entry = {
    deviceId,
    timestamp,
    receivedAt: Math.floor(Date.now() / 1000)
  };
  LOGS.push(entry);

  // Evita crescimento infinito (mantém os últimos 50k registros)
  if (LOGS.length > 50000) LOGS = LOGS.slice(-50000);

  // Retorna leve para o ESP32
  res.status(200).json({ ok: true });
});

// GET /api/logs?deviceId=ESP32_001&limit=100
app.get('/api/logs', (req, res) => {
  const { deviceId, limit } = req.query;

  let rows = LOGS;
  if (deviceId) {
    rows = rows.filter(r => r.deviceId === String(deviceId));
  }
  // ordena do mais novo pro mais antigo
  rows = rows.slice().sort((a, b) => b.timestamp - a.timestamp);

  const lim = Math.max(1, Math.min(Number(limit) || 1000, 10000));
  res.json(rows.slice(0, lim));
});

// GET /api/logs/:deviceId
app.get('/api/logs/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const rows = LOGS
    .filter(r => r.deviceId === deviceId)
    .sort((a, b) => b.timestamp - a.timestamp);
  res.json(rows);
});

// Tratamento básico de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err?.message);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});