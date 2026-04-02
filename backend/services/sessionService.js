/**
 * Session Service — In-memory store for testing
 * Tracks each user's conversation state, name, profession, flow data
 */

const logger = require('../utils/logger');

// Map<phoneNumber, sessionObject>
const sessions = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get or create a session for a given phone number
 */
function getSession(phone) {
  if (!sessions.has(phone)) {
    const session = createSession(phone);
    sessions.set(phone, session);
    logger.debug(`New session created`, { phone });
    return session;
  }

  const session = sessions.get(phone);

  // Auto-reset expired sessions
  const now = Date.now();
  if (now - session.lastActivity > SESSION_TTL_MS) {
    logger.info(`Session expired, resetting`, { phone });
    const fresh = createSession(phone);
    sessions.set(phone, fresh);
    return fresh;
  }

  session.lastActivity = now;
  return session;
}

/**
 * Update specific fields in a session
 */
function updateSession(phone, updates) {
  const session = getSession(phone);
  Object.assign(session, updates, { lastActivity: Date.now() });
  sessions.set(phone, session);
  logger.debug(`Session updated`, { phone, state: session.state });
  return session;
}

/**
 * Add a message to conversation history (for AI context)
 */
function addToHistory(phone, role, content) {
  const session = getSession(phone);
  session.history.push({ role, content, timestamp: new Date().toISOString() });

  // Keep only last 20 messages to avoid memory bloat
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  sessions.set(phone, session);
}

/**
 * Clear/reset a session
 */
function clearSession(phone) {
  sessions.delete(phone);
  logger.info(`Session cleared`, { phone });
}

/**
 * Get all active sessions (for dashboard)
 */
function getAllSessions() {
  const result = [];
  sessions.forEach((session, phone) => {
    result.push({ phone, ...session });
  });
  return result;
}

/**
 * Get session stats (for dashboard)
 */
function getStats() {
  return {
    total: sessions.size,
    byState: [...sessions.values()].reduce((acc, s) => {
      acc[s.state] = (acc[s.state] || 0) + 1;
      return acc;
    }, {}),
    byFlow: [...sessions.values()].reduce((acc, s) => {
      if (s.currentFlow) acc[s.currentFlow] = (acc[s.currentFlow] || 0) + 1;
      return acc;
    }, {}),
  };
}

// ---- Internal ----

function createSession(phone) {
  return {
    phone,
    name: null,
    profession: null,
    state: 'INIT',          // INIT | ASKED_NAME | MENU | IN_FLOW | COMPLETED
    currentFlow: null,       // loan | insurance | investment | credit
    flowStep: 0,
    flowData: {},
    history: [],
    messageCount: 0,
    createdAt: new Date().toISOString(),
    lastActivity: Date.now(),
  };
}

module.exports = {
  getSession,
  updateSession,
  addToHistory,
  clearSession,
  getAllSessions,
  getStats,
};
