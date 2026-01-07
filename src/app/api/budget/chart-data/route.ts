import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters
    const agency = searchParams.get("agency") || null;
    const appropriationTypes = searchParams.get("approp")?.split(",").filter(Boolean) || [];
    const query = searchParams.get("q") || null;

    // Build base where clause (exclude fiscal year filter for trend chart)
    const baseWhere: Prisma.BudgetTrendWhereInput = {};

    if (agency) {
      baseWhere.agency = { contains: agency, mode: "insensitive" };
    }
    if (appropriationTypes.length > 0) {
      baseWhere.appropriationType = { in: appropriationTypes };
    }
    if (query) {
      baseWhere.OR = [
        { programElement: { contains: query, mode: "insensitive" } },
        { programName: { contains: query, mode: "insensitive" } },
      ];
    }

    // Get trend data by fiscal year
    const trendData = await prisma.budgetTrend.groupBy({
      by: ["fiscalYear"],
      where: baseWhere,
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        fiscalYear: "asc",
      },
    });

    // Get breakdown by agency (for bar chart)
    const agencyData = await prisma.budgetTrend.groupBy({
      by: ["agency"],
      where: {
        ...baseWhere,
        agency: { not: null },
      },
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
      take: 10, // Top 10 agencies
    });

    // Get breakdown by appropriation type (optional additional chart)
    const appropriationData = await prisma.budgetTrend.groupBy({
      by: ["appropriationType"],
      where: {
        ...baseWhere,
        appropriationType: { not: null },
      },
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    });

    // Format response
    return NextResponse.json({
      trend: trendData.map(d => ({
        fiscalYear: d.fiscalYear,
        totalAmount: d._sum.amount ? Number(d._sum.amount) : 0,
        programCount: d._count.id,
      })),
      byAgency: agencyData.map(d => ({
        agency: d.agency || "Unknown",
        totalAmount: d._sum.amount ? Number(d._sum.amount) : 0,
        programCount: d._count.id,
      })),
      byAppropriation: appropriationData.map(d => ({
        appropriationType: d.appropriationType || "Unknown",
        totalAmount: d._sum.amount ? Number(d._sum.amount) : 0,
        programCount: d._count.id,
      })),
    });
  } catch (error) {
    console.error("Budget chart data error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chart data" },
      { status: 500 }
    );
  }
}
