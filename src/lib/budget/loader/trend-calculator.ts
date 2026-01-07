/**
 * Budget Trend Calculator
 * Computes YoY changes and populates the budget_trends table
 */

import { prisma } from "@/lib/prisma";

interface TrendData {
  programElement: string;
  programName: string | null;
  fiscalYear: number;
  agency: string | null;
  appropriationType: string;
  amount: number | null;
  priorAmount: number | null;
}

/**
 * Calculate Year-over-Year change
 */
function calculateYoYChange(current: number | null, prior: number | null): {
  dollars: number | null;
  percent: number | null;
  direction: string;
} {
  if (current === null && prior === null) {
    return { dollars: null, percent: null, direction: "flat" };
  }

  if (prior === null || prior === 0) {
    if (current && current > 0) {
      return { dollars: current, percent: null, direction: "new" };
    }
    return { dollars: null, percent: null, direction: "flat" };
  }

  if (current === null || current === 0) {
    return { dollars: -prior, percent: -100, direction: "terminated" };
  }

  const dollars = current - prior;
  const percent = ((current - prior) / prior) * 100;

  let direction = "flat";
  if (percent > 5) direction = "up";
  else if (percent < -5) direction = "down";

  return { dollars, percent, direction };
}

/**
 * Calculate 5-year CAGR (Compound Annual Growth Rate)
 */
function calculateCAGR(
  amounts: { fiscalYear: number; amount: number | null }[]
): number | null {
  // Sort by fiscal year
  const sorted = amounts
    .filter((a) => a.amount !== null && a.amount > 0)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);

  if (sorted.length < 2) return null;

  const startValue = sorted[0].amount!;
  const endValue = sorted[sorted.length - 1].amount!;
  const years = sorted[sorted.length - 1].fiscalYear - sorted[0].fiscalYear;

  if (years === 0 || startValue === 0) return null;

  // CAGR = (End/Start)^(1/n) - 1
  const cagr = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return cagr;
}

/**
 * Compute trends for all program elements
 */
export async function computeTrends(): Promise<{
  computed: number;
  errors: number;
}> {
  let computed = 0;
  let errors = 0;

  // Get all unique program elements
  const programElements = await prisma.budgetLineItem.groupBy({
    by: ["programElement", "agency", "appropriationType"],
    where: {
      programElement: { not: null },
    },
  });

  console.log(`Computing trends for ${programElements.length} program elements...`);

  for (const pe of programElements) {
    if (!pe.programElement) continue;

    try {
      // Get all fiscal year data for this PE
      const lineItems = await prisma.budgetLineItem.findMany({
        where: {
          programElement: pe.programElement,
          agency: pe.agency,
          appropriationType: pe.appropriationType,
        },
        orderBy: { fiscalYear: "asc" },
        select: {
          fiscalYear: true,
          programName: true,
          budgetYearRequest: true,
        },
      });

      // Compute trends for each fiscal year
      for (let i = 0; i < lineItems.length; i++) {
        const current = lineItems[i];
        const prior = i > 0 ? lineItems[i - 1] : null;

        const currentAmount = current.budgetYearRequest
          ? parseFloat(current.budgetYearRequest.toString())
          : null;
        const priorAmount = prior?.budgetYearRequest
          ? parseFloat(prior.budgetYearRequest.toString())
          : null;

        const yoy = calculateYoYChange(currentAmount, priorAmount);

        // Calculate 5-year CAGR
        const fiveYearData = lineItems
          .filter((li) => li.fiscalYear <= current.fiscalYear)
          .slice(-5)
          .map((li) => ({
            fiscalYear: li.fiscalYear,
            amount: li.budgetYearRequest
              ? parseFloat(li.budgetYearRequest.toString())
              : null,
          }));
        const cagr = calculateCAGR(fiveYearData);

        // Upsert trend record
        await prisma.budgetTrend.upsert({
          where: {
            programElement_fiscalYear_agency_appropriationType: {
              programElement: pe.programElement,
              fiscalYear: current.fiscalYear,
              agency: pe.agency || "",
              appropriationType: pe.appropriationType,
            },
          },
          update: {
            programName: current.programName,
            amount: currentAmount,
            yoyChangeDollars: yoy.dollars,
            yoyChangePercent: yoy.percent,
            fiveYearCagr: cagr,
            trendDirection: yoy.direction,
          },
          create: {
            programElement: pe.programElement,
            programName: current.programName,
            fiscalYear: current.fiscalYear,
            agency: pe.agency,
            appropriationType: pe.appropriationType,
            amount: currentAmount,
            yoyChangeDollars: yoy.dollars,
            yoyChangePercent: yoy.percent,
            fiveYearCagr: cagr,
            trendDirection: yoy.direction,
          },
        });

        computed++;
      }
    } catch (error) {
      console.error(`Error computing trends for ${pe.programElement}:`, error);
      errors++;
    }
  }

  return { computed, errors };
}

/**
 * Get top movers (biggest YoY changes)
 */
export async function getTopMovers(
  fiscalYear: number,
  limit: number = 10
): Promise<{
  gainers: any[];
  losers: any[];
  newPrograms: any[];
  terminated: any[];
}> {
  const gainers = await prisma.budgetTrend.findMany({
    where: {
      fiscalYear,
      trendDirection: "up",
      yoyChangePercent: { not: null },
    },
    orderBy: { yoyChangePercent: "desc" },
    take: limit,
  });

  const losers = await prisma.budgetTrend.findMany({
    where: {
      fiscalYear,
      trendDirection: "down",
      yoyChangePercent: { not: null },
    },
    orderBy: { yoyChangePercent: "asc" },
    take: limit,
  });

  const newPrograms = await prisma.budgetTrend.findMany({
    where: {
      fiscalYear,
      trendDirection: "new",
    },
    orderBy: { amount: "desc" },
    take: limit,
  });

  const terminated = await prisma.budgetTrend.findMany({
    where: {
      fiscalYear,
      trendDirection: "terminated",
    },
    orderBy: { yoyChangeDollars: "asc" },
    take: limit,
  });

  return { gainers, losers, newPrograms, terminated };
}
