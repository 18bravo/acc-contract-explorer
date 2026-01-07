/**
 * Sync DoD Services Contracts for Waste Screener
 * Fetches from USASpending API and calculates waste scores
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  searchDoDServicesContracts,
  fetchSubawards,
  SERVICE_NAICS_CODES,
} from "../src/lib/waste/usaspending-client";
import { saveWasteScore } from "../src/lib/waste/score-calculator";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function syncContracts() {
  console.log("Starting contract sync...");

  let page = 1;
  let hasMore = true;
  let totalProcessed = 0;
  let totalNew = 0;

  while (hasMore && page <= 100) {
    console.log(`Fetching page ${page}...`);

    const { results, hasNext } = await searchDoDServicesContracts({
      naicsCodes: SERVICE_NAICS_CODES,
      minAmount: 100000,
      page,
      limit: 100,
    });

    for (const contract of results) {
      try {
        // Check if exists
        const existing = await prisma.serviceContract.findUnique({
          where: { piid: contract.piid },
        });

        if (existing) {
          // Update
          await prisma.serviceContract.update({
            where: { piid: contract.piid },
            data: {
              currentValue: contract.currentValue,
              obligatedAmount: contract.obligatedAmount,
              lastModifiedDate: contract.lastModifiedDate ? new Date(contract.lastModifiedDate) : null,
              updatedAt: new Date(),
            },
          });
        } else {
          // Create
          const created = await prisma.serviceContract.create({
            data: {
              piid: contract.piid,
              parentIdvPiid: contract.parentIdvPiid,
              awardDescription: contract.awardDescription,
              awardType: contract.awardType,
              awardDate: contract.awardDate ? new Date(contract.awardDate) : null,
              periodOfPerformanceStart: contract.periodOfPerformanceStart ? new Date(contract.periodOfPerformanceStart) : null,
              periodOfPerformanceEnd: contract.periodOfPerformanceEnd ? new Date(contract.periodOfPerformanceEnd) : null,
              baseValue: contract.baseValue,
              currentValue: contract.currentValue,
              obligatedAmount: contract.obligatedAmount,
              awardCeiling: contract.awardCeiling,
              naicsCode: contract.naicsCode,
              naicsDescription: contract.naicsDescription,
              pscCode: contract.pscCode,
              pscDescription: contract.pscDescription,
              vendorName: contract.vendorName,
              vendorUei: contract.vendorUei,
              vendorCageCode: contract.vendorCageCode,
              contractingOfficeName: contract.contractingOfficeName,
              awardingAgency: contract.awardingAgency,
              awardingSubAgency: contract.awardingSubAgency,
              fundingAgency: contract.fundingAgency,
              placeOfPerformanceState: contract.placeOfPerformanceState,
              usaspendingAwardId: contract.usaspendingAwardId,
              lastModifiedDate: contract.lastModifiedDate ? new Date(contract.lastModifiedDate) : null,
            },
          });

          // Fetch subawards for new contracts
          if (contract.usaspendingAwardId) {
            const subs = await fetchSubawards(contract.usaspendingAwardId);
            for (const sub of subs) {
              await prisma.subaward.create({
                data: {
                  contractId: created.id,
                  subawardNumber: sub.subawardNumber,
                  subawardAmount: sub.subawardAmount,
                  subcontractorName: sub.subcontractorName,
                  subcontractorUei: sub.subcontractorUei,
                  description: sub.description,
                  actionDate: sub.actionDate ? new Date(sub.actionDate) : null,
                  placeOfPerformanceState: sub.placeOfPerformanceState,
                },
              });
            }
          }

          totalNew++;
        }

        totalProcessed++;
      } catch (error) {
        console.error(`Error processing ${contract.piid}:`, error);
      }
    }

    hasMore = hasNext;
    page++;

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`Sync complete. Processed: ${totalProcessed}, New: ${totalNew}`);

  // Calculate waste scores
  console.log("Calculating waste scores...");
  const contracts = await prisma.serviceContract.findMany({ select: { id: true } });

  let scored = 0;
  for (const contract of contracts) {
    try {
      await saveWasteScore(contract.id);
      scored++;
      if (scored % 100 === 0) {
        console.log(`Scored ${scored}/${contracts.length}`);
      }
    } catch (error) {
      console.error(`Error scoring contract ${contract.id}:`, error);
    }
  }

  console.log(`Scoring complete. Total: ${scored}`);
}

syncContracts()
  .catch(console.error)
  .finally(() => {
    pool.end();
    process.exit(0);
  });
