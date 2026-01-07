import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    // Sorting
    const sortBy = searchParams.get("sortBy") || "riskScore";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Filters
    const pscCode = searchParams.get("psc");
    const agency = searchParams.get("agency");
    const minRiskScore = searchParams.get("minRiskScore") ? parseInt(searchParams.get("minRiskScore")!) : undefined;
    const maxRiskScore = searchParams.get("maxRiskScore") ? parseInt(searchParams.get("maxRiskScore")!) : undefined;
    const confidenceLevel = searchParams.get("confidence");
    const lifecycleStage = searchParams.get("lifecycle"); // early, mid, late

    // Build where clause for ServiceContract
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      riskScore: { isNot: null },
    };

    if (pscCode) {
      where.pscCode = { startsWith: pscCode };
    }
    if (agency) {
      where.awardingAgency = { contains: agency, mode: "insensitive" };
    }

    // Risk score filters on relation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riskScoreWhere: any = {};
    if (minRiskScore !== undefined) {
      riskScoreWhere.riskScore = { gte: minRiskScore };
    }
    if (maxRiskScore !== undefined) {
      riskScoreWhere.riskScore = {
        ...(riskScoreWhere.riskScore || {}),
        lte: maxRiskScore
      };
    }
    if (confidenceLevel) {
      riskScoreWhere.confidenceLevel = confidenceLevel;
    }
    if (lifecycleStage) {
      const ranges: Record<string, { gte: number; lt?: number }> = {
        early: { gte: 0, lt: 25 },
        mid: { gte: 25, lt: 75 },
        late: { gte: 75 },
      };
      if (ranges[lifecycleStage]) {
        riskScoreWhere.lifecycleStage = ranges[lifecycleStage];
      }
    }

    if (Object.keys(riskScoreWhere).length > 0) {
      where.riskScore = riskScoreWhere;
    }

    // Build orderBy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any[] = [];
    if (sortBy === "riskScore") {
      orderBy.push({ riskScore: { riskScore: sortOrder } });
    } else if (sortBy === "breachProbability") {
      orderBy.push({ riskScore: { ceilingBreachProb: sortOrder } });
    } else if (sortBy === "monthsToWarning") {
      orderBy.push({ riskScore: { monthsToWarning: sortOrder } });
    } else if (sortBy === "obligatedAmount") {
      orderBy.push({ obligatedAmount: sortOrder });
    }

    // Execute query
    const [contracts, total] = await Promise.all([
      prisma.serviceContract.findMany({
        where,
        include: {
          riskScore: true,
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.serviceContract.count({ where }),
    ]);

    return NextResponse.json({
      results: contracts.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        awardCeiling: c.awardCeiling ? Number(c.awardCeiling) : null,
        pscCode: c.pscCode,
        awardingAgency: c.awardingAgency,
        riskScore: c.riskScore?.riskScore ?? null,
        currentRatio: c.riskScore?.currentRatio ? Number(c.riskScore.currentRatio) : null,
        breachProbability: c.riskScore?.ceilingBreachProb ? Number(c.riskScore.ceilingBreachProb) : null,
        monthsToWarning: c.riskScore?.monthsToWarning ?? null,
        lifecycleStage: c.riskScore?.lifecycleStage ?? null,
        confidenceLevel: c.riskScore?.confidenceLevel ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Risk contracts list error:", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}
