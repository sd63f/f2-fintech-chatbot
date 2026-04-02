/**
 * Insurance Flow — Policy recommendation engine
 * Steps: insurance_type → age → dependents → annual_income → result
 */

const STEPS = ['insurance_type', 'age', 'dependents', 'annual_income'];

const INSURANCE_TYPES = {
  '1': 'Term Life Insurance',
  '2': 'Health Insurance',
  '3': 'Auto Insurance',
  'term': 'Term Life Insurance',
  'life': 'Term Life Insurance',
  'health': 'Health Insurance',
  'auto': 'Auto Insurance',
  'car': 'Auto Insurance',
  'bike': 'Auto Insurance',
};

async function processStep(userInput, stepIndex, flowData) {
  const step = STEPS[stepIndex];
  const input = userInput.trim().toLowerCase();

  switch (step) {
    case 'insurance_type': {
      const insuranceType = INSURANCE_TYPES[input] || INSURANCE_TYPES[input.split(' ')[0]];
      if (!insuranceType) {
        return {
          messages: [
            `Please select the type of insurance:\n\n1️⃣ Term Life Insurance\n2️⃣ Health Insurance\n3️⃣ Vehicle Insurance\n4️⃣ Life Insurance (Endowment)\n\nReply with a number (1-4).`,
          ],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      const nextQuestion = insuranceType === 'Vehicle Insurance'
        ? `What is the current value of your vehicle?`
        : `What is your age of the vehicle?`;

      const nextDataKey = insuranceType === 'Vehicle Insurance' ? 'age' : 'age';

      return {
        messages: [`Good choice! *${insuranceType}* 🛡️\n\n${nextQuestion}`],
        done: false,
        updatedData: { ...flowData, insuranceType },
      };
    }

    case 'age': {
      const age = parseInt(input.replace(/[^0-9]/g, ''));
      if (isNaN(age) || age < 1 || age > 100) {
        return {
          messages: [`Please enter a valid age (in years, e.g., 30)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      if (flowData.insuranceType === 'Vehicle Insurance') {
        // 'age' field stores vehicle value for vehicle insurance
        return {
          messages: [`Vehicle value: *₹${formatINR(age)}*\n\nWhat type of vehicle?\n1️⃣ Car\n2️⃣ Bike/Scooter`],
          done: false,
          updatedData: { ...flowData, vehicleValue: age },
        };
      }

      return {
        messages: [`Age: *${age} years* ✅\n\nHow many *dependents* do you have? \nEnter a number`],
        done: false,
        updatedData: { ...flowData, age },
      };
    }

    case 'dependents': {
      // For vehicle insurance, this step captures car/bike type
      if (flowData.insuranceType === 'Vehicle Insurance') {
        const vehicleType = input.includes('1') || input.includes('car') ? 'Car' : 'Bike/Scooter';
        const result = calculateVehicleInsurance({ ...flowData, vehicleType });
        return {
          messages: buildVehicleResultMessages(result),
          done: true,
          updatedData: { ...flowData, vehicleType, result },
        };
      }

      const dependents = parseInt(input.replace(/[^0-9]/g, ''));
      if (isNaN(dependents) || dependents < 0) {
        return {
          messages: [`Please enter the number of dependents (e.g., 2, or 0 if none)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      return {
        messages: [`Dependents: *${dependents}* ✅\n\nWhat is your *annual income*? (Enter in ₹, e.g., 600000 for 6 Lakhs)`],
        done: false,
        updatedData: { ...flowData, dependents },
      };
    }

    case 'annual_income': {
      const raw = input.replace(/[,₹\s]/g, '');
      const annualIncome = parseFloat(raw);
      if (isNaN(annualIncome) || annualIncome < 10000) {
        return {
          messages: [`Please enter your annual income in numbers (e.g., 600000)`],
          done: false,
          retry: true,
          updatedData: flowData,
        };
      }

      const result = calculateInsurance({ ...flowData, annualIncome });
      return {
        messages: buildInsuranceResultMessages(result),
        done: true,
        updatedData: { ...flowData, annualIncome, result },
      };
    }

    default:
      return { messages: ['Something went wrong. Type *menu* to restart.'], done: true, updatedData: flowData };
  }
}

function getOpeningMessage(userName) {
  return `Welcome, ${userName || 'there'}! 🛡️ Let's find the *right insurance* for you in 4 quick steps.\n\nWhat type of insurance are you looking for?\n\n1️⃣ Term Life Insurance\n2️⃣ Health Insurance\n3️⃣ Vehicle Insurance\n4️⃣ Life Insurance (Endowment)\n\nReply with a number (1-4).`;
}

// ---- Calculation Logic ----

function calculateInsurance({ insuranceType, age, dependents, annualIncome }) {
  const monthlyIncome = annualIncome / 12;

  let coverAmount, annualPremium, recommendation, keyBenefits;

  if (insuranceType === 'Term Life Insurance') {
    // Cover = 15-20x annual income
    coverAmount = annualIncome * (dependents > 2 ? 20 : 15);
    // Premium rough estimate: ₹8-12 per ₹1000 cover based on age
    const ratePerThousand = age < 30 ? 8 : age < 40 ? 10 : age < 50 ? 14 : 20;
    annualPremium = Math.round((coverAmount / 1000) * ratePerThousand);
    recommendation = `A *term plan of ₹${formatINR(coverAmount)}* cover for 30 years`;
    keyBenefits = ['Pure protection — no premium waste', 'Tax saving under 80C', 'Claim settlement ratio: 99%+ (LIC, HDFC Life)'];

  } else if (insuranceType === 'Health Insurance') {
    // Cover: min ₹5L for individual, ₹10L+ for family
    coverAmount = dependents > 0 ? Math.max(1000000, annualIncome * 0.5) : 500000;
    annualPremium = age < 30 ? 8000 : age < 40 ? 12000 : age < 50 ? 18000 : 28000;
    if (dependents > 0) annualPremium = annualPremium * 1.5;
    annualPremium = Math.round(annualPremium);
    recommendation = `A *family floater health plan of ₹${formatINR(coverAmount)}*`;
    keyBenefits = ['Cashless hospitalization', 'No claim bonus', 'Covers pre/post hospitalization'];

  } else {
    // Life Endowment
    coverAmount = annualIncome * 10;
    annualPremium = Math.round(coverAmount * 0.04);
    recommendation = `An *endowment plan with ₹${formatINR(coverAmount)}* sum assured`;
    keyBenefits = ['Savings + protection combo', 'Maturity benefit', 'Loan against policy'];
  }

  return { insuranceType, age, dependents, annualIncome, coverAmount, annualPremium, recommendation, keyBenefits };
}

function calculateVehicleInsurance({ vehicleValue, vehicleType }) {
  const rate = vehicleType === 'Car' ? 0.0185 : 0.012; // IDV rate
  const annualPremium = Math.round(vehicleValue * rate);
  const thirdPartyPremium = vehicleType === 'Car' ? 2094 : 1366; // IRDAI mandated 2024

  return { vehicleValue, vehicleType, annualPremium, thirdPartyPremium };
}

function buildInsuranceResultMessages({ insuranceType, age, coverAmount, annualPremium, recommendation, keyBenefits }) {
  return [
    `🛡️ *Insurance Recommendation*\n\n` +
    `Based on your profile:\n` +
    `• *Type:* ${insuranceType}\n` +
    `• *Age:* ${age} years\n` +
    `• *Recommended Cover:* ₹${formatINR(coverAmount)}\n` +
    `• *Est. Annual Premium:* ₹${formatINR(annualPremium)}\n` +
    `• *Monthly Cost:* ₹${formatINR(Math.round(annualPremium / 12))}\n\n` +
    `📋 *We recommend:* ${recommendation}`,

    `✅ *Key Benefits:*\n` +
    keyBenefits.map((b) => `• ${b}`).join('\n') +
    `\n\n🏢 *Top Providers:* LIC, HDFC Life, Max Life, Star Health\n\n` +
    `Reply *menu* to go back or *restart* to check another type.`,
  ];
}

function buildVehicleResultMessages({ vehicleValue, vehicleType, annualPremium, thirdPartyPremium }) {
  return [
    `🚗 *Vehicle Insurance Estimate*\n\n` +
    `• *Vehicle Type:* ${vehicleType}\n` +
    `• *Vehicle Value (IDV):* ₹${formatINR(vehicleValue)}\n\n` +
    `*Comprehensive Plan:* ₹${formatINR(annualPremium)}/year\n` +
    `*Third-Party Only:* ₹${formatINR(thirdPartyPremium)}/year (IRDAI mandated)\n\n` +
    `💡 *Tip:* Comprehensive is recommended — covers own damage + theft + third-party.\n\n` +
    `🏢 Compare on: PolicyBazaar, Acko, HDFC Ergo, Bajaj Allianz\n\n` +
    `Reply *menu* for more services.`,
  ];
}

function formatINR(num) {
  return Number(num).toLocaleString('en-IN');
}

module.exports = { processStep, getOpeningMessage, STEPS };
