/**
 * Loan Flow — Step-by-step loan eligibility checker
 * Steps: loan_type → amount → income → existing_emis → result
 */

const STEPS = ['loan_type', 'amount', 'income', 'existing_emis'];

const LOAN_TYPES = {
  '1': 'Home Loan',
  '2': 'Personal Loan',
  '3': 'Business Loan',
  '4': 'Education Loan',
  'home': 'Home Loan',
  'personal': 'Personal Loan',
  'business': 'Business Loan',
  'education': 'Education Loan',
};

const INTEREST_RATES = {
  'Home Loan': 8.5,
  'Personal Loan': 12.0,
  'Business Loan': 11.0,
  'Education Loan': 9.5,
};

/**
 * Process a step in the loan flow
 * Returns: { messages: string[], done: boolean, updatedData: {} }
 */
async function processStep(userInput, stepIndex, flowData) {
  const step = STEPS[stepIndex];
  const input = userInput.trim();

  switch (step) {
    case 'loan_type': {
      const loanType = LOAN_TYPES[input.toLowerCase()] || LOAN_TYPES[input];
      if (!loanType) {
        return {
          messages: [
            `I didn't catch that. Please select your loan type:\n\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Business Loan\n4️⃣ Education Loan\n\nReply with a number (1-4).`,
          ],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Got it! *${loanType}* 🏦\n\nHow much loan amount do you need?\nPlease enter the amount in ₹ (e.g., 500000 for ₹5 Lakhs)`,
        ],
        done: false,
        updatedData: { ...flowData, loanType },
      };
    }

    case 'amount': {
      const raw = input.replace(/[,₹\s]/g, '');
      const amount = parseFloat(raw);
      if (isNaN(amount) || amount < 10000) {
        return {
          messages: [`Please enter a valid loan amount in numbers (e.g., 500000 for ₹5 Lakhs)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Noted! Loan amount: *₹${formatINR(amount)}* ✅\n\nWhat is your *monthly income*? (Enter in ₹, e.g., 50000)`,
        ],
        done: false,
        updatedData: { ...flowData, loanAmount: amount },
      };
    }

    case 'income': {
      const raw = input.replace(/[,₹\s]/g, '');
      const income = parseFloat(raw);
      if (isNaN(income) || income < 1000) {
        return {
          messages: [`Please enter your monthly income in numbers (e.g., 50000)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Monthly income: *₹${formatINR(income)}* ✅\n\nDo you have any existing loans or EMIs?\nEnter total existing EMI per month (₹) or type *0* if none.`,
        ],
        done: false,
        updatedData: { ...flowData, monthlyIncome: income },
      };
    }

    case 'existing_emis': {
      const raw = input.replace(/[,₹\s]/g, '');
      const existingEMI = parseFloat(raw) || 0;

      const result = calculateLoanEligibility({
        ...flowData,
        existingEMI,
      });

      return {
        messages: buildLoanResultMessages(result, flowData),
        done: true,
        updatedData: { ...flowData, existingEMI, result },
      };
    }

    default:
      return { messages: ['Something went wrong. Type *menu* to restart.'], done: true, updatedData: flowData };
  }
}

/**
 * First message shown when loan flow starts
 */
function getOpeningMessage(userName) {
  return `Great choice, ${userName || 'there'}! 🏦 Let's check your *loan eligibility* in just 4 quick questions.\n\nFirst, what type of loan are you looking for?\n\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Business Loan\n4️⃣ Education Loan\n\nReply with a number (1-4).`;
}

// ---- Calculation Logic ----

function calculateLoanEligibility({ loanType, loanAmount, monthlyIncome, existingEMI }) {
  const rate = INTEREST_RATES[loanType] || 11.0;
  const maxEMICapacity = monthlyIncome * 0.5 - existingEMI; // FOIR: 50%
  const tenureMonths = loanType === 'Home Loan' ? 240 : loanType === 'Education Loan' ? 84 : 60;

  // Max eligible amount based on EMI capacity
  const monthlyRate = rate / 12 / 100;
  const maxEligibleAmount =
    maxEMICapacity > 0
      ? (maxEMICapacity * ((Math.pow(1 + monthlyRate, tenureMonths) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, tenureMonths))))
      : 0;

  // EMI for requested amount
  const requestedEMI =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);

  const isEligible = maxEligibleAmount >= loanAmount && maxEMICapacity > 0;

  return {
    loanType,
    loanAmount,
    monthlyIncome,
    existingEMI,
    requestedEMI: Math.round(requestedEMI),
    maxEligibleAmount: Math.round(maxEligibleAmount),
    tenureMonths,
    interestRate: rate,
    isEligible,
  };
}

function buildLoanResultMessages(result, flowData) {
  const tenureYears = Math.round(result.tenureMonths / 12);
  const msgs = [];

  if (result.isEligible) {
    msgs.push(
      `🎉 *Great News, ${flowData.applicantName || 'there'}!*\n\nBased on your profile:\n\n` +
      `✅ *Loan Type:* ${result.loanType}\n` +
      `✅ *Requested Amount:* ₹${formatINR(result.loanAmount)}\n` +
      `✅ *Estimated EMI:* ₹${formatINR(result.requestedEMI)}/month\n` +
      `✅ *Tenure:* ${tenureYears} years\n` +
      `✅ *Interest Rate:* ${result.interestRate}% p.a.\n\n` +
      `You appear *eligible* for this loan! 🙌`
    );
    msgs.push(
      `💡 *Next Steps:*\n\n` +
      `1. Keep your credit score above 750\n` +
      `2. Gather: Salary slips, bank statements (6 months), Aadhaar, PAN\n` +
      `3. Compare offers from SBI, HDFC, ICICI\n\n` +
      `Would you like to explore more options? Reply:\n*menu* — Main Menu\n*restart* — Start over`
    );
  } else {
    const shortfall = result.loanAmount - result.maxEligibleAmount;
    msgs.push(
      `📊 *Loan Eligibility Report*\n\n` +
      `• *Loan Type:* ${result.loanType}\n` +
      `• *Requested:* ₹${formatINR(result.loanAmount)}\n` +
      `• *Max Eligible:* ₹${formatINR(Math.max(0, result.maxEligibleAmount))}\n` +
      `• *Monthly Income:* ₹${formatINR(result.monthlyIncome)}\n` +
      `• *Existing EMIs:* ₹${formatINR(result.existingEMI)}\n\n` +
      `⚠️ Based on your current income & obligations, you may not qualify for the full amount.`
    );
    msgs.push(
      `💡 *How to improve eligibility:*\n\n` +
      `1. Add a co-applicant (spouse/parent) to boost income\n` +
      `2. Clear existing loans to reduce EMI burden\n` +
      `3. Apply for ₹${formatINR(Math.max(0, result.maxEligibleAmount))} instead\n` +
      `4. Improve credit score to 750+\n\n` +
      `Reply *menu* to explore other options or *restart* to try again.`
    );
  }

  return msgs;
}

function formatINR(num) {
  return Number(num).toLocaleString('en-IN');
}

module.exports = { processStep, getOpeningMessage, STEPS };
