import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Basic counts
    const [totalContracts, contractsWithScores] = await Promise.all([
      prisma.serviceContract.count(),
      prisma.wasteScore.count(),
    ]);

    // Count flagged contracts (simpler approach)
    const [
      flaggedCostGrowth,
      flaggedUnderutilized,
      flaggedOldContract,
      flaggedHighMods,
      flaggedPassThru,
      flaggedVendorConc,
    ] = await Promise.all([
      prisma.wasteScore.count({ where: { flagCostGrowth: true } }),
      prisma.wasteScore.count({ where: { flagUnderutilized: true } }),
      prisma.wasteScore.count({ where: { flagOldContract: true } }),
      prisma.wasteScore.count({ where: { flagHighMods: true } }),
      prisma.wasteScore.count({ where: { flagPassThru: true } }),
      prisma.wasteScore.count({ where: { flagVendorConc: true } }),
    ]);

    // Total obligated amount
    const totalObligated = await prisma.serviceContract.aggregate({
      _sum: { obligatedAmount: true },
    });

    // Top flagged contracts
    const topFlagged = await prisma.serviceContract.findMany({
      where: {
        wasteScore: {
          overallScore: { gt: 50 },
        },
      },
      include: { wasteScore: true },
      orderBy: { wasteScore: { overallScore: "desc" } },
      take: 10,
    });

    // Score distribution
    const scoreDistribution = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN overall_score >= 80 THEN 'critical'
          WHEN overall_score >= 60 THEN 'high'
          WHEN overall_score >= 40 THEN 'medium'
          WHEN overall_score >= 20 THEN 'low'
          ELSE 'minimal'
        END as bucket,
        COUNT(*) as count
      FROM waste_scores
      WHERE overall_score IS NOT NULL
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

    return NextResponse.json({
      overview: {
        totalContracts,
        contractsWithScores,
        totalObligated: totalObligated._sum.obligatedAmount
          ? Number(totalObligated._sum.obligatedAmount)
          : 0,
      },
      flaggedCounts: {
        costGrowth: flaggedCostGrowth,
        underutilized: flaggedUnderutilized,
        oldContract: flaggedOldContract,
        highMods: flaggedHighMods,
        passThru: flaggedPassThru,
        vendorConc: flaggedVendorConc,
      },
      scoreDistribution: scoreDistribution.map((d) => ({
        bucket: d.bucket,
        count: Number(d.count),
      })),
      topFlagged: topFlagged.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
      })),
    });
  } catch (error) {
    console.error("Waste stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
