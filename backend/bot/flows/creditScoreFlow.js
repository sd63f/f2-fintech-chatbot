/**
 * Credit Score Flow
 * Steps: what is your score → scorecard → DPDs & Settlements → utilization → result
 */

const STEPS = ['know_your_score', 'scorecard', 'missed_payments', 'utilization'];
/** This stores all the steps of the process in order, will follow this step one by one */

async function processStep(userInput, stepIndex, flowData)
/** This function will process the user input and return the next step */ {
  const step = STEPS[stepIndex];
  const input = userInput.trim().toLowerCase();

  switch (step) {
    case 'know_your_score': {
      const knowsYScore = input.includes('yes') || input.includes('Yes') || input.includes('YES') || input.includes('y') || input === '1';
      const doesntKnow = input.includes('no') || input.includes('No') || input.includes('NO') || input.includes('n') || input === '2';

      if (!knowsYScore && !doesntKnow) {
        return {
          messages: [`Do you know your current credit score?\n\n1️⃣ Yes 😇 \n2️⃣ No 😞\n\nReply 1 or 2.`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      if (doesntKnow) {
        return {
          messages: [
            `No worries! You can check your free credit score on:\n• *PaisaBazar*: https://www.paisabazaar.com/cibil-credit-report/ \n• *CIBIL*: myscore.cibil.com\n• *Experian*: experian.in\n• \nFor now, let's assess your credit health with a few questions. 📊\n\nIn the last 6 months, have you missed any *EMI or credit card payments*?\n\n1️⃣ No missed payments\n2️⃣ 1-2 missed payments\n3️⃣ 3+ missed payments`,
          ],
          done: false,
          updatedData: { ...flowData, knowsScore: false, score: null },
        };
      }

      return {
        messages: [`Great! What is your current *CIBIL score*?\nEnter a number between 300 and 900`],
        done: false,
        updatedData: { ...flowData, knowsScore: true },
      };
    }

    case 'scorecard': {
      // If they don't know their score, this step is actually 'missed_payments'
      if (flowData.knowsScore === false) {
        return processMissedPayments(input, flowData);
      }

      const score = parseInt(input.replace(/[^0-9]/g, ''));
      if (isNaN(score) || score < 300 || score > 900) {
        return {
          messages: [`Please enter a valid credit score between 300 and 900`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [
          `Credit Score: *${score}* ${getScoreEmoji(score)}\n\nIn the last 6 months, have you missed any *loan EMI or credit card payments*?\n\n1️⃣ No missed payments\n2️⃣ 1-2 missed payments\n3️⃣ 3+ missed payments`,
        ],
        done: false,
        updatedData: { ...flowData, score },
      };
    }

    case 'missed_payments': {
      return processMissedPayments(input, flowData);
    }

    case 'utilization': {
      const raw = input.replace(/[^0-9]/g, '');
      const utilization = parseInt(raw);
      if (isNaN(utilization) || utilization < 0 || utilization > 100) {
        return {
          messages: [`Please enter your credit card utilization as a percentage (e.g., 40 for 40%)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      const result = analyzeCreditScore({ ...flowData, utilization });
      return {
        messages: buildCreditResultMessages(result),
        done: true,
        updatedData: { ...flowData, utilization, result },
      };
    }

    default:
      return { messages: ['Something went wrong. Type *menu* to restart.'], done: true, updatedData: flowData };
  }
}

function processMissedPayments(input, flowData) {
  let missedPayments;
  if (input === '1' || input.includes('no')) missedPayments = 0;
  else if (input === '2' || input.includes('1-2') || input.includes('one') || input.includes('two')) missedPayments = 1;
  else if (input === '3' || input.includes('3+') || input.includes('three') || input.includes('more')) missedPayments = 3;
  else {
    return {
      messages: [`Please select:\n1️⃣ No missed payments\n2️⃣ 1-2 missed payments\n3️⃣ 3+ missed payments`],
      done: false,
      retry: true,
      updatedData: flowData,
    };
  }

  return {
    messages: [
      `Got it! ${missedPayments === 0 ? '✅ Perfect payment history!' : '⚠️ Missed payments noted.'}\n\nWhat is your approximate *credit card utilization*? (How much of your credit limit are you using?)\n\nE.g., if your limit is ₹1,00,000 and you owe ₹40,000, enter *40* (for 40%)\n\nEnter percentage (0-100):`,
    ],
    done: false,
    updatedData: { ...flowData, missedPayments },
  };
}

function getOpeningMessage(userName) {
  return `Hi ${userName || 'there'}! 📊 Let's *analyze your credit health* in 4 quick questions.\n\nDo you know your current *CIBIL / credit score*?\n\n1️⃣ Yes, I know my score\n2️⃣ No, I don't know\n\nReply 1 or 2.`;
}

// ---- Analysis Logic ----

function analyzeCreditScore({ score, missedPayments, utilization }) {
  // Estimate score if not known
  let estimatedScore = score;
  if (!estimatedScore) {
    estimatedScore = 750; // base
    if (missedPayments === 1) estimatedScore -= 80;
    if (missedPayments >= 3) estimatedScore -= 150;
    if (utilization > 70) estimatedScore -= 60;
    else if (utilization > 40) estimatedScore -= 25;
    estimatedScore = Math.max(300, Math.min(900, estimatedScore));
  }

  const scoreCategory = getScoreCategory(estimatedScore);
  const tips = generateTips(estimatedScore, missedPayments, utilization);
  const timeToImprove = estimateTimeToImprove(estimatedScore);

  return { score: estimatedScore, isEstimated: !score, scoreCategory, missedPayments, utilization, tips, timeToImprove };
}

function getScoreCategory(score) {
  if (score >= 750) return { label: 'Excellent', emoji: '🟢', loanApproval: '95%', interestBenefit: 'Best rates' };
  if (score >= 700) return { label: 'Good', emoji: '🟡', loanApproval: '75%', interestBenefit: 'Standard rates' };
  if (score >= 650) return { label: 'Fair', emoji: '🟠', loanApproval: '50%', interestBenefit: 'Higher rates' };
  return { label: 'Poor', emoji: '🔴', loanApproval: '20%', interestBenefit: 'May be rejected' };
}

function getScoreEmoji(score) {
  if (score >= 750) return '🟢 Excellent';
  if (score >= 700) return '🟡 Good';
  if (score >= 650) return '🟠 Fair';
  return '🔴 Poor';
}

function generateTips(score, missedPayments, utilization) {
  const tips = [];

  if (missedPayments > 0) {
    tips.push('✅ Set up auto-pay for ALL EMIs & credit cards — missed payments drop score by 50-100 points');
  }

  if (utilization > 30) {
    tips.push(`✅ Reduce credit utilization below 30% (currently ~${utilization}%) — aim for ₹3 of every ₹10 limit`);
  }

  if (score < 750) {
    tips.push('✅ Do NOT close old credit cards — credit age matters (15% of score)');
    tips.push('✅ Avoid applying for multiple loans/cards in 60 days — each hard inquiry drops score by 5-10 points');
  }

  tips.push('✅ Check your credit report for errors at CIBIL.com (free once per year)');

  if (score < 650) {
    tips.push('✅ Consider a secured credit card against FD to rebuild credit history');
  }

  return tips;
}

function estimateTimeToImprove(score) {
  if (score >= 750) return null;
  if (score >= 700) return '3-6 months of consistent payments';
  if (score >= 650) return '6-12 months with discipline';
  return '12-18 months of rebuilding';
}

function buildCreditResultMessages({ score, isEstimated, scoreCategory, missedPayments, utilization, tips, timeToImprove }) {
  const msgs = [
    `📊 *Credit Score Report*\n\n` +
    `• *Score:* ${score} ${scoreCategory.emoji} *${scoreCategory.label}*${isEstimated ? ' (estimated)' : ''}\n` +
    `• *Loan Approval Chances:* ${scoreCategory.loanApproval}\n` +
    `• *Interest Rate Impact:* ${scoreCategory.interestBenefit}\n` +
    `• *Payment History:* ${missedPayments === 0 ? '✅ Clean' : `⚠️ ${missedPayments === 1 ? '1-2 missed' : '3+ missed'} payments`}\n` +
    `• *Card Utilization:* ${utilization}% ${utilization <= 30 ? '✅' : '⚠️'}` +
    (timeToImprove ? `\n\n⏱️ *Est. Time to Improve to 750+:* ${timeToImprove}` : ''),

    `💡 *Action Plan:*\n\n` +
    tips.join('\n') +
    `\n\n🔗 *Check free score:* Experian.in | CIBIL.com | Paytm\n\n` +
    `Reply *menu* to explore loans, insurance, or investments.`,
  ];

  return msgs;
}

module.exports = { processStep, getOpeningMessage, STEPS };
