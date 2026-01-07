import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Basic counts
    const [totalContracts, contractsWithScores] = await Promise.all([
      prisma.serviceContract.count({
        where: { awardCeiling: { gt: 0 } },
      }),
      prisma.contractRiskScore.count(),
    ]);

    // Confidence level distribution
    const confidenceDistribution = await prisma.contractRiskScore.groupBy({
      by: ["confidenceLevel"],
      _count: { id: true },
    });

    // Risk score distribution (buckets)
    const scoreDistribution = await prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
      SELECT
        CASE
          WHEN risk_score >= 80 THEN 'critical'
          WHEN risk_score >= 60 THEN 'high'
          WHEN risk_score >= 40 THEN 'medium'
          WHEN risk_score >= 20 THEN 'low'
          ELSE 'minimal'
        END as bucket,
        COUNT(*) as count
      FROM contract_risk_scores
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
    `;

    // Contracts with warning < 12 months
    const urgentWarnings = await prisma.contractRiskScore.count({
      where: {
        monthsToWarning: { not: null, lt: 12 },
      },
    });

    // Top 10 highest risk
    const topRisk = await prisma.serviceContract.findMany({
      where: {
        riskScore: { isNot: null },
      },
      include: {
        riskScore: true,
      },
      orderBy: {
        riskScore: { riskScore: "desc" },
      },
      take: 10,
    });

    // PSC categories with highest average volatility
    const topVolatilePSC = await prisma.volatilityParameter.findMany({
      where: {
        agencyCode: null, // Base parameters only
        confidenceLevel: { in: ["high", "medium"] },
      },
      orderBy: { sigma: "desc" },
      take: 5,
    });

    return NextResponse.json({
      overview: {
        totalContracts,
        contractsWithScores,
        urgentWarnings,
      },
      confidenceDistribution: confidenceDistribution.map((d) => ({
        level: d.confidenceLevel,
        count: d._count.id,
      })),
      scoreDistribution: scoreDistribution.map((d) => ({
        bucket: d.bucket,
        count: Number(d.count),
      })),
      topRisk: topRisk.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        riskScore: c.riskScore?.riskScore ?? null,
        breachProbability: c.riskScore?.ceilingBreachProb ? Number(c.riskScore.ceilingBreachProb) : null,
        monthsToWarning: c.riskScore?.monthsToWarning ?? null,
      })),
      topVolatilePSC: topVolatilePSC.map((p) => ({
        pscCode: p.pscCode,
        sigma: Number(p.sigma),
        observationCount: p.observationCount,
        confidenceLevel: p.confidenceLevel,
      })),
    });
  } catch (error) {
    console.error("Risk stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
