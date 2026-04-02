/**
 * AI Service — Google Gemini Flash (Free Tier)
 * Used for open-ended responses and profession detection
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI = null;

function getClient() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const SYSTEM_PROMPT = `You are F2 Fintech's friendly WhatsApp AI assistant helping Indian users with financial advice. 
You specialize in:
- Home loans, personal loans, business loans, education loans
- Life insurance, health insurance, term plans
- SIP, mutual funds, fixed deposits, stock advice
- Credit score improvement

Rules:
- Reply in simple, friendly English
- Keep responses under 150 words
- Use ₹ for Indian Rupees
- Always end with an actionable suggestion
- Do NOT provide legal advice
- Do NOT promise guaranteed returns`;

/**
 * Detect profession from user's free-text reply
 * Returns: 'salaried' | 'self_employed' | 'business_owner' | 'student' | 'homemaker' | 'unknown'
 */
async function detectProfession(text) {
  const lower = text.toLowerCase();

  // Rule-based first (fast, no API call)
  const rules = {
    salaried: ['salaried', 'job', 'employee', 'working', 'office', 'salary', 'engineer', 'doctor', 'teacher', 'manager', 'software', 'it professional', 'govt', 'government'],
    business_owner: ['business', 'owner', 'entrepreneur', 'company', 'firm', 'shop', 'trade'],
    self_employed: ['freelance', 'consultant', 'self employed', 'self-employed', 'contractor', 'own work', 'independent'],
    student: ['student', 'studying', 'college', 'university', 'school', 'intern'],
    homemaker: ['homemaker', 'housewife', 'house wife', 'home maker', 'not working', 'household'],
  };

  for (const [profession, keywords] of Object.entries(rules)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      logger.debug('Profession detected via rules', { profession });
      return profession;
    }
  }

  // Fallback to Gemini
  if (!getClient()) return 'unknown';

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Classify this person's profession into one of: salaried, self_employed, business_owner, student, homemaker, unknown.
User says: "${text}"
Reply with ONLY the classification word, nothing else.`;

    const result = await model.generateContent(prompt);
    const classification = result.response.text().trim().toLowerCase();
    logger.debug('Profession detected via Gemini', { classification });
    return Object.keys(rules).includes(classification) ? classification : 'unknown';
  } catch (err) {
    logger.error('Gemini profession detection failed', { error: err.message });
    return 'unknown';
  }
}

/**
 * Generate a contextual AI response for open-ended questions
 */
async function generateResponse(userMessage, session) {
  if (!getClient()) {
    return getFallbackResponse(userMessage);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Build context from session
    const context = [
      SYSTEM_PROMPT,
      `\nUser Profile:`,
      `- Name: ${session.name || 'Unknown'}`,
      `- Profession: ${session.profession || 'Unknown'}`,
      `- Current flow: ${session.currentFlow || 'general'}`,
      `\nConversation History:`,
      ...session.history.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Bot'}: ${h.content}`),
      `\nUser: ${userMessage}`,
      `Bot:`,
    ].join('\n');

    const result = await model.generateContent(context);
    return result.response.text().trim();
  } catch (err) {
    logger.error('Gemini response generation failed', { error: err.message });
    return getFallbackResponse(userMessage);
  }
}

function getFallbackResponse(msg) {
  return `Thank you for your message! I can help you with *Loans*, *Insurance*, *Investments*, or *Credit Score*. Which would you like to explore? Reply with a number:

1️⃣ Loan
2️⃣ Insurance
3️⃣ Investment
4️⃣ Credit Score`;
}

module.exports = { detectProfession, generateResponse };
