require('dotenv').config();

const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const sessionService = require('./services/sessionService');
const webhookRouter = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Request logger
app.use((req, res, next) => {
  if (req.path !== '/health') {
    logger.debug(`${req.method} ${req.path}`);
  }
  next();
});

// ---- Routes ----

// WhatsApp Webhook
app.use('/webhook', webhookRouter);

// Health Check
app.get('/health', (req, res) => {
  const stats = sessionService.getStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessions: stats,
    env: {
      meta: !!process.env.META_ACCESS_TOKEN,
      gemini: !!process.env.GEMINI_API_KEY,
      googleTTS: !!process.env.GOOGLE_CLOUD_API_KEY,
      voiceEnabled: process.env.ENABLE_VOICE === 'true',
      aiEnabled: process.env.ENABLE_AI !== 'false',
    },
  });
});

// Dashboard API — Active sessions
app.get('/api/sessions', (req, res) => {
  const sessions = sessionService.getAllSessions().map((s) => ({
    phone: s.phone.replace(/(\d{2})\d{8}(\d{2})/, '$1****$2'), // mask for privacy
    name: s.name,
    state: s.state,
    currentFlow: s.currentFlow,
    messageCount: s.messageCount,
    lastActivity: new Date(s.lastActivity).toISOString(),
  }));
  res.json({ sessions, stats: sessionService.getStats() });
});

// Dashboard API — Test bot locally (without WhatsApp)
app.post('/api/test', async (req, res) => {
  const { phone = 'test_user', message, name = 'Test User' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const botEngine = require('./bot/botEngine');
    const responses = await botEngine.processMessage(phone, message, name);
    res.json({ responses, session: sessionService.getSession(phone) });
  } catch (err) {
    logger.error('Test endpoint error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Dashboard API — Reset test session
app.delete('/api/test/:phone', (req, res) => {
  sessionService.clearSession(req.params.phone);
  res.json({ cleared: true });
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---- Error Handler ----
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ---- Start ----
app.listen(PORT, () => {
  logger.info(`🚀 F2 Fintech Bot Server started`);
  logger.info(`📡 Port: ${PORT}`);
  logger.info(`🔗 Webhook URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}/webhook`);
  logger.info(`🧪 Test API: POST http://localhost:${PORT}/api/test`);
  logger.info(`📊 Health: http://localhost:${PORT}/health`);

  if (!process.env.META_ACCESS_TOKEN) {
    logger.warn('⚠️  META_ACCESS_TOKEN not set — WhatsApp sending disabled (test mode only)');
  }
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('⚠️  GEMINI_API_KEY not set — AI responses disabled (rule-based only)');
  }
});

module.exports = app;
