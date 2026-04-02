/**
 * Bot Engine — Core conversation state machine
 * Reads session → identifies profession → routes to the right flow
 */

const sessionService = require('../services/sessionService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

const loanFlow = require('./flows/loanFlow');
const insuranceFlow = require('./flows/insuranceFlow');
const investmentFlow = require('./flows/investmentFlow');
const creditScoreFlow = require('./flows/creditScoreFlow');

const FLOWS = {
  loan: loanFlow,
  insurance: insuranceFlow,
  investment: investmentFlow,
  credit: creditScoreFlow,
};

const FLOW_TRIGGERS = {
  loan: ['loan', '1', 'home loan', 'personal loan', 'business loan', 'education loan', 'emi', 'borrow'],
  insurance: ['insurance', '2', 'insure', 'cover', 'policy', 'term', 'health plan', 'vehicle insurance', 'life insurance'],
  investment: ['invest', '3', 'sip', 'mutual fund', 'mf', 'stock', 'fd', 'fixed deposit', 'ppf', 'wealth', 'grow money', 'returns'],
  credit: ['credit', '4', 'cibil', 'score', 'credit score', 'credit report', 'credit card'],
};

const MENU_TEXT = `Here's what I can help you with today:\n\n1️⃣ *Loan* — Check eligibility & EMI\n2️⃣ *Insurance* — Find the right cover\n3️⃣ *Investment* — Grow your wealth (SIP/MF/FD)\n4️⃣ *Credit Score* — Check & improve\n\nReply with a number or keyword.`;

const RESET_KEYWORDS = ['restart', 'reset', 'start over', 'menu', 'back', 'main menu', 'hi', 'hello', 'hey', 'start'];

/**
 * Main entry point: process an incoming message and return response messages
 * Returns: string[]
 */
async function processMessage(phone, userText, userName) {
  const session = sessionService.getSession(phone);
  const input = userText.trim();
  const inputLower = input.toLowerCase();

  // Log incoming
  logger.info('Processing message', { phone, state: session.state, input: input.substring(0, 50) });

  // Save to history
  sessionService.addToHistory(phone, 'user', input);
  sessionService.updateSession(phone, { messageCount: (session.messageCount || 0) + 1 });

  // ---- Handle reset commands ----
  if (RESET_KEYWORDS.some((kw) => inputLower === kw) && session.state !== 'INIT') {
    if (inputLower === 'menu' || inputLower === 'main menu' || inputLower === 'back') {
      sessionService.updateSession(phone, {
        state: 'MENU',
        currentFlow: null,
        flowStep: 0,
        flowData: {},
      });
      return [`Welcome back, ${session.name || 'there'}! 😊\n\n${MENU_TEXT}`];
    }

    // Full restart
    sessionService.clearSession(phone);
    return await processMessage(phone, 'hi', userName);
  }

  // ---- State Machine ----
  switch (session.state) {
    case 'INIT':
      return handleInit(phone, input, session, userName);

    case 'ASKED_NAME':
      return handleAskedName(phone, input, session);

    case 'ASKED_PROFESSION':
      return handleAskedProfession(phone, input, session);

    case 'MENU':
      return handleMenu(phone, input, session);

    case 'IN_FLOW':
      return handleInFlow(phone, input, session);

    case 'COMPLETED':
      return handleCompleted(phone, input, session);

    default:
      sessionService.clearSession(phone);
      return await processMessage(phone, 'hi', userName);
  }
}

// ---- State Handlers ----

async function handleInit(phone, input, session, userName) {
  // Use name from WhatsApp profile if available
  const name = userName && userName !== 'Unknown' ? userName : null;

  if (name) {
    sessionService.updateSession(phone, { state: 'ASKED_PROFESSION', name });
    return [
      `👋 Welcome to *F2 Fintech*, ${name}!\n\nI'm your personal financial assistant, here to help you with loans, insurance, investments, and credit score.\n\nTo get started, could you tell me a bit about yourself? Are you:\n• Salaried (working job)\n• Self-employed / Freelancer\n• Business Owner\n• Student\n\nJust type it in your own words! 😊`,
    ];
  }

  sessionService.updateSession(phone, { state: 'ASKED_NAME' });
  return [
    `👋 Welcome to *F2 Fintech*!\n\nI'm your personal financial assistant here to help you with:\n💰 Loans | 🛡️ Insurance | 📈 Investments | 📊 Credit Score\n\nMay I know your *name* to get started?`,
  ];
}

async function handleAskedName(phone, input, session) {
  // Extract name (take first 1-2 words, capitalize)
  const nameParts = input.trim().split(/\s+/).slice(0, 2);
  const name = nameParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  if (name.length < 2 || name.length > 50) {
    return [`I didn't catch that! What's your name? 😊`];
  }

  sessionService.updateSession(phone, { state: 'ASKED_PROFESSION', name });

  return [
    `Nice to meet you, *${name}*! 🙏\n\nTo give you the best financial advice, could you tell me about your profession?\n\nFor example:\n• I am a salaried employee\n• I run my own business\n• I am a freelancer\n• I am a student\n\nJust type it in your own words!`,
  ];
}

async function handleAskedProfession(phone, input, session) {
  const profession = await aiService.detectProfession(input);

  const professionLabels = {
    salaried: 'Salaried Professional',
    self_employed: 'Self-Employed',
    business_owner: 'Business Owner',
    student: 'Student',
    homemaker: 'Homemaker',
    unknown: 'Individual',
  };

  const label = professionLabels[profession] || 'Individual';

  sessionService.updateSession(phone, { state: 'MENU', profession });

  return [
    `Perfect, ${session.name}! Welcome as a *${label}* 🎉\n\nI'm all set to help you make smart financial decisions.\n\n${MENU_TEXT}`,
  ];
}

async function handleMenu(phone, input, session) {
  const inputLower = input.toLowerCase();

  // Detect which flow to start
  let targetFlow = null;
  for (const [flow, triggers] of Object.entries(FLOW_TRIGGERS)) {
    if (triggers.some((t) => inputLower.includes(t) || inputLower === t)) {
      targetFlow = flow;
      break;
    }
  }

  if (!targetFlow) {
    // Try AI if enabled
    if (process.env.ENABLE_AI !== 'false') {
      const aiReply = await aiService.generateResponse(input, session);
      sessionService.addToHistory(phone, 'assistant', aiReply);
      return [aiReply];
    }

    return [`I didn't understand that. Please select an option:\n\n${MENU_TEXT}`];
  }

  // Start the flow
  const flowHandler = FLOWS[targetFlow];
  const openingMessage = flowHandler.getOpeningMessage(session.name);

  sessionService.updateSession(phone, {
    state: 'IN_FLOW',
    currentFlow: targetFlow,
    flowStep: 0,
    flowData: { applicantName: session.name, profession: session.profession },
  });

  sessionService.addToHistory(phone, 'assistant', openingMessage);
  return [openingMessage];
}

async function handleInFlow(phone, input, session) {
  const flowHandler = FLOWS[session.currentFlow];
  if (!flowHandler) {
    sessionService.updateSession(phone, { state: 'MENU', currentFlow: null });
    return [`Let's start fresh. ${MENU_TEXT}`];
  }

  const { messages, done, retry, updatedData } = await flowHandler.processStep(
    input,
    session.flowStep,
    session.flowData
  );

  if (done) {
    sessionService.updateSession(phone, {
      state: 'COMPLETED',
      flowData: updatedData,
      currentFlow: session.currentFlow,
    });
  } else if (!retry) {
    // Only advance step if not retrying
    sessionService.updateSession(phone, {
      flowStep: session.flowStep + 1,
      flowData: updatedData,
    });
  } else {
    sessionService.updateSession(phone, { flowData: updatedData });
  }

  messages.forEach((m) => sessionService.addToHistory(phone, 'assistant', m));
  return messages;
}

async function handleCompleted(phone, input, session) {
  const inputLower = input.toLowerCase();

  if (inputLower === 'menu' || inputLower === 'main menu') {
    sessionService.updateSession(phone, { state: 'MENU', currentFlow: null, flowStep: 0, flowData: {} });
    return [`Here we go again, ${session.name}! 😊\n\n${MENU_TEXT}`];
  }

  // Check if they want to continue in same flow or new service
  for (const [flow, triggers] of Object.entries(FLOW_TRIGGERS)) {
    if (triggers.some((t) => inputLower.includes(t))) {
      sessionService.updateSession(phone, {
        state: 'MENU',
        currentFlow: null,
        flowStep: 0,
        flowData: {},
      });
      return await handleMenu(phone, input, { ...session, state: 'MENU' });
    }
  }

  return [
    `Thanks ${session.name}! Is there anything else I can help you with?\n\n${MENU_TEXT}\n\nOr type *restart* to start a new session.`,
  ];
}

module.exports = { processMessage };
