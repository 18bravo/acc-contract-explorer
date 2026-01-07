import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters
    const fiscalYears = searchParams.get("fy")?.split(",").map(Number).filter(Boolean) || [];
    const agency = searchParams.get("agency") || null;
    const service = searchParams.get("service") || null;
    const appropriationTypes = searchParams.get("approp")?.split(",").filter(Boolean) || [];
    const query = searchParams.get("q") || null;

    // Build where clause
    const where: Prisma.BudgetTrendWhereInput = {};

    if (fiscalYears.length > 0) {
      where.fiscalYear = { in: fiscalYears };
    }
    if (agency) {
      where.agency = { contains: agency, mode: "insensitive" };
    }
    if (appropriationTypes.length > 0) {
      where.appropriationType = { in: appropriationTypes };
    }
    if (query) {
      where.OR = [
        { programElement: { contains: query, mode: "insensitive" } },
        { programName: { contains: query, mode: "insensitive" } },
      ];
    }

    // Get aggregated stats
    const [totalPrograms, aggregates, fiscalYearOptions, agencyOptions, appropriationTypeOptions] = await Promise.all([
      // Total programs matching filters
      prisma.budgetTrend.count({ where }),

      // Aggregate stats
      prisma.budgetTrend.aggregate({
        where,
        _sum: {
          amount: true,
          yoyChangeDollars: true,
        },
        _avg: {
          yoyChangePercent: true,
        },
      }),

      // Available fiscal years for filter
      prisma.budgetTrend.findMany({
        where: {},
        select: { fiscalYear: true },
        distinct: ["fiscalYear"],
        orderBy: { fiscalYear: "desc" },
      }),

      // Available agencies for filter
      prisma.budgetTrend.findMany({
        where: { agency: { not: null } },
        select: { agency: true },
        distinct: ["agency"],
        orderBy: { agency: "asc" },
      }),

      // Available appropriation types
      prisma.budgetTrend.findMany({
        where: { appropriationType: { not: null } },
        select: { appropriationType: true },
        distinct: ["appropriationType"],
        orderBy: { appropriationType: "asc" },
      }),
    ]);

    // Calculate the latest fiscal year for display
    const latestFY = fiscalYears.length > 0
      ? Math.max(...fiscalYears)
      : fiscalYearOptions[0]?.fiscalYear || new Date().getFullYear();

    return NextResponse.json({
      summary: {
        totalPrograms,
        totalBudget: aggregates._sum.amount ? Number(aggregates._sum.amount) : 0,
        avgYoyChangePercent: aggregates._avg.yoyChangePercent ? Number(aggregates._avg.yoyChangePercent) : null,
        netChangeDollars: aggregates._sum.yoyChangeDollars ? Number(aggregates._sum.yoyChangeDollars) : 0,
        displayFiscalYear: latestFY,
      },
      filters: {
        fiscalYears: fiscalYearOptions.map(f => f.fiscalYear),
        agencies: agencyOptions.map(a => a.agency).filter(Boolean) as string[],
        appropriationTypes: appropriationTypeOptions.map(a => a.appropriationType).filter(Boolean) as string[],
      },
    });
  } catch (error) {
    console.error("Budget summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget summary" },
      { status: 500 }
    );
  }
}
