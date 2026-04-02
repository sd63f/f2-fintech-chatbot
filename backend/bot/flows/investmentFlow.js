/**
 * Investment Flow — SIP / MF / FD recommendation
 * Steps: goal → monthly_amount → risk_appetite → result
 */

const STEPS = ['goal', 'monthly_amount', 'risk_appetite', 'horizon'];

const GOALS = {
  '1': 'Wealth Growth',
  '2': 'Retirement Planning',
  '3': 'Child Education',
  '4': 'Tax Saving',
  'wealth': 'Wealth Growth',
  'retirement': 'Retirement Planning',
  'child': 'Child Education',
  'education': 'Child Education',
  'tax': 'Tax Saving',
};

const RISK_LEVELS = {
  '1': 'Low',
  '2': 'Medium',
  '3': 'High',
  'low': 'Low',
  'safe': 'Low',
  'medium': 'Medium',
  'moderate': 'Medium',
  'high': 'High',
  'aggressive': 'High',
};

// Expected CAGR based on risk level
const RETURNS = {
  Low: { min: 6.5, max: 8.0, instruments: ['PPF', 'Fixed Deposits', 'Debt Mutual Funds', 'Government Bonds'] },
  Medium: { min: 10.0, max: 13.0, instruments: ['Balanced Mutual Funds', 'Index Funds (Nifty 50)', 'Hybrid Funds'] },
  High: { min: 14.0, max: 18.0, instruments: ['Equity Mutual Funds', 'Small Cap Funds', 'Direct Stocks'] },
};

async function processStep(userInput, stepIndex, flowData) {
  const step = STEPS[stepIndex];
  const input = userInput.trim().toLowerCase();

  switch (step) {
    case 'goal': {
      const goal = GOALS[input] || GOALS[input.split(' ')[0]];
      if (!goal) {
        return {
          messages: [
            `Please select your investment goal:\n\n1️⃣ Wealth Growth\n2️⃣ Retirement Planning\n3️⃣ Child Education\n4️⃣ Tax Saving (80C)\n\nReply with a number (1-4).`,
          ],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Goal: *${goal}* 🎯\n\nHow much can you invest *every month*?\nEnter in ₹ (minimum ₹500, e.g., 5000)`,
        ],
        done: false,
        updatedData: { ...flowData, goal },
      };
    }

    case 'monthly_amount': {
      const raw = input.replace(/[,₹\s]/g, '');
      const monthlyAmount = parseFloat(raw);
      if (isNaN(monthlyAmount) || monthlyAmount < 500) {
        return {
          messages: [`Please enter a valid monthly investment amount (minimum ₹500)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Monthly SIP: *₹${formatINR(monthlyAmount)}* ✅\n\nWhat is your *risk appetite*?\n\n1️⃣ Low (safe, stable returns)\n2️⃣ Medium (balanced growth)\n3️⃣ High (aggressive growth)\n\nReply with a number (1-3).`,
        ],
        done: false,
        updatedData: { ...flowData, monthlyAmount },
      };
    }

    case 'risk_appetite': {
      const riskLevel = RISK_LEVELS[input];
      if (!riskLevel) {
        return {
          messages: [`Please select your risk level:\n1️⃣ Low\n2️⃣ Medium\n3️⃣ High`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Risk Level: *${riskLevel}* ✅\n\nFor how many years do you want to invest?\nEnter number of years (e.g., 10)`,
        ],
        done: false,
        updatedData: { ...flowData, riskLevel },
      };
    }

    case 'horizon': {
      const years = parseInt(input.replace(/[^0-9]/g, ''));
      if (isNaN(years) || years < 1 || years > 50) {
        return {
          messages: [`Please enter a valid number of years (e.g., 5, 10, 20)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      const result = calculateInvestment({ ...flowData, years });
      return {
        messages: buildInvestmentResultMessages(result),
        done: true,
        updatedData: { ...flowData, years, result },
      };
    }

    default:
      return { messages: ['Something went wrong. Type *menu* to restart.'], done: true, updatedData: flowData };
  }
}

function getOpeningMessage(userName) {
  return `Hello ${userName || 'there'}! 📈 Let's build your *investment plan* in 4 steps.\n\nWhat is your *primary investment goal*?\n\n1️⃣ Wealth Growth\n2️⃣ Retirement Planning\n3️⃣ Child Education\n4️⃣ Tax Saving (80C)\n\nReply with a number (1-4).`;
}

// ---- SIP Calculation ----

function calculateInvestment({ goal, monthlyAmount, riskLevel, years }) {
  const { min: minRate, max: maxRate, instruments } = RETURNS[riskLevel];
  const months = years * 12;

  const calc = (annualRate) => {
    const r = annualRate / 12 / 100;
    return monthlyAmount * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  };

  const totalInvested = monthlyAmount * months;
  const minCorpus = Math.round(calc(minRate));
  const maxCorpus = Math.round(calc(maxRate));
  const midCorpus = Math.round((minCorpus + maxCorpus) / 2);
  const wealthGain = midCorpus - totalInvested;

  // Tax saving specific
  let taxBenefit = null;
  if (goal === 'Tax Saving (80C)') {
    const annualInvestment = Math.min(monthlyAmount * 12, 150000);
    taxBenefit = Math.round(annualInvestment * 0.3); // 30% tax bracket
  }

  return { goal, monthlyAmount, riskLevel, years, instruments, totalInvested, minCorpus, maxCorpus, midCorpus, wealthGain, taxBenefit };
}

function buildInvestmentResultMessages({ goal, monthlyAmount, riskLevel, years, instruments, totalInvested, minCorpus, maxCorpus, midCorpus, wealthGain, taxBenefit }) {
  const msgs = [
    `📊 *Your Investment Projection*\n\n` +
    `• *Goal:* ${goal}\n` +
    `• *Monthly SIP:* ₹${formatINR(monthlyAmount)}\n` +
    `• *Duration:* ${years} years\n` +
    `• *Risk:* ${riskLevel}\n\n` +
    `💰 *Results:*\n` +
    `• Total Invested: ₹${formatINR(totalInvested)}\n` +
    `• Expected Corpus: ₹${formatINR(minCorpus)} – ₹${formatINR(maxCorpus)}\n` +
    `• Estimated Wealth Gain: *₹${formatINR(wealthGain)}+* 🚀`,

    `📋 *Recommended Instruments for ${riskLevel} Risk:*\n` +
    instruments.map((i, n) => `${n + 1}. ${i}`).join('\n') +
    (taxBenefit ? `\n\n🏷️ *Tax Benefit (80C):* Save up to ₹${formatINR(taxBenefit)}/year` : '') +
    `\n\n🔗 *Start now on:* Groww, Zerodha Coin, Paytm Money, ET Money\n\n` +
    `*Tip:* Increase SIP by 10% every year (Step-up SIP) to build wealth faster!\n\n` +
    `Reply *menu* for other services.`,
  ];

  return msgs;
}

function formatINR(num) {
  return Number(num).toLocaleString('en-IN');
}

module.exports = { processStep, getOpeningMessage, STEPS };
