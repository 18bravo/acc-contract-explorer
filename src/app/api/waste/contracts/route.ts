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
    const sortBy = searchParams.get("sortBy") || "overallScore";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Filters
    const naicsCode = searchParams.get("naics");
    const pscCode = searchParams.get("psc");
    const agency = searchParams.get("agency");
    const minAmount = searchParams.get("minAmount") ? parseFloat(searchParams.get("minAmount")!) : undefined;
    const maxAmount = searchParams.get("maxAmount") ? parseFloat(searchParams.get("maxAmount")!) : undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Flag filters
    const flagCostGrowth = searchParams.get("flagCostGrowth") === "true";
    const flagUnderutilized = searchParams.get("flagUnderutilized") === "true";
    const flagOldContract = searchParams.get("flagOldContract") === "true";
    const flagHighMods = searchParams.get("flagHighMods") === "true";
    const flagPassThru = searchParams.get("flagPassThru") === "true";
    const flagVendorConc = searchParams.get("flagVendorConc") === "true";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (naicsCode) {
      where.naicsCode = { startsWith: naicsCode };
    }
    if (pscCode) {
      where.pscCode = { startsWith: pscCode };
    }
    if (agency) {
      where.awardingAgency = { contains: agency, mode: "insensitive" };
    }
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.obligatedAmount = {};
      if (minAmount !== undefined) (where.obligatedAmount as Record<string, number>).gte = minAmount;
      if (maxAmount !== undefined) (where.obligatedAmount as Record<string, number>).lte = maxAmount;
    }
    if (startDate) {
      where.awardDate = { ...((where.awardDate as Record<string, unknown>) || {}), gte: new Date(startDate) };
    }
    if (endDate) {
      where.awardDate = { ...((where.awardDate as Record<string, unknown>) || {}), lte: new Date(endDate) };
    }

    // Flag filters on waste score
    const wasteScoreWhere: Record<string, boolean> = {};
    if (flagCostGrowth) wasteScoreWhere.flagCostGrowth = true;
    if (flagUnderutilized) wasteScoreWhere.flagUnderutilized = true;
    if (flagOldContract) wasteScoreWhere.flagOldContract = true;
    if (flagHighMods) wasteScoreWhere.flagHighMods = true;
    if (flagPassThru) wasteScoreWhere.flagPassThru = true;
    if (flagVendorConc) wasteScoreWhere.flagVendorConc = true;

    if (Object.keys(wasteScoreWhere).length > 0) {
      where.wasteScore = wasteScoreWhere;
    }

    // Build orderBy
    const orderBy: Record<string, unknown>[] = [];
    if (sortBy === "overallScore") {
      orderBy.push({ wasteScore: { overallScore: sortOrder } });
    } else if (sortBy === "obligatedAmount") {
      orderBy.push({ obligatedAmount: sortOrder });
    } else if (sortBy === "awardDate") {
      orderBy.push({ awardDate: sortOrder });
    } else if (sortBy === "vendorName") {
      orderBy.push({ vendorName: sortOrder });
    }

    // Execute query
    const [contracts, total] = await Promise.all([
      prisma.serviceContract.findMany({
        where,
        include: {
          wasteScore: true,
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
        awardDescription: c.awardDescription,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        awardCeiling: c.awardCeiling ? Number(c.awardCeiling) : null,
        awardDate: c.awardDate?.toISOString().split("T")[0] || null,
        naicsCode: c.naicsCode,
        pscCode: c.pscCode,
        awardingAgency: c.awardingAgency,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
        flags: c.wasteScore
          ? {
              costGrowth: c.wasteScore.flagCostGrowth,
              underutilized: c.wasteScore.flagUnderutilized,
              oldContract: c.wasteScore.flagOldContract,
              highMods: c.wasteScore.flagHighMods,
              passThru: c.wasteScore.flagPassThru,
              vendorConc: c.wasteScore.flagVendorConc,
              duplicate: c.wasteScore.flagDuplicate,
              highRate: c.wasteScore.flagHighRate,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Waste contracts list error:", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}
