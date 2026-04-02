/**
 * Webhook Route — Handles Meta WhatsApp Cloud API
 * GET  /webhook → Verification
 * POST /webhook → Incoming messages
 */

const express = require('express');
const router = express.Router();
const botEngine = require('../bot/botEngine');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

// ---- GET /webhook — Meta Verification Challenge ----
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('Webhook verification request', { mode, token: token ? '***' : 'missing' });

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('✅ Webhook verified successfully!');
    return res.status(200).send(challenge);
  }

  logger.error('❌ Webhook verification failed — token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
});

// ---- POST /webhook — Incoming Messages ----
router.post('/', async (req, res) => {
  // Always respond 200 immediately to avoid Meta retrying
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      logger.debug('Ignoring non-WhatsApp webhook event');
      return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        // Handle message status updates (delivered, read, etc.) — just log
        if (value.statuses) {
          const status = value.statuses[0];
          logger.debug('Message status update', { id: status.id, status: status.status });
          continue;
        }

        // Handle incoming messages
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const message of messages) {
          await processIncomingMessage(message, contacts, value.metadata);
        }
      }
    }
  } catch (err) {
    logger.error('Error processing webhook', { error: err.message, stack: err.stack });
  }
});

async function processIncomingMessage(message, contacts, metadata) {
  const phone = message.from;
  const messageId = message.id;
  const messageType = message.type;

  // Get user's display name from contacts
  const contact = contacts.find((c) => c.wa_id === phone);
  const userName = contact?.profile?.name || 'Unknown';

  logger.info('Incoming message', {
    from: phone,
    name: userName,
    type: messageType,
    preview: getMessagePreview(message),
  });

  // Mark as read (non-blocking)
  whatsappService.markAsRead(messageId).catch(() => {});

  // Extract text from different message types
  let userText = '';

  switch (messageType) {
    case 'text':
      userText = message.text?.body || '';
      break;

    case 'interactive': {
      // Button or list reply
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        userText = interactive.button_reply?.id || interactive.button_reply?.title || '';
      } else if (interactive.type === 'list_reply') {
        userText = interactive.list_reply?.id || interactive.list_reply?.title || '';
      }
      break;
    }

    case 'audio':
    case 'voice':
      // Voice message — acknowledge but can't process without STT
      await whatsappService.sendText(
        phone,
        `🎤 I received your voice message, but I currently work best with text.\n\nPlease type your message and I'll help you right away! 😊`
      );
      return;

    case 'image':
    case 'document':
      await whatsappService.sendText(
        phone,
        `📎 I received your file! For now, I work with text messages.\n\nType *menu* to see how I can help you with financial advice. 💰`
      );
      return;

    default:
      logger.debug('Unsupported message type', { type: messageType });
      userText = '';
  }

  if (!userText) {
    logger.debug('Empty message body, skipping');
    return;
  }

  try {
    // Process through bot engine
    const responseMessages = await botEngine.processMessage(phone, userText, userName);

    // Send responses
    await whatsappService.sendMessages(phone, responseMessages);
  } catch (err) {
    logger.error('Bot engine error', { phone, error: err.message });
    await whatsappService.sendText(
      phone,
      `I encountered a small issue. Please try again or type *restart* to start fresh. 🙏`
    );
  }
}

function getMessagePreview(message) {
  if (message.type === 'text') return message.text?.body?.substring(0, 60);
  if (message.type === 'interactive') return `[interactive:${message.interactive?.type}]`;
  return `[${message.type}]`;
}

module.exports = router;
