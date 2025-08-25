const http = require('http');
const url = require('url');
const crypto = require('crypto');

/*
 * Guardian Backend (no external dependencies)
 *
 * This server implements a REST API for collecting logs from ESP32 devices,
 * queueing control commands, retrieving the latest status and managing
 * authentication. To avoid the need for third‑party packages like
 * Express, it relies solely on Node's built‑in http module. CORS
 * headers are added on every response to allow front‑end clients to
 * communicate with it from any origin.
 */

// In‑memory storage for logs and queued commands
const logs = [];
const commands = {};

// Simple user database. In production, store hashed passwords.
const users = {
  admin: { password: 'admin123', role: 'admin' },
  gerente: { password: 'gerente123', role: 'gerente' },
  relatorio: { password: 'relatorio123', role: 'relatorio' }
};

// Active sessions keyed by token
const tokens = {};

function generateToken() {
  return crypto.randomBytes(20).toString('hex');
}

// Helper to set common CORS and content headers
function setHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Content-Type', 'application/json');
}

function sendJson(res, statusCode, obj) {
  res.statusCode = statusCode;
  res.end(JSON.stringify(obj));
}

// Parse JSON body into an object. Returns a promise.
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        const parsed = JSON.parse(data);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Authenticate a request based on the Authorization header. Returns
// { username, role } or null if invalid.
function authenticate(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = tokens[token];
  if (!session) return null;
  if (Date.now() > session.expireAt) {
    delete tokens[token];
    return null;
  }
  return { username: session.username, role: session.role };
}

function handleRequest(req, res) {
  // Set CORS and JSON headers immediately
  setHeaders(res);
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '';

  // Helper to respond with 404
  function notFound() {
    sendJson(res, 404, { error: 'Rota não encontrada' });
  }

  // Login endpoint
  if (pathname === '/api/login' && req.method === 'POST') {
    parseBody(req)
      .then(body => {
        const { username, password } = body;
        if (!username || !password) {
          return sendJson(res, 400, { error: 'Usuário e senha são obrigatórios' });
        }
        const user = users[username];
        if (!user || user.password !== password) {
          return sendJson(res, 401, { error: 'Credenciais inválidas' });
        }
        const token = generateToken();
        tokens[token] = {
          username,
          role: user.role,
          expireAt: Date.now() + 8 * 60 * 60 * 1000
        };
        sendJson(res, 200, { token, role: user.role });
      })
      .catch(() => sendJson(res, 400, { error: 'Corpo da requisição inválido' }));
    return;
  }

  // Route requiring authentication: /api/users (GET and POST)
  if (pathname === '/api/users') {
    const user = authenticate(req);
    if (!user) return sendJson(res, 401, { error: 'Token ausente ou inválido' });
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Acesso negado' });
    if (req.method === 'GET') {
      const list = Object.keys(users).map(u => ({ username: u, role: users[u].role }));
      return sendJson(res, 200, list);
    }
    if (req.method === 'POST') {
      parseBody(req)
        .then(body => {
          const { username, password, role } = body;
          if (!username || !password || !role) {
            return sendJson(res, 400, { error: 'username, password e role são obrigatórios' });
          }
          if (users[username]) {
            return sendJson(res, 400, { error: 'Usuário já existe' });
          }
          if (!['admin', 'gerente', 'relatorio'].includes(role)) {
            return sendJson(res, 400, { error: 'Role inválido' });
          }
          users[username] = { password, role };
          sendJson(res, 200, { message: 'Usuário criado', username, role });
        })
        .catch(() => sendJson(res, 400, { error: 'Corpo da requisição inválido' }));
      return;
    }
    return notFound();
  }

  // Logs posting: /api/logs (POST) – open to devices (no auth)
  if (pathname === '/api/logs' && req.method === 'POST') {
    parseBody(req)
      .then(body => {
        const { deviceId, timestamp, temperature, sensors, outputs } = body;
        if (!deviceId || !timestamp) {
          return sendJson(res, 400, { error: 'deviceId e timestamp são obrigatórios' });
        }
        const entry = {
          deviceId,
          timestamp,
          receivedAt: Math.floor(Date.now() / 1000)
        };
        if (typeof temperature === 'number') entry.temperature = temperature;
        if (sensors && typeof sensors === 'object') entry.sensors = sensors;
        if (outputs && typeof outputs === 'object') entry.outputs = outputs;
        logs.push(entry);
        sendJson(res, 200, { message: 'Log registrado', entry });
      })
      .catch(() => sendJson(res, 400, { error: 'Corpo da requisição inválido' }));
    return;
  }

  // Authenticated endpoints for logs and status
  if (pathname.startsWith('/api/logs')) {
    const user = authenticate(req);
    if (!user) return sendJson(res, 401, { error: 'Token ausente ou inválido' });
    if (!['admin', 'gerente', 'relatorio'].includes(user.role)) return sendJson(res, 403, { error: 'Acesso negado' });
    // /api/logs (GET)
    if (pathname === '/api/logs' && req.method === 'GET') {
      return sendJson(res, 200, logs);
    }
    // /api/logs/:deviceId
    const parts = pathname.split('/');
    if (parts.length === 4 && req.method === 'GET') {
      const deviceId = parts[3];
      const filtered = logs.filter(l => l.deviceId === deviceId);
      return sendJson(res, 200, filtered);
    }
    return notFound();
  }

  // /api/status/:deviceId
  if (pathname.startsWith('/api/status/')) {
    const user = authenticate(req);
    if (!user) return sendJson(res, 401, { error: 'Token ausente ou inválido' });
    if (!['admin', 'gerente', 'relatorio'].includes(user.role)) return sendJson(res, 403, { error: 'Acesso negado' });
    const parts = pathname.split('/');
    if (parts.length === 4 && req.method === 'GET') {
      const deviceId = parts[3];
      const filtered = logs.filter(l => l.deviceId === deviceId);
      if (filtered.length === 0) return sendJson(res, 404, { error: 'Nenhum log encontrado para este dispositivo' });
      const latest = filtered.reduce((acc, cur) => (!acc || cur.timestamp > acc.timestamp ? cur : acc), null);
      return sendJson(res, 200, latest);
    }
    return notFound();
  }

  // /api/control (POST) – only admin
  if (pathname === '/api/control' && req.method === 'POST') {
    const user = authenticate(req);
    if (!user) return sendJson(res, 401, { error: 'Token ausente ou inválido' });
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Acesso negado' });
    parseBody(req)
      .then(body => {
        const { deviceId, pin, state } = body;
        if (!deviceId || typeof pin === 'undefined' || typeof state === 'undefined') {
          return sendJson(res, 400, { error: 'deviceId, pin e state são obrigatórios' });
        }
        const normalizedState = state ? 1 : 0;
        if (!commands[deviceId]) commands[deviceId] = [];
        commands[deviceId].push({ pin: parseInt(pin, 10), state: normalizedState });
        sendJson(res, 200, { message: 'Comando enfileirado', command: { pin: parseInt(pin, 10), state: normalizedState } });
      })
      .catch(() => sendJson(res, 400, { error: 'Corpo da requisição inválido' }));
    return;
  }

  // /api/commands/:deviceId (GET) – accessible without auth for devices
  if (pathname.startsWith('/api/commands/')) {
    const parts = pathname.split('/');
    if (parts.length === 4 && req.method === 'GET') {
      const deviceId = parts[3];
      const list = commands[deviceId] || [];
      commands[deviceId] = [];
      return sendJson(res, 200, list);
    }
    return notFound();
  }

  // If no route matched
  return notFound();
}

const PORT = process.env.PORT || 3000;
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Guardian backend listening on port ${PORT}`);
});