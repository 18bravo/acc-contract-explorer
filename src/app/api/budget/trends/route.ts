import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fiscalYear = searchParams.get("fiscalYear");
    const agency = searchParams.get("agency");
    const programElement = searchParams.get("programElement");
    const direction = searchParams.get("direction"); // up, down, flat, new, terminated
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build where clause
    const where: Record<string, unknown> = {};

    if (fiscalYear) {
      where.fiscalYear = parseInt(fiscalYear);
    }
    if (agency) {
      where.agency = { contains: agency, mode: "insensitive" };
    }
    if (programElement) {
      where.programElement = { contains: programElement, mode: "insensitive" };
    }
    if (direction) {
      where.trendDirection = direction;
    }

    // Get trends with pagination
    const [trends, totalCount] = await Promise.all([
      prisma.budgetTrend.findMany({
        where,
        orderBy: [
          { fiscalYear: "desc" },
          { yoyChangePercent: "desc" },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.budgetTrend.count({ where }),
    ]);

    // Get available fiscal years for filtering
    const fiscalYears = await prisma.budgetTrend.findMany({
      select: { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy: { fiscalYear: "desc" },
    });

    // Get available agencies for filtering
    const agencies = await prisma.budgetTrend.findMany({
      where: { agency: { not: null } },
      select: { agency: true },
      distinct: ["agency"],
      orderBy: { agency: "asc" },
    });

    return NextResponse.json({
      trends: trends.map((t) => ({
        id: t.id,
        programElement: t.programElement,
        programName: t.programName,
        fiscalYear: t.fiscalYear,
        agency: t.agency,
        appropriationType: t.appropriationType,
        amount: t.amount ? Number(t.amount) : null,
        yoyChangeDollars: t.yoyChangeDollars ? Number(t.yoyChangeDollars) : null,
        yoyChangePercent: t.yoyChangePercent ? Number(t.yoyChangePercent) : null,
        fiveYearCagr: t.fiveYearCagr ? Number(t.fiveYearCagr) : null,
        trendDirection: t.trendDirection,
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      filters: {
        fiscalYears: fiscalYears.map((f) => f.fiscalYear),
        agencies: agencies.map((a) => a.agency).filter(Boolean),
      },
    });
  } catch (error) {
    console.error("Error fetching budget trends:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget trends" },
      { status: 500 }
    );
  }
}
