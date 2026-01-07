import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fiscalYear = searchParams.get("fiscalYear");
    const type = searchParams.get("type") || "both"; // gainers, losers, both
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const minChangePercent = parseFloat(searchParams.get("minChangePercent") || "10");

    // Build base where clause
    const baseWhere: Record<string, unknown> = {
      yoyChangePercent: { not: null },
    };

    if (fiscalYear) {
      baseWhere.fiscalYear = parseInt(fiscalYear);
    }

    // Get top gainers (largest positive YoY change)
    const gainersPromise =
      type === "losers"
        ? Promise.resolve([])
        : prisma.budgetTrend.findMany({
            where: {
              ...baseWhere,
              yoyChangePercent: { gte: minChangePercent },
            },
            orderBy: { yoyChangePercent: "desc" },
            take: limit,
          });

    // Get top losers (largest negative YoY change)
    const losersPromise =
      type === "gainers"
        ? Promise.resolve([])
        : prisma.budgetTrend.findMany({
            where: {
              ...baseWhere,
              yoyChangePercent: { lte: -minChangePercent },
            },
            orderBy: { yoyChangePercent: "asc" },
            take: limit,
          });

    // Get new programs (trendDirection = 'new')
    const newProgramsPromise = prisma.budgetTrend.findMany({
      where: {
        ...(fiscalYear ? { fiscalYear: parseInt(fiscalYear) } : {}),
        trendDirection: "new",
      },
      orderBy: { amount: "desc" },
      take: limit,
    });

    // Get terminated programs
    const terminatedPromise = prisma.budgetTrend.findMany({
      where: {
        ...(fiscalYear ? { fiscalYear: parseInt(fiscalYear) } : {}),
        trendDirection: "terminated",
      },
      orderBy: { amount: "desc" },
      take: limit,
    });

    // Summary stats
    const summaryPromise = prisma.budgetTrend.aggregate({
      where: fiscalYear ? { fiscalYear: parseInt(fiscalYear) } : {},
      _count: true,
      _avg: { yoyChangePercent: true },
      _sum: { yoyChangeDollars: true },
    });

    const [gainers, losers, newPrograms, terminated, summary] = await Promise.all([
      gainersPromise,
      losersPromise,
      newProgramsPromise,
      terminatedPromise,
      summaryPromise,
    ]);

    const formatTrend = (t: typeof gainers[0]) => ({
      id: t.id,
      programElement: t.programElement,
      programName: t.programName,
      fiscalYear: t.fiscalYear,
      agency: t.agency,
      amount: t.amount ? Number(t.amount) : null,
      yoyChangeDollars: t.yoyChangeDollars ? Number(t.yoyChangeDollars) : null,
      yoyChangePercent: t.yoyChangePercent ? Number(t.yoyChangePercent) : null,
      trendDirection: t.trendDirection,
    });

    // Get available fiscal years
    const fiscalYears = await prisma.budgetTrend.findMany({
      select: { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy: { fiscalYear: "desc" },
    });

    return NextResponse.json({
      gainers: gainers.map(formatTrend),
      losers: losers.map(formatTrend),
      newPrograms: newPrograms.map(formatTrend),
      terminated: terminated.map(formatTrend),
      summary: {
        totalPrograms: summary._count,
        avgChangePercent: summary._avg.yoyChangePercent
          ? Number(summary._avg.yoyChangePercent)
          : null,
        netChangeDollars: summary._sum.yoyChangeDollars
          ? Number(summary._sum.yoyChangeDollars)
          : null,
      },
      filters: {
        fiscalYears: fiscalYears.map((f) => f.fiscalYear),
      },
    });
  } catch (error) {
    console.error("Error fetching budget movers:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget movers" },
      { status: 500 }
    );
  }
}
