import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startSearchJob } from "@/lib/external/search-worker";

interface SearchResult {
  id: number;
  piid: string;
  parentIdvPiid: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  vendorName: string | null;
  vendorUei: string | null;
  cageCode: string | null;
  awardDescription: string | null;
  productOrServiceDescription: string | null;
  naicsDescription: string | null;
  awardDate: string | null;
  periodOfPerformanceStart: string | null;
  periodOfPerformanceEnd: string | null;
  obligatedAmount: number | null;
  baseAndExercisedValue: number | null;
  potentialValue: number | null;
  naicsCode: string | null;
  pscCode: string | null;
  awardingAgency: string | null;
  fundingAgency: string | null;
  placeOfPerformanceState: string | null;
  placeOfPerformanceCountry: string | null;
  rank: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, page = 1, limit = 50, fetchExternal = false } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
    const offset = (pageNum - 1) * limitNum;

    // Full-text search with ranking
    const results = await prisma.$queryRawUnsafe<SearchResult[]>(`
      SELECT
        id, piid, parent_idv_piid as "parentIdvPiid",
        vehicle_id as "vehicleId", vehicle_name as "vehicleName",
        vendor_name as "vendorName", vendor_uei as "vendorUei", cage_code as "cageCode",
        award_description as "awardDescription",
        product_or_service_description as "productOrServiceDescription",
        naics_description as "naicsDescription",
        award_date as "awardDate",
        period_of_performance_start as "periodOfPerformanceStart",
        period_of_performance_end as "periodOfPerformanceEnd",
        obligated_amount as "obligatedAmount",
        base_and_exercised_value as "baseAndExercisedValue",
        potential_value as "potentialValue",
        naics_code as "naicsCode", psc_code as "pscCode",
        awarding_agency as "awardingAgency", funding_agency as "fundingAgency",
        place_of_performance_state as "placeOfPerformanceState",
        place_of_performance_country as "placeOfPerformanceCountry",
        ts_rank(search_text, plainto_tsquery('english', $1)) as rank
      FROM task_orders
      WHERE search_text @@ plainto_tsquery('english', $1)
         OR piid ILIKE $2
         OR vendor_name ILIKE $2
      ORDER BY
        CASE WHEN piid ILIKE $2 THEN 0 ELSE 1 END,
        ts_rank(search_text, plainto_tsquery('english', $1)) DESC,
        obligated_amount DESC NULLS LAST
      LIMIT $3 OFFSET $4
    `, trimmedQuery, `%${trimmedQuery}%`, limitNum, offset);

    // Get total count
    const countResult = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count
      FROM task_orders
      WHERE search_text @@ plainto_tsquery('english', $1)
         OR piid ILIKE $2
         OR vendor_name ILIKE $2
    `, trimmedQuery, `%${trimmedQuery}%`);

    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limitNum);

    // Determine if we should trigger external search
    let searchJobId: number | undefined;
    const shouldFetchExternal = fetchExternal || total < 10;

    if (shouldFetchExternal) {
      // Create a search job for background processing
      const searchJob = await prisma.searchJob.create({
        data: {
          query: trimmedQuery,
          status: "pending",
          internalCount: total,
        },
      });
      searchJobId = searchJob.id;

      // Start background processing (fire and forget)
      startSearchJob(searchJobId);
    }

    return NextResponse.json({
      results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      searchJobId,
      source: "internal" as const,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

// Also support GET for simple queries
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || searchParams.get("query");
  const page = searchParams.get("page") || "1";
  const limit = searchParams.get("limit") || "50";
  const fetchExternal = searchParams.get("fetchExternal") === "true";

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  // Reuse POST logic
  const mockRequest = {
    json: async () => ({ query, page, limit, fetchExternal }),
  } as NextRequest;

  return POST(mockRequest);
}
