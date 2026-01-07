import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contractId = parseInt(id);

    if (isNaN(contractId)) {
      return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
    }

    const contract = await prisma.serviceContract.findUnique({
      where: { id: contractId },
      include: {
        riskScore: true,
        costObservations: {
          orderBy: { observationDate: "asc" },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Get volatility parameter used
    let volatilityParam = null;
    if (contract.pscCode) {
      volatilityParam = await prisma.volatilityParameter.findFirst({
        where: {
          OR: [
            { pscCode: contract.pscCode, agencyCode: contract.awardingAgency },
            { pscCode: contract.pscCode, agencyCode: null },
          ],
        },
        orderBy: { agencyCode: "desc" }, // Prefer agency-specific
      });
    }

    // Get similar contracts (same PSC) for comparison
    const similarContracts = await prisma.serviceContract.findMany({
      where: {
        pscCode: contract.pscCode,
        id: { not: contractId },
        riskScore: { isNot: null },
      },
      include: {
        riskScore: true,
      },
      orderBy: { riskScore: { riskScore: "desc" } },
      take: 5,
    });

    return NextResponse.json({
      contract: {
        id: contract.id,
        piid: contract.piid,
        vendorName: contract.vendorName,
        awardDescription: contract.awardDescription,
        obligatedAmount: contract.obligatedAmount ? Number(contract.obligatedAmount) : null,
        awardCeiling: contract.awardCeiling ? Number(contract.awardCeiling) : null,
        awardDate: contract.awardDate?.toISOString().split("T")[0] || null,
        periodOfPerformanceStart: contract.periodOfPerformanceStart?.toISOString().split("T")[0] || null,
        periodOfPerformanceEnd: contract.periodOfPerformanceEnd?.toISOString().split("T")[0] || null,
        pscCode: contract.pscCode,
        pscDescription: contract.pscDescription,
        naicsCode: contract.naicsCode,
        awardingAgency: contract.awardingAgency,
      },
      riskScore: contract.riskScore ? {
        riskScore: contract.riskScore.riskScore,
        currentRatio: Number(contract.riskScore.currentRatio),
        impliedVolatility: Number(contract.riskScore.impliedVolatility),
        lifecycleStage: contract.riskScore.lifecycleStage,
        lifecycleMultiplier: Number(contract.riskScore.lifecycleMultiplier),
        expectedCostLow: contract.riskScore.expectedCostLow ? Number(contract.riskScore.expectedCostLow) : null,
        expectedCostMid: contract.riskScore.expectedCostMid ? Number(contract.riskScore.expectedCostMid) : null,
        expectedCostHigh: contract.riskScore.expectedCostHigh ? Number(contract.riskScore.expectedCostHigh) : null,
        ceilingBreachProb: Number(contract.riskScore.ceilingBreachProb),
        monthsToWarning: contract.riskScore.monthsToWarning,
        confidenceLevel: contract.riskScore.confidenceLevel,
        calculatedAt: contract.riskScore.calculatedAt.toISOString(),
      } : null,
      observations: contract.costObservations.map((obs) => ({
        date: obs.observationDate.toISOString().split("T")[0],
        ceiling: Number(obs.ceilingValue),
        obligation: Number(obs.obligationValue),
        ratio: Number(obs.ratio),
      })),
      volatilityParameter: volatilityParam ? {
        pscCode: volatilityParam.pscCode,
        agencyCode: volatilityParam.agencyCode,
        sigma: Number(volatilityParam.sigma),
        observationCount: volatilityParam.observationCount,
        confidenceLevel: volatilityParam.confidenceLevel,
      } : null,
      similarContracts: similarContracts.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        riskScore: c.riskScore?.riskScore ?? null,
        breachProbability: c.riskScore?.ceilingBreachProb ? Number(c.riskScore.ceilingBreachProb) : null,
      })),
    });
  } catch (error) {
    console.error("Risk contract detail error:", error);
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
}
