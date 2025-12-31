import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Overall stats
    const [overallStats, vehicles] = await Promise.all([
      prisma.taskOrder.aggregate({
        _count: true,
        _sum: {
          obligatedAmount: true,
          potentialValue: true,
        },
      }),
      prisma.contractVehicle.findMany({
        orderBy: { totalObligated: "desc" },
      }),
    ]);

    // Top vendors by obligated amount
    const topVendors = await prisma.taskOrder.groupBy({
      by: ["vendorName"],
      where: { vendorName: { not: null } },
      _count: true,
      _sum: { obligatedAmount: true },
      orderBy: { _sum: { obligatedAmount: "desc" } },
      take: 10,
    });

    // Awards by state
    const byState = await prisma.taskOrder.groupBy({
      by: ["placeOfPerformanceState"],
      where: {
        placeOfPerformanceState: { not: null },
        NOT: { placeOfPerformanceState: "" },
      },
      _count: true,
      _sum: { obligatedAmount: true },
      orderBy: { _sum: { obligatedAmount: "desc" } },
      take: 15,
    });

    // Unique vendors count
    const uniqueVendors = await prisma.taskOrder.findMany({
      where: { vendorName: { not: null } },
      distinct: ["vendorName"],
      select: { vendorName: true },
    });

    return NextResponse.json({
      overall: {
        totalOrders: overallStats._count,
        totalObligated: overallStats._sum.obligatedAmount,
        totalPotential: overallStats._sum.potentialValue,
        uniqueVendors: uniqueVendors.length,
      },
      topVendors: topVendors.map((v) => ({
        vendorName: v.vendorName,
        orderCount: v._count,
        totalObligated: v._sum.obligatedAmount,
      })),
      byState: byState.map((s) => ({
        state: s.placeOfPerformanceState,
        orderCount: s._count,
        totalObligated: s._sum.obligatedAmount,
      })),
      vehicles,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
