/**
 * WhatsApp Service — Sends messages via Meta Cloud API
 */

const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://graph.facebook.com/v19.0';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Send a plain text message
 */
async function sendText(to, body) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  };

  try {
    const response = await axios.post(url, payload, { headers: getHeaders() });
    logger.debug('Text message sent', { to, messageId: response.data?.messages?.[0]?.id });
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    logger.error('Failed to send text message', { to, error: errMsg });
    throw err;
  }
}

/**
 * Send multiple messages with a short delay between them
 */
async function sendMessages(to, messages) {
  for (let i = 0; i < messages.length; i++) {
    await sendText(to, messages[i]);
    if (i < messages.length - 1) {
      await sleep(600); // avoid rate limiting
    }
  }
}

/**
 * Send an interactive button message (up to 3 buttons)
 * buttons: [{ id: 'btn_loan', title: '🏦 Loan' }, ...]
 */
async function sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map((btn) => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title.substring(0, 20) },
      })),
    },
  };

  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  };

  try {
    const response = await axios.post(url, payload, { headers: getHeaders() });
    logger.debug('Button message sent', { to });
    return response.data;
  } catch (err) {
    logger.error('Failed to send button message', { to, error: err.response?.data?.error?.message || err.message });
    // Fallback to text if buttons fail
    const fallbackText = bodyText + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
    return sendText(to, fallbackText);
  }
}

/**
 * Send an interactive list message (up to 10 items)
 * sections: [{ title: 'Financial Services', rows: [{ id, title, description }] }]
 */
async function sendList(to, bodyText, buttonLabel, sections, headerText = null) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  const interactive = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: buttonLabel.substring(0, 20),
      sections,
    },
  };

  if (headerText) interactive.header = { type: 'text', text: headerText };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  };

  try {
    const response = await axios.post(url, payload, { headers: getHeaders() });
    logger.debug('List message sent', { to });
    return response.data;
  } catch (err) {
    logger.error('Failed to send list message', { to, error: err.response?.data?.error?.message || err.message });
    // Fallback to text
    const fallbackLines = sections.flatMap((s) => s.rows.map((r, i) => `${i + 1}. ${r.title}`));
    return sendText(to, bodyText + '\n\n' + fallbackLines.join('\n'));
  }
}

/**
 * Send an audio voice message (OGG file URL)
 */
async function sendAudio(to, audioUrl) {
  if (!process.env.ENABLE_VOICE || process.env.ENABLE_VOICE === 'false') {
    logger.debug('Voice disabled — skipping audio send');
    return null;
  }

  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'audio',
    audio: { link: audioUrl },
  };

  try {
    const response = await axios.post(url, payload, { headers: getHeaders() });
    logger.debug('Audio message sent', { to, audioUrl });
    return response.data;
  } catch (err) {
    logger.error('Failed to send audio message', { to, error: err.response?.data?.error?.message || err.message });
    throw err;
  }
}

/**
 * Mark a message as read
 */
async function markAsRead(messageId) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  try {
    await axios.post(
      url,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: getHeaders() }
    );
  } catch (err) {
    // Non-critical, just log
    logger.debug('Could not mark message as read', { messageId });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendText, sendMessages, sendButtons, sendList, sendAudio, markAsRead };
