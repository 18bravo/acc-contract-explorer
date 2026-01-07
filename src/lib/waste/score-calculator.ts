/**
 * Waste Score Calculator
 * Computes individual waste signals and overall score for contracts
 */

import { prisma } from "@/lib/prisma";

// Thresholds for flagging
const THRESHOLDS = {
  costGrowthPct: 50, // Flag if > 50% growth
  ceilingUtilization: 20, // Flag if < 20% utilized
  contractAgeDays: 5 * 365, // Flag if > 5 years
  modificationCount: 20, // Flag if > 20 mods
  passThruRatio: 70, // Flag if > 70% passed through
  vendorConcentration: 5, // Flag if > 5 contracts same vendor/org
  duplicateRisk: 80, // Flag if > 80 similarity
  impliedHourlyRate: 250, // Flag if > $250/hr
};

// Weights for overall score
const WEIGHTS = {
  costGrowthPct: 0.20,
  ceilingUtilization: 0.10,
  contractAgeDays: 0.10,
  modificationCount: 0.10,
  passThruRatio: 0.15,
  vendorConcentration: 0.10,
  duplicateRisk: 0.15,
  impliedHourlyRate: 0.10,
};

interface ScoreResult {
  costGrowthPct: number | null;
  ceilingUtilization: number | null;
  contractAgeDays: number | null;
  modificationCount: number;
  passThruRatio: number | null;
  vendorConcentration: number;
  duplicateRisk: number | null;
  impliedHourlyRate: number | null;
  overallScore: number;
  flagCostGrowth: boolean;
  flagUnderutilized: boolean;
  flagOldContract: boolean;
  flagHighMods: boolean;
  flagPassThru: boolean;
  flagVendorConc: boolean;
  flagDuplicate: boolean;
  flagHighRate: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

/**
 * Calculate waste scores for a single contract
 */
export async function calculateWasteScore(contractId: number): Promise<ScoreResult> {
  // Fetch contract with related data
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
    include: {
      modifications: true,
      subawards: true,
    },
  });

  if (!contract) {
    throw new Error(`Contract ${contractId} not found`);
  }

  // 1. Cost Growth %
  const baseValue = toNumber(contract.baseValue);
  const currentValue = toNumber(contract.currentValue);
  let costGrowthPct: number | null = null;
  if (baseValue && baseValue > 0 && currentValue) {
    costGrowthPct = ((currentValue - baseValue) / baseValue) * 100;
  }

  // 2. Ceiling Utilization %
  const obligatedAmount = toNumber(contract.obligatedAmount);
  const awardCeiling = toNumber(contract.awardCeiling);
  let ceilingUtilization: number | null = null;
  if (awardCeiling && awardCeiling > 0 && obligatedAmount !== null) {
    ceilingUtilization = (obligatedAmount / awardCeiling) * 100;
  }

  // 3. Contract Age (days)
  let contractAgeDays: number | null = null;
  if (contract.awardDate) {
    const now = new Date();
    contractAgeDays = Math.floor((now.getTime() - contract.awardDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 4. Modification Count
  const modificationCount = contract.modifications.length;

  // 5. Pass-Through Ratio
  let passThruRatio: number | null = null;
  if (obligatedAmount && obligatedAmount > 0 && contract.subawards.length > 0) {
    const totalSubawards = contract.subawards.reduce(
      (sum, sub) => sum + (toNumber(sub.subawardAmount) || 0),
      0
    );
    passThruRatio = (totalSubawards / obligatedAmount) * 100;
  }

  // 6. Vendor Concentration (count of contracts same vendor has in same org)
  let vendorConcentration = 0;
  if (contract.vendorUei && contract.contractingOfficeId) {
    vendorConcentration = await prisma.serviceContract.count({
      where: {
        vendorUei: contract.vendorUei,
        contractingOfficeId: contract.contractingOfficeId,
        id: { not: contractId },
      },
    });
  }

  // 7. Duplicate Risk (placeholder - would use text similarity)
  // For now, return null - will implement with pg_trgm or vector similarity later
  const duplicateRisk: number | null = null;

  // 8. Implied Hourly Rate (placeholder - requires labor hour estimation)
  const impliedHourlyRate: number | null = null;

  // Calculate flags
  const flagCostGrowth = costGrowthPct !== null && costGrowthPct > THRESHOLDS.costGrowthPct;
  const flagUnderutilized = ceilingUtilization !== null && ceilingUtilization < THRESHOLDS.ceilingUtilization;
  const flagOldContract = contractAgeDays !== null && contractAgeDays > THRESHOLDS.contractAgeDays;
  const flagHighMods = modificationCount > THRESHOLDS.modificationCount;
  const flagPassThru = passThruRatio !== null && passThruRatio > THRESHOLDS.passThruRatio;
  const flagVendorConc = vendorConcentration > THRESHOLDS.vendorConcentration;
  const flagDuplicate = duplicateRisk !== null && duplicateRisk > THRESHOLDS.duplicateRisk;
  const flagHighRate = impliedHourlyRate !== null && impliedHourlyRate > THRESHOLDS.impliedHourlyRate;

  // Calculate overall score (0-100, higher = more wasteful)
  let overallScore = 0;
  let totalWeight = 0;

  function addScore(value: number | null, threshold: number, weight: number, inverted: boolean = false) {
    if (value === null) return;
    totalWeight += weight;
    // Normalize to 0-100 based on threshold (100 = at or above threshold)
    const normalized = inverted
      ? Math.max(0, (threshold - value) / threshold) * 100
      : Math.min(100, (value / threshold) * 100);
    overallScore += normalized * weight;
  }

  addScore(costGrowthPct, THRESHOLDS.costGrowthPct, WEIGHTS.costGrowthPct);
  addScore(ceilingUtilization, THRESHOLDS.ceilingUtilization, WEIGHTS.ceilingUtilization, true);
  addScore(contractAgeDays, THRESHOLDS.contractAgeDays, WEIGHTS.contractAgeDays);
  addScore(modificationCount, THRESHOLDS.modificationCount, WEIGHTS.modificationCount);
  addScore(passThruRatio, THRESHOLDS.passThruRatio, WEIGHTS.passThruRatio);
  addScore(vendorConcentration, THRESHOLDS.vendorConcentration, WEIGHTS.vendorConcentration);
  addScore(duplicateRisk, THRESHOLDS.duplicateRisk, WEIGHTS.duplicateRisk);
  addScore(impliedHourlyRate, THRESHOLDS.impliedHourlyRate, WEIGHTS.impliedHourlyRate);

  // Normalize by actual weights used
  if (totalWeight > 0) {
    overallScore = overallScore / totalWeight;
  }

  return {
    costGrowthPct,
    ceilingUtilization,
    contractAgeDays,
    modificationCount,
    passThruRatio,
    vendorConcentration,
    duplicateRisk,
    impliedHourlyRate,
    overallScore: Math.round(overallScore * 100) / 100,
    flagCostGrowth,
    flagUnderutilized,
    flagOldContract,
    flagHighMods,
    flagPassThru,
    flagVendorConc,
    flagDuplicate,
    flagHighRate,
  };
}

/**
 * Calculate and save waste scores for a contract
 */
export async function saveWasteScore(contractId: number): Promise<void> {
  const scores = await calculateWasteScore(contractId);

  await prisma.wasteScore.upsert({
    where: { contractId },
    create: {
      contractId,
      ...scores,
      calculatedAt: new Date(),
    },
    update: {
      ...scores,
      calculatedAt: new Date(),
    },
  });
}

/**
 * Batch calculate waste scores for all contracts
 */
export async function calculateAllWasteScores(): Promise<{ processed: number; errors: number }> {
  const contracts = await prisma.serviceContract.findMany({
    select: { id: true },
  });

  let processed = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      await saveWasteScore(contract.id);
      processed++;
    } catch (error) {
      console.error(`Error calculating score for contract ${contract.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}
