/**
 * Risk Score Calculator
 * Applies Black-Scholes-inspired model to compute contract cost risk
 */

import { prisma } from "@/lib/prisma";
import { ConfidenceLevel } from "@prisma/client";
import { getVolatilityForContract } from "./volatility-calculator";

// Lifecycle multipliers (early contracts more volatile)
const LIFECYCLE_MULTIPLIERS: Record<string, number> = {
  early: 1.5,    // 0-25% complete
  mid: 1.0,      // 25-75% complete
  late: 0.7,     // 75-100% complete
};

// Default volatility when no parameter exists
const DEFAULT_SIGMA = 0.25; // 25%

interface RiskScoreResult {
  currentRatio: number;
  impliedVolatility: number;
  lifecycleStage: number;
  lifecycleMultiplier: number;
  riskScore: number;
  expectedCostLow: number | null;
  expectedCostMid: number | null;
  expectedCostHigh: number | null;
  ceilingBreachProb: number;
  monthsToWarning: number | null;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Calculate lifecycle stage (0-100%)
 */
function calculateLifecycleStage(
  startDate: Date | null,
  endDate: Date | null
): number {
  if (!startDate || !endDate) return 50; // Default to mid-stage

  const now = new Date();
  const start = startDate.getTime();
  const end = endDate.getTime();
  const current = now.getTime();

  if (current <= start) return 0;
  if (current >= end) return 100;

  return Math.round(((current - start) / (end - start)) * 100);
}

/**
 * Get lifecycle multiplier based on stage
 */
function getLifecycleMultiplier(stage: number): number {
  if (stage < 25) return LIFECYCLE_MULTIPLIERS.early;
  if (stage > 75) return LIFECYCLE_MULTIPLIERS.late;
  return LIFECYCLE_MULTIPLIERS.mid;
}

/**
 * Standard normal CDF approximation (for Black-Scholes)
 */
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

/**
 * Calculate expected ratio at time T using geometric Brownian motion
 * Returns percentiles (10th, 50th, 90th)
 */
function projectRatioDistribution(
  currentRatio: number,
  sigma: number,
  yearsRemaining: number
): { low: number; mid: number; high: number } {
  if (yearsRemaining <= 0 || sigma <= 0) {
    return { low: currentRatio, mid: currentRatio, high: currentRatio };
  }

  // Drift is 0 (ratio expected to stay constant without volatility)
  const sqrtT = Math.sqrt(yearsRemaining);

  // Log-normal distribution quantiles
  const z10 = -1.28; // 10th percentile
  const z50 = 0;     // 50th percentile
  const z90 = 1.28;  // 90th percentile

  return {
    low: currentRatio * Math.exp(-0.5 * sigma * sigma * yearsRemaining + sigma * sqrtT * z10),
    mid: currentRatio * Math.exp(-0.5 * sigma * sigma * yearsRemaining + sigma * sqrtT * z50),
    high: currentRatio * Math.exp(-0.5 * sigma * sigma * yearsRemaining + sigma * sqrtT * z90),
  };
}

/**
 * Calculate probability ratio exceeds ceiling (ratio > 1)
 */
function calculateBreachProbability(
  currentRatio: number,
  sigma: number,
  yearsRemaining: number
): number {
  if (currentRatio >= 1) return 100; // Already at/above ceiling
  if (yearsRemaining <= 0 || sigma <= 0) return 0;

  // Using log-normal distribution
  // P(S_T > K) where K = 1 (ceiling)
  const d2 = (Math.log(currentRatio) - 0.5 * sigma * sigma * yearsRemaining) / (sigma * Math.sqrt(yearsRemaining));

  return (1 - normalCDF(d2)) * 100;
}

/**
 * Calculate months until breach probability exceeds 50%
 */
function calculateMonthsToWarning(
  currentRatio: number,
  sigma: number,
  totalMonthsRemaining: number
): number | null {
  if (currentRatio >= 0.9) return 0; // Already at warning threshold
  if (sigma <= 0) return null;

  // Binary search for time when breach prob > 50%
  for (let months = 1; months <= totalMonthsRemaining; months++) {
    const years = months / 12;
    const prob = calculateBreachProbability(currentRatio, sigma, years);
    if (prob >= 50) return months;
  }

  return null; // Won't breach within contract period
}

/**
 * Calculate composite risk score (0-100)
 */
function calculateCompositeScore(
  currentRatio: number,
  sigma: number,
  lifecycleMultiplier: number,
  breachProb: number
): number {
  // Components:
  // 1. Current position risk (ratio closeness to ceiling): 0-40 points
  // 2. Volatility risk (sigma vs typical): 0-30 points
  // 3. Breach probability: 0-30 points

  const positionScore = Math.min(40, currentRatio * 40);
  const volatilityScore = Math.min(30, (sigma / 0.5) * 30 * lifecycleMultiplier);
  const breachScore = breachProb * 0.3;

  return Math.round(Math.min(100, positionScore + volatilityScore + breachScore));
}

/**
 * Calculate risk score for a single contract
 */
export async function calculateRiskScore(
  contractId: number
): Promise<RiskScoreResult | null> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
  });

  if (!contract) return null;

  const ceiling = Number(contract.awardCeiling) || 0;
  const obligated = Number(contract.obligatedAmount) || 0;

  if (ceiling <= 0) return null;

  const currentRatio = obligated / ceiling;

  // Get volatility parameter
  const volatility = await getVolatilityForContract(
    contract.pscCode,
    contract.awardingAgency
  );

  const sigma = volatility?.sigma ?? DEFAULT_SIGMA;
  const confidence = volatility?.confidence ?? "low";

  // Calculate lifecycle
  const lifecycleStage = calculateLifecycleStage(
    contract.periodOfPerformanceStart,
    contract.periodOfPerformanceEnd
  );
  const lifecycleMultiplier = getLifecycleMultiplier(lifecycleStage);
  const adjustedSigma = sigma * lifecycleMultiplier;

  // Time remaining
  const endDate = contract.periodOfPerformanceEnd;
  const yearsRemaining = endDate
    ? Math.max(0, (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365))
    : 1; // Default 1 year if unknown

  const monthsRemaining = Math.round(yearsRemaining * 12);

  // Project distribution
  const projection = projectRatioDistribution(currentRatio, adjustedSigma, yearsRemaining);

  // Calculate expected costs at each percentile
  const expectedCostLow = projection.low * ceiling;
  const expectedCostMid = projection.mid * ceiling;
  const expectedCostHigh = projection.high * ceiling;

  // Breach probability
  const ceilingBreachProb = calculateBreachProbability(currentRatio, adjustedSigma, yearsRemaining);

  // Months to warning
  const monthsToWarning = calculateMonthsToWarning(currentRatio, adjustedSigma, monthsRemaining);

  // Composite score
  const riskScore = calculateCompositeScore(currentRatio, adjustedSigma, lifecycleMultiplier, ceilingBreachProb);

  return {
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
  };
}

/**
 * Calculate and save risk score for a contract
 */
export async function saveRiskScore(contractId: number): Promise<void> {
  const result = await calculateRiskScore(contractId);
  if (!result) return;

  // Check if score exists
  const existing = await prisma.contractRiskScore.findUnique({
    where: { contractId },
  });

  if (existing) {
    await prisma.contractRiskScore.update({
      where: { contractId },
      data: {
        ...result,
        calculatedAt: new Date(),
      },
    });
  } else {
    await prisma.contractRiskScore.create({
      data: {
        contractId,
        ...result,
        calculatedAt: new Date(),
      },
    });
  }
}

/**
 * Calculate risk scores for all contracts
 */
export async function calculateAllRiskScores(): Promise<{
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
