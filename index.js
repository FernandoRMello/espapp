const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for all routes. This allows the Netlify front-end to access
// the API directly over HTTPS without relying on Netlify redirects.
app.use(cors());

// Parse JSON bodies.
app.use(express.json());

// In-memory store for logs. Each log has deviceId, timestamp and receivedAt.
const logs = [];

// POST /api/logs – record a new log entry.
app.post('/api/logs', (req, res) => {
  const { deviceId, timestamp } = req.body;
  if (!deviceId || !timestamp) {
    return res.status(400).json({ error: 'deviceId and timestamp are required' });
  }
  const entry = {
    deviceId,
    timestamp,
    receivedAt: Math.floor(Date.now() / 1000),
  };
  logs.push(entry);
  res.json({ message: 'Log saved', entry });
});

// GET /api/logs – return all logs.
app.get('/api/logs', (req, res) => {
  res.json(logs);
});

// GET /api/logs/:deviceId – return logs for a specific device.
app.get('/api/logs/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const filtered = logs.filter(log => log.deviceId === deviceId);
  res.json(filtered);
});

// Start the server. When deployed to Render, PORT will be provided by the platform.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});