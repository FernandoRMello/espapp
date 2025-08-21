const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for all routes. This allows the Netlify front-end to access
// the API directly over HTTPS without relying on Netlify redirects.
app.use(cors());

// Parse JSON bodies.
app.use(express.json());

// In-memory store for logs. Each log has deviceId, timestamp, optional temperature,
// optional outputs (mapping of pin numbers to states) and a receivedAt timestamp.
const logs = [];

// In-memory store for pending commands keyed by deviceId. Each entry is an array
// of commands to be executed by the device. A command should include `pin`
// (integer) and `state` (0 or 1).
const commands = {};

// POST /api/logs – record a new log entry.
app.post('/api/logs', (req, res) => {
  const { deviceId, timestamp, temperature, outputs } = req.body;
  // Validate mandatory fields
  if (!deviceId || !timestamp) {
    return res.status(400).json({ error: 'deviceId and timestamp are required' });
  }
  // Compose entry with optional fields
  const entry = {
    deviceId,
    timestamp,
    receivedAt: Math.floor(Date.now() / 1000),
  };
  if (typeof temperature === 'number') {
    entry.temperature = temperature;
  }
  if (outputs && typeof outputs === 'object') {
    entry.outputs = outputs;
  }
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

// GET /api/status/:deviceId – return the latest log entry for a device.
app.get('/api/status/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  // Find the last log for this device (by highest timestamp or receivedAt)
  const filtered = logs.filter(log => log.deviceId === deviceId);
  if (filtered.length === 0) {
    return res.status(404).json({ error: 'No logs found for device' });
  }
  // Sort by timestamp descending
  const latest = filtered.reduce((latest, current) => {
    return (!latest || current.timestamp > latest.timestamp) ? current : latest;
  }, null);
  res.json(latest);
});

// POST /api/control – queue a command to control an output on a device.
// Expects JSON with { deviceId, pin, state }. 'state' should be 0 or 1.
app.post('/api/control', (req, res) => {
  const { deviceId, pin, state } = req.body;
  if (!deviceId || typeof pin === 'undefined' || typeof state === 'undefined') {
    return res.status(400).json({ error: 'deviceId, pin and state are required' });
  }
  if (!Number.isInteger(pin)) {
    return res.status(400).json({ error: 'pin must be an integer' });
  }
  const normalizedState = state ? 1 : 0;
  // Queue command
  if (!commands[deviceId]) {
    commands[deviceId] = [];
  }
  commands[deviceId].push({ pin, state: normalizedState });
  res.json({ message: 'Command queued', command: { pin, state: normalizedState } });
});

// GET /api/commands/:deviceId – retrieve and clear the queued commands for a device.
app.get('/api/commands/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const deviceCommands = commands[deviceId] || [];
  // Clear commands after retrieval
  commands[deviceId] = [];
  res.json(deviceCommands);
});

// Start the server. When deployed to Render, PORT will be provided by the platform.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});