/**
 * Volatility Calculator
 * Computes annualized volatility from contract cost observations
 */

import { prisma } from "@/lib/prisma";
import { ConfidenceLevel } from "@prisma/client";

interface VolatilityResult {
  pscCode: string;
  agencyCode: string | null;
  sigma: number;
  observationCount: number;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Calculate volatility for a single contract from its observations
 * Returns annualized standard deviation of ratio changes
 */
export function calculateContractVolatility(
  observations: Array<{ observationDate: Date; ratio: number }>
): number | null {
  if (observations.length < 3) return null;

  // Calculate returns (percentage changes in ratio)
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

  // Annualize each return and calculate variance
  const annualizedReturns = returns.map(r =>
    r.return * Math.sqrt(365 / r.daysDelta)
  );

  const mean = annualizedReturns.reduce((a, b) => a + b, 0) / annualizedReturns.length;
  const variance = annualizedReturns.reduce((sum, r) =>
    sum + Math.pow(r - mean, 2), 0
  ) / (annualizedReturns.length - 1);

  return Math.sqrt(variance);
}

/**
 * Get confidence level based on observation count
 */
function getConfidenceLevel(count: number): ConfidenceLevel {
  if (count >= 50) return "high";
  if (count >= 20) return "medium";
  return "low";
}

/**
 * Calculate volatility parameters for all PSC codes
 */
export async function calculateAllVolatilityParameters(): Promise<{
  parameters: number;
  errors: number;
}> {
  // Get all PSC codes with contracts
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
      // Get all contracts with this PSC code
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

      // Calculate volatility for each contract
      const volatilities: Array<{ sigma: number; weight: number }> = [];

      for (const contract of contracts) {
        // Convert Decimal to number for calculation
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

      // Weighted average volatility
      const totalWeight = volatilities.reduce((sum, v) => sum + v.weight, 0);
      const weightedSigma = volatilities.reduce(
        (sum, v) => sum + v.sigma * v.weight, 0
      ) / totalWeight;

      // Check if parameter exists
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

/**
 * Get volatility parameter for a contract
 * Falls back to PSC-only if no agency-specific parameter exists
 */
export async function getVolatilityForContract(
  pscCode: string | null,
  agencyCode: string | null
): Promise<{ sigma: number; confidence: ConfidenceLevel } | null> {
  if (!pscCode) return null;

  // Try agency-specific first
  if (agencyCode) {
    const specific = await prisma.volatilityParameter.findUnique({
      where: {
        pscCode_agencyCode: { pscCode, agencyCode },
      },
    });
    if (specific) {
      return { sigma: Number(specific.sigma), confidence: specific.confidenceLevel };
    }
  }

  // Fall back to PSC-only
  const general = await prisma.volatilityParameter.findFirst({
    where: {
      pscCode,
      agencyCode: null,
    },
  });

  if (general) {
    return { sigma: Number(general.sigma), confidence: general.confidenceLevel };
  }

  return null;
}
