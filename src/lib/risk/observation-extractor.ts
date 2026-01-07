/**
 * Observation Extractor
 * Creates ContractCostObservation records from modification history
 */

import { prisma } from "@/lib/prisma";

interface ObservationData {
  contractId: number;
  observationDate: Date;
  ceilingValue: number;
  obligationValue: number;
  ratio: number;
}

/**
 * Extract observations from a contract's modification history
 * Each modification that changes ceiling or obligation creates an observation
 */
export async function extractObservationsForContract(
  contractId: number
): Promise<ObservationData[]> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
    include: {
      modifications: {
        orderBy: { actionDate: "asc" },
      },
    },
  });

  if (!contract) return [];

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

  return observations;
}

/**
 * Save observations to database (upsert pattern)
 */
export async function saveObservationsForContract(
  contractId: number
): Promise<number> {
  const observations = await extractObservationsForContract(contractId);

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

/**
 * Extract observations for all contracts (batch)
 */
export async function extractAllObservations(): Promise<{
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
