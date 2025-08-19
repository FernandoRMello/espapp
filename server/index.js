const express = require('express');
const cors = require('cors');

// Cria a aplicação express
const app = express();

// Define a porta. Em plataformas como o Render, a variável de ambiente PORT é fornecida.
const port = process.env.PORT || 3000;

// Middleware para aceitar requisições JSON e habilitar CORS
app.use(express.json());
app.use(cors());

// Array em memória para armazenar os logs recebidos. Em produção, substitua por um banco de dados.
const logs = [];

/**
 * Rota POST /api/logs
 * Espera corpo JSON no formato { deviceId: string, timestamp: number }
 * Armazena o log em memória e responde com uma mensagem de sucesso.
 */
app.post('/api/logs', (req, res) => {
  const { deviceId, timestamp } = req.body;
  if (!deviceId || !timestamp) {
    return res.status(400).json({ message: 'deviceId e timestamp são obrigatórios.' });
  }
  logs.push({ deviceId, timestamp });
  res.json({ message: 'Log recebido com sucesso.' });
});

/**
 * Rota GET /api/logs
 * Retorna todos os logs registrados.
 */
app.get('/api/logs', (req, res) => {
  res.json(logs);
});

/**
 * Rota GET /api/logs/:deviceId
 * Retorna apenas os logs de um dispositivo específico, filtrando pelo deviceId.
 */
app.get('/api/logs/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const deviceLogs = logs.filter((log) => log.deviceId === deviceId);
  res.json(deviceLogs);
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor executando na porta ${port}`);
});