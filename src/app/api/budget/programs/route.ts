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

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const skip = (page - 1) * limit;

    // Sorting
    const sortBy = searchParams.get("sortBy") || "yoyChangePercent";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

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

    // Build orderBy
    const orderBy: Prisma.BudgetTrendOrderByWithRelationInput = {};
    if (sortBy === "amount") {
      orderBy.amount = sortOrder;
    } else if (sortBy === "yoyChangeDollars") {
      orderBy.yoyChangeDollars = sortOrder;
    } else if (sortBy === "yoyChangePercent") {
      orderBy.yoyChangePercent = sortOrder;
    } else if (sortBy === "programElement") {
      orderBy.programElement = sortOrder;
    } else if (sortBy === "programName") {
      orderBy.programName = sortOrder;
    } else if (sortBy === "agency") {
      orderBy.agency = sortOrder;
    } else if (sortBy === "fiscalYear") {
      orderBy.fiscalYear = sortOrder;
    }

    // Fetch programs with pagination
    const [programs, total] = await Promise.all([
      prisma.budgetTrend.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          programElement: true,
          programName: true,
          fiscalYear: true,
          agency: true,
          appropriationType: true,
          amount: true,
          yoyChangeDollars: true,
          yoyChangePercent: true,
          fiveYearCagr: true,
          trendDirection: true,
        },
      }),
      prisma.budgetTrend.count({ where }),
    ]);

    // Format response
    const formattedPrograms = programs.map(p => ({
      ...p,
      amount: p.amount ? Number(p.amount) : null,
      yoyChangeDollars: p.yoyChangeDollars ? Number(p.yoyChangeDollars) : null,
      yoyChangePercent: p.yoyChangePercent ? Number(p.yoyChangePercent) : null,
      fiveYearCagr: p.fiveYearCagr ? Number(p.fiveYearCagr) : null,
    }));

    return NextResponse.json({
      programs: formattedPrograms,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Budget programs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget programs" },
      { status: 500 }
    );
  }
}
