/**
 * Risk Model Data Sync
 * Extracts observations, calculates volatility parameters, and scores contracts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Import functions inline to avoid module resolution issues in scripts
async function extractAllObservations(): Promise<{
  processed: number;
  totalObservations: number;
  errors: number;
}> {
  const contracts = await prisma.serviceContract.findMany({
    where: {
      awardCeiling: { gt: 0 },
    },
    select: { id: true },
  });

  let processed = 0;
  let totalObservations = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      const count = await saveObservationsForContract(contract.id);
      totalObservations += count;
      processed++;
    } catch (error) {
      console.error(`Error extracting observations for contract ${contract.id}:`, error);
      errors++;
    }
  }

  return { processed, totalObservations, errors };
}

async function saveObservationsForContract(contractId: number): Promise<number> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
    include: {
      modifications: {
        orderBy: { actionDate: "asc" },
      },
    },
  });

  if (!contract) return 0;

  interface ObservationData {
    contractId: number;
    observationDate: Date;
    ceilingValue: number;
    obligationValue: number;
    ratio: number;
  }

  const observations: ObservationData[] = [];

  // Initial observation from contract award
  const initialCeiling = Number(contract.awardCeiling) || 0;
  const initialObligation = Number(contract.obligatedAmount) || 0;

  if (initialCeiling > 0 && contract.awardDate) {
    observations.push({
      contractId,
      observationDate: contract.awardDate,
      ceilingValue: initialCeiling,
      obligationValue: initialObligation,
      ratio: initialObligation / initialCeiling,
    });
  }

  // Track running totals through modifications
  let runningCeiling = initialCeiling;
  let runningObligation = initialObligation;

  for (const mod of contract.modifications) {
    if (!mod.actionDate) continue;

    const obligatedChange = Number(mod.obligatedChange) || 0;
    const newTotal = Number(mod.obligatedTotal);

    // Update running obligation
    if (!isNaN(newTotal) && newTotal > 0) {
      runningObligation = newTotal;
    } else if (obligatedChange !== 0) {
      runningObligation += obligatedChange;
    }

    // Skip if no valid ceiling
    if (runningCeiling <= 0) continue;

    const ratio = runningObligation / runningCeiling;

    // Only add observation if ratio changed significantly (>0.1%)
    const lastRatio = observations.length > 0
      ? observations[observations.length - 1].ratio
      : 0;

    if (Math.abs(ratio - lastRatio) > 0.001) {
      observations.push({
        contractId,
        observationDate: mod.actionDate,
        ceilingValue: runningCeiling,
        obligationValue: runningObligation,
        ratio,
      });
    }
  }

  // Delete existing observations for this contract
  await prisma.contractCostObservation.deleteMany({
    where: { contractId },
  });

  // Insert new observations
  if (observations.length > 0) {
    await prisma.contractCostObservation.createMany({
      data: observations,
    });
  }

  return observations.length;
}

function calculateContractVolatility(
  observations: Array<{ observationDate: Date; ratio: number }>
): number | null {
  if (observations.length < 3) return null;

  const returns: Array<{ return: number; daysDelta: number }> = [];

  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1];
    const curr = observations[i];

    if (prev.ratio <= 0) continue;

    const returnPct = (curr.ratio - prev.ratio) / prev.ratio;
    const daysDelta = Math.max(1,
      (curr.observationDate.getTime() - prev.observationDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    returns.push({ return: returnPct, daysDelta });
  }

  if (returns.length < 2) return null;

  const annualizedReturns = returns.map(r =>
    r.return * Math.sqrt(365 / r.daysDelta)
  );

  const mean = annualizedReturns.reduce((a, b) => a + b, 0) / annualizedReturns.length;
  const variance = annualizedReturns.reduce((sum, r) =>
    sum + Math.pow(r - mean, 2), 0
  ) / (annualizedReturns.length - 1);

  return Math.sqrt(variance);
}

function getConfidenceLevel(count: number): "high" | "medium" | "low" {
  if (count >= 50) return "high";
  if (count >= 20) return "medium";
  return "low";
}

async function calculateAllVolatilityParameters(): Promise<{
  parameters: number;
  errors: number;
}> {
  const pscCodes = await prisma.serviceContract.groupBy({
    by: ["pscCode"],
    where: {
      pscCode: { not: null },
      costObservations: { some: {} },
    },
    _count: { id: true },
  });

  let parameters = 0;
  let errors = 0;

  for (const { pscCode } of pscCodes) {
    if (!pscCode) continue;

    try {
      const contracts = await prisma.serviceContract.findMany({
        where: {
          pscCode,
          costObservations: { some: {} },
        },
        include: {
          costObservations: {
            orderBy: { observationDate: "asc" },
          },
        },
      });

      const volatilities: Array<{ sigma: number; weight: number }> = [];

      for (const contract of contracts) {
        const obsWithNumbers = contract.costObservations.map(obs => ({
          observationDate: obs.observationDate,
          ratio: Number(obs.ratio),
        }));
        const sigma = calculateContractVolatility(obsWithNumbers);
        if (sigma !== null && !isNaN(sigma) && isFinite(sigma)) {
          const weight = Number(contract.obligatedAmount) || 1;
          volatilities.push({ sigma, weight });
        }
      }

      if (volatilities.length === 0) continue;

      const totalWeight = volatilities.reduce((sum, v) => sum + v.weight, 0);
      const weightedSigma = volatilities.reduce(
        (sum, v) => sum + v.sigma * v.weight, 0
      ) / totalWeight;

      const existing = await prisma.volatilityParameter.findFirst({
        where: { pscCode, agencyCode: null },
      });

      if (existing) {
        await prisma.volatilityParameter.update({
          where: { id: existing.id },
          data: {
            sigma: weightedSigma,
            observationCount: volatilities.length,
            confidenceLevel: getConfidenceLevel(volatilities.length),
            lastCalculated: new Date(),
          },
        });
      } else {
        await prisma.volatilityParameter.create({
          data: {
            pscCode,
            agencyCode: null,
            sigma: weightedSigma,
            observationCount: volatilities.length,
            confidenceLevel: getConfidenceLevel(volatilities.length),
            lastCalculated: new Date(),
          },
        });
      }

      parameters++;
    } catch (error) {
      console.error(`Error calculating volatility for PSC ${pscCode}:`, error);
      errors++;
    }
  }

  return { parameters, errors };
}

const DEFAULT_SIGMA = 0.25;

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

async function calculateAllRiskScores(): Promise<{
  processed: number;
  errors: number;
}> {
  const contracts = await prisma.serviceContract.findMany({
    where: {
      awardCeiling: { gt: 0 },
    },
    select: { id: true },
  });

  let processed = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      await saveRiskScore(contract.id);
      processed++;
    } catch (error) {
      console.error(`Error calculating risk for contract ${contract.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}

async function saveRiskScore(contractId: number): Promise<void> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
  });

  if (!contract) return;

  const ceiling = Number(contract.awardCeiling) || 0;
  const obligated = Number(contract.obligatedAmount) || 0;

  if (ceiling <= 0) return;

  const currentRatio = obligated / ceiling;

  // Get volatility parameter
  let sigma = DEFAULT_SIGMA;
  let confidence: "high" | "medium" | "low" = "low";

  if (contract.pscCode) {
    const volatilityParam = await prisma.volatilityParameter.findFirst({
      where: {
        pscCode: contract.pscCode,
        agencyCode: null,
      },
    });
    if (volatilityParam) {
      sigma = Number(volatilityParam.sigma);
      confidence = volatilityParam.confidenceLevel;
    }
  }

  // Calculate lifecycle
  const startDate = contract.periodOfPerformanceStart;
  const endDate = contract.periodOfPerformanceEnd;

  let lifecycleStage = 50;
  if (startDate && endDate) {
    const now = new Date();
    const start = startDate.getTime();
    const end = endDate.getTime();
    const current = now.getTime();

    if (current <= start) lifecycleStage = 0;
    else if (current >= end) lifecycleStage = 100;
    else lifecycleStage = Math.round(((current - start) / (end - start)) * 100);
  }

  let lifecycleMultiplier = 1.0;
  if (lifecycleStage < 25) lifecycleMultiplier = 1.5;
  else if (lifecycleStage > 75) lifecycleMultiplier = 0.7;

  const adjustedSigma = sigma * lifecycleMultiplier;

  // Time remaining
  const yearsRemaining = endDate
    ? Math.max(0, (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365))
    : 1;

  const monthsRemaining = Math.round(yearsRemaining * 12);

  // Project distribution
  let expectedCostLow = currentRatio * ceiling;
  let expectedCostMid = currentRatio * ceiling;
  let expectedCostHigh = currentRatio * ceiling;

  if (yearsRemaining > 0 && adjustedSigma > 0) {
    const sqrtT = Math.sqrt(yearsRemaining);
    expectedCostLow = currentRatio * Math.exp(-0.5 * adjustedSigma * adjustedSigma * yearsRemaining + adjustedSigma * sqrtT * -1.28) * ceiling;
    expectedCostMid = currentRatio * Math.exp(-0.5 * adjustedSigma * adjustedSigma * yearsRemaining) * ceiling;
    expectedCostHigh = currentRatio * Math.exp(-0.5 * adjustedSigma * adjustedSigma * yearsRemaining + adjustedSigma * sqrtT * 1.28) * ceiling;
  }

  // Breach probability
  let ceilingBreachProb = 0;
  if (currentRatio >= 1) {
    ceilingBreachProb = 100;
  } else if (yearsRemaining > 0 && adjustedSigma > 0) {
    const d2 = (Math.log(currentRatio) - 0.5 * adjustedSigma * adjustedSigma * yearsRemaining) / (adjustedSigma * Math.sqrt(yearsRemaining));
    ceilingBreachProb = (1 - normalCDF(d2)) * 100;
  }

  // Months to warning
  let monthsToWarning: number | null = null;
  if (currentRatio >= 0.9) {
    monthsToWarning = 0;
  } else if (adjustedSigma > 0) {
    for (let months = 1; months <= monthsRemaining; months++) {
      const years = months / 12;
      const d2 = (Math.log(currentRatio) - 0.5 * adjustedSigma * adjustedSigma * years) / (adjustedSigma * Math.sqrt(years));
      const prob = (1 - normalCDF(d2)) * 100;
      if (prob >= 50) {
        monthsToWarning = months;
        break;
      }
    }
  }

  // Composite score
  const positionScore = Math.min(40, currentRatio * 40);
  const volatilityScore = Math.min(30, (adjustedSigma / 0.5) * 30 * lifecycleMultiplier);
  const breachScore = ceilingBreachProb * 0.3;
  const riskScore = Math.round(Math.min(100, positionScore + volatilityScore + breachScore));

  // Save to database
  const existing = await prisma.contractRiskScore.findUnique({
    where: { contractId },
  });

  const data = {
    currentRatio,
    impliedVolatility: adjustedSigma,
    lifecycleStage,
    lifecycleMultiplier,
    riskScore,
    expectedCostLow,
    expectedCostMid,
    expectedCostHigh,
    ceilingBreachProb,
    monthsToWarning,
    confidenceLevel: confidence,
    calculatedAt: new Date(),
  };

  if (existing) {
    await prisma.contractRiskScore.update({
      where: { contractId },
      data,
    });
  } else {
    await prisma.contractRiskScore.create({
      data: {
        contractId,
        ...data,
      },
    });
  }
}

async function main() {
  console.log("Starting risk model sync...\n");

  // Step 1: Extract observations from modification history
  console.log("Step 1: Extracting cost observations...");
  const obsResult = await extractAllObservations();
  console.log(`  Processed: ${obsResult.processed} contracts`);
  console.log(`  Observations: ${obsResult.totalObservations}`);
  console.log(`  Errors: ${obsResult.errors}\n`);

  // Step 2: Calculate volatility parameters
  console.log("Step 2: Calculating volatility parameters...");
  const volResult = await calculateAllVolatilityParameters();
  console.log(`  Parameters: ${volResult.parameters}`);
  console.log(`  Errors: ${volResult.errors}\n`);

  // Step 3: Calculate risk scores
  console.log("Step 3: Calculating risk scores...");
  const riskResult = await calculateAllRiskScores();
  console.log(`  Processed: ${riskResult.processed} contracts`);
  console.log(`  Errors: ${riskResult.errors}\n`);

  // Summary
  console.log("Risk model sync complete!");
  console.log(`  Total observations: ${obsResult.totalObservations}`);
  console.log(`  Volatility parameters: ${volResult.parameters}`);
  console.log(`  Contracts scored: ${riskResult.processed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
