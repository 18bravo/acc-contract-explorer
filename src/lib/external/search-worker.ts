/**
 * Background Search Worker
 * Queries external APIs and deduplicates results
 * Now with OpenAI-powered query parsing for intelligent contract vehicle identification
 */

import { prisma } from "@/lib/prisma";
import { searchUSAspending, searchByPIID } from "./usaspending";
import { searchSAM, searchSAMByPIID } from "./sam";
import { parseSearchQuery } from "./query-parser";

interface ExternalTaskOrder {
  piid: string;
  parentIdvPiid?: string | null;
  vendorName?: string | null;
  vendorUei?: string | null;
  cageCode?: string | null;
  awardDescription?: string | null;
  awardDate?: string | null;
  periodOfPerformanceStart?: string | null;
  periodOfPerformanceEnd?: string | null;
  obligatedAmount?: number | null;
  naicsCode?: string | null;
  naicsDescription?: string | null;
  pscCode?: string | null;
  awardingAgency?: string | null;
  fundingAgency?: string | null;
  placeOfPerformanceState?: string | null;
  placeOfPerformanceCountry?: string | null;
}

/**
 * Check if a record already exists (deduplication by PIID + vendor name)
 */
async function recordExists(piid: string, vendorName: string | null): Promise<boolean> {
  if (!piid) return true; // Skip empty PIIDs

  const existing = await prisma.taskOrder.findFirst({
    where: {
      piid: piid,
      ...(vendorName
        ? { vendorName: { equals: vendorName, mode: "insensitive" } }
        : {}),
    },
    select: { id: true },
  });

  return !!existing;
}

/**
 * Insert a new task order from external source
 */
async function insertTaskOrder(record: ExternalTaskOrder): Promise<boolean> {
  try {
    // Generate search text for full-text search
    const searchText = [
      record.piid,
      record.vendorName,
      record.awardDescription,
      record.naicsCode,
      record.naicsDescription,
      record.pscCode,
      record.awardingAgency,
      record.fundingAgency,
    ]
      .filter(Boolean)
      .join(" ");

    await prisma.taskOrder.create({
      data: {
        piid: record.piid,
        parentIdvPiid: record.parentIdvPiid || null,
        vehicleId: null, // External records don't have a vehicle assignment
        vehicleName: "External",
        vendorName: record.vendorName || null,
        vendorUei: record.vendorUei || null,
        cageCode: record.cageCode || null,
        awardDescription: record.awardDescription || null,
        awardDate: record.awardDate || null,
        periodOfPerformanceStart: record.periodOfPerformanceStart || null,
        periodOfPerformanceEnd: record.periodOfPerformanceEnd || null,
        obligatedAmount: record.obligatedAmount || null,
        naicsCode: record.naicsCode || null,
        naicsDescription: record.naicsDescription || null,
        pscCode: record.pscCode || null,
        awardingAgency: record.awardingAgency || null,
        fundingAgency: record.fundingAgency || null,
        placeOfPerformanceState: record.placeOfPerformanceState || null,
        placeOfPerformanceCountry: record.placeOfPerformanceCountry || null,
      },
    });

    // Update search_text column via raw SQL
    await prisma.$executeRawUnsafe(`
      UPDATE task_orders
      SET search_text = to_tsvector('english', $1)
      WHERE piid = $2 AND search_text IS NULL
    `, searchText, record.piid);

    return true;
  } catch (error) {
    console.error(`Failed to insert task order ${record.piid}:`, error);
    return false;
  }
}

/**
 * Process a search job - query external APIs and deduplicate
 * Uses OpenAI to parse natural language queries and identify contract vehicles
 */
export async function processSearchJob(jobId: number): Promise<void> {
  // Update job status to running
  const job = await prisma.searchJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  const query = job.query;
  let externalCount = 0;
  let newRecords = 0;

  try {
    // Parse the query to extract contract vehicle info, PIID prefixes, etc.
    console.log(`[SearchJob ${jobId}] Parsing query: "${query}"`);
    const parsedQuery = await parseSearchQuery(query);

    if (parsedQuery.contractVehicle) {
      console.log(`[SearchJob ${jobId}] Identified contract vehicle: ${parsedQuery.contractVehicle} (PIID: ${parsedQuery.piidPrefix})`);
    }
    if (parsedQuery.vendorName) {
      console.log(`[SearchJob ${jobId}] Identified vendor: ${parsedQuery.vendorName}`);
    }

    // Build list of queries to execute
    const searchPromises: Promise<ExternalTaskOrder[]>[] = [];

    // Always search with the original query
    searchPromises.push(searchUSAspending(query, 50));
    searchPromises.push(searchSAM(query, 50));

    // If we identified a PIID prefix, also search by PIID
    if (parsedQuery.piidPrefix) {
      console.log(`[SearchJob ${jobId}] Also searching by PIID prefix: ${parsedQuery.piidPrefix}`);
      searchPromises.push(searchByPIID(parsedQuery.piidPrefix, 50));
      searchPromises.push(searchSAMByPIID(parsedQuery.piidPrefix, 50));
    }

    // If we identified a vendor, search for vendor specifically
    if (parsedQuery.vendorName && parsedQuery.vendorName !== query) {
      searchPromises.push(searchUSAspending(parsedQuery.vendorName, 25));
      searchPromises.push(searchSAM(parsedQuery.vendorName, 25));
    }

    // Execute all searches in parallel
    const allSearchResults = await Promise.all(searchPromises);

    // Flatten results
    const usaResults = allSearchResults[0] || [];
    const samResults = allSearchResults[1] || [];
    const piidUsaResults = allSearchResults[2] || [];
    const piidSamResults = allSearchResults[3] || [];
    const vendorUsaResults = allSearchResults[4] || [];
    const vendorSamResults = allSearchResults[5] || [];

    // Count total external results found (before deduplication)
    externalCount = usaResults.length + samResults.length +
      piidUsaResults.length + piidSamResults.length +
      vendorUsaResults.length + vendorSamResults.length;

    console.log(`[SearchJob ${jobId}] Found ${externalCount} total results from external APIs`);

    // Combine all results
    const allResultsRaw: ExternalTaskOrder[] = [
      ...usaResults.map((r) => ({ ...r } as ExternalTaskOrder)),
      ...samResults.map((r) => ({ ...r } as ExternalTaskOrder)),
      ...piidUsaResults.map((r) => ({ ...r } as ExternalTaskOrder)),
      ...piidSamResults.map((r) => ({ ...r } as ExternalTaskOrder)),
      ...vendorUsaResults.map((r) => ({ ...r } as ExternalTaskOrder)),
      ...vendorSamResults.map((r) => ({ ...r } as ExternalTaskOrder)),
    ];

    // Deduplicate by PIID for database insertion (keep first occurrence)
    const seenPiids = new Set<string>();
    const uniqueResults: ExternalTaskOrder[] = [];
    for (const result of allResultsRaw) {
      if (result.piid && !seenPiids.has(result.piid)) {
        seenPiids.add(result.piid);
        uniqueResults.push(result);
      }
    }

    console.log(`[SearchJob ${jobId}] After deduplication: ${uniqueResults.length} unique results for DB insertion`);
    console.log(`[SearchJob ${jobId}] Caching ${allResultsRaw.length} total external results for display`);

    // Process unique results for database insertion
    for (const record of uniqueResults) {
      if (!record.piid) continue;

      const exists = await recordExists(record.piid, record.vendorName || null);

      if (!exists) {
        const inserted = await insertTaskOrder(record);
        if (inserted) {
          newRecords++;
        }
      }
    }

    // Update job as completed with ALL external results for display (not just unique)
    // This ensures users see everything that was found, even if it's already in the DB
    await prisma.searchJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        externalCount,
        newRecords,
        externalResults: JSON.parse(JSON.stringify(allResultsRaw.slice(0, 100))), // Cache top 100 results for display
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`Search job ${jobId} failed:`, error);

    // Update job as failed
    await prisma.searchJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Start processing a job (can be called async)
 */
export function startSearchJob(jobId: number): void {
  // Process in background - don't await
  processSearchJob(jobId).catch((error) => {
    console.error(`Background job ${jobId} error:`, error);
  });
}
