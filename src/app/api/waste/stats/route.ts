import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Try to get counts - these will fail if tables don't exist
    let totalContracts = 0;
    let contractsWithScores = 0;
    let flaggedCostGrowth = 0;
    let flaggedUnderutilized = 0;
    let flaggedOldContract = 0;
    let flaggedHighMods = 0;
    let flaggedPassThru = 0;
    let flaggedVendorConc = 0;
    let totalObligatedAmount = 0;
    let topFlagged: Array<{
      id: number;
      piid: string;
      vendorName: string | null;
      obligatedAmount: number | null;
      overallScore: number | null;
    }> = [];
    let scoreDistribution: Array<{ bucket: string; count: number }> = [];

    try {
      // Basic counts
      [totalContracts, contractsWithScores] = await Promise.all([
        prisma.serviceContract.count(),
        prisma.wasteScore.count(),
      ]);

      // Count flagged contracts
      [
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
      totalObligatedAmount = totalObligated._sum.obligatedAmount
        ? Number(totalObligated._sum.obligatedAmount)
        : 0;

      // Top flagged contracts
      const topFlaggedResults = await prisma.serviceContract.findMany({
        where: {
          wasteScore: {
            overallScore: { gt: 50 },
          },
        },
        include: { wasteScore: true },
        orderBy: { wasteScore: { overallScore: "desc" } },
        take: 10,
      });
      topFlagged = topFlaggedResults.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
      }));

      // Score distribution - only if we have scores
      if (contractsWithScores > 0) {
        const rawDistribution = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
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
        scoreDistribution = rawDistribution.map((d) => ({
          bucket: d.bucket,
          count: Number(d.count),
        }));
      }
    } catch (dbError) {
      // Tables might not exist yet - return empty stats
      console.error("Database query error (tables may not exist):", dbError);
    }

    return NextResponse.json({
      overview: {
        totalContracts,
        contractsWithScores,
        totalObligated: totalObligatedAmount,
      },
      flaggedCounts: {
        costGrowth: flaggedCostGrowth,
        underutilized: flaggedUnderutilized,
        oldContract: flaggedOldContract,
        highMods: flaggedHighMods,
        passThru: flaggedPassThru,
        vendorConc: flaggedVendorConc,
      },
      scoreDistribution,
      topFlagged,
    });
  } catch (error) {
    console.error("Waste stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
