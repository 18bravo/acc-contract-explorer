#!/usr/bin/env npx tsx
/**
 * Budget Document Crawler CLI
 *
 * Usage:
 *   npx tsx scripts/crawl-budgets.ts seed     # Seed known documents
 *   npx tsx scripts/crawl-budgets.ts download # Download pending documents
 *   npx tsx scripts/crawl-budgets.ts status   # Show document status
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { KNOWN_R2_DOCUMENTS, seedKnownDocuments, downloadPendingDocuments } from "../src/lib/budget/crawler";
import { parseR2Document, parseAndSaveR2Document } from "../src/lib/budget/parser";
import { computeTrends, getTopMovers } from "../src/lib/budget/loader";

async function seed() {
  console.log("Seeding known R-2 documents...");
  const created = await seedKnownDocuments(KNOWN_R2_DOCUMENTS);
  console.log(`Created ${created} new document records`);
}

async function download() {
  const limit = parseInt(process.argv[3] || "10");
  console.log(`Downloading up to ${limit} pending documents...\n`);
  const result = await downloadPendingDocuments(limit);
  console.log(`\nResults:`);
  console.log(`  Downloaded: ${result.downloaded}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Failed: ${result.failed}`);
}

async function status() {
  const stats = await prisma.budgetDocument.groupBy({
    by: ["status"],
    _count: true,
  });

  const byFY = await prisma.budgetDocument.groupBy({
    by: ["fiscalYear"],
    _count: true,
  });

  const lineItemCount = await prisma.budgetLineItem.count();
  const narrativeCount = await prisma.budgetNarrative.count();

  console.log("\nDocument Status:");
  console.log("================");
  for (const s of stats) {
    console.log(`  ${s.status}: ${s._count}`);
  }

  console.log("\nBy Fiscal Year:");
  console.log("===============");
  for (const fy of byFY.sort((a, b) => b.fiscalYear - a.fiscalYear)) {
    console.log(`  FY${fy.fiscalYear}: ${fy._count} documents`);
  }

  console.log("\nExtracted Data:");
  console.log("===============");
  console.log(`  Line Items: ${lineItemCount}`);
  console.log(`  Narratives: ${narrativeCount}`);
}

async function parse() {
  console.log("Parsing downloaded documents...\n");

  // Find downloaded documents that haven't been parsed
  const docs = await prisma.budgetDocument.findMany({
    where: { status: "downloaded" },
    orderBy: { fiscalYear: "desc" },
  });

  if (docs.length === 0) {
    console.log("No documents to parse. Run 'download' first.");
    return;
  }

  let parsed = 0;
  let failed = 0;

  for (const doc of docs) {
    if (!doc.localPath) {
      console.log(`Skipping ${doc.filename}: no local path`);
      continue;
    }

    console.log(`Parsing: ${doc.filename}`);
    const result = await parseAndSaveR2Document(doc.localPath, doc.id);

    if (result.success) {
      parsed++;
      console.log(`  ✓ Extracted ${result.lineItemCount} line items`);
    } else {
      failed++;
      console.log(`  ✗ Error: ${result.error}`);
    }
  }

  console.log(`\nResults:`);
  console.log(`  Parsed: ${parsed}`);
  console.log(`  Failed: ${failed}`);
}

async function testParse(filePath?: string) {
  if (!filePath) {
    // Find a downloaded document to test
    const doc = await prisma.budgetDocument.findFirst({
      where: { status: "downloaded" },
    });
    if (!doc?.localPath) {
      console.log("No downloaded documents to test. Run 'download' first.");
      return;
    }
    filePath = doc.localPath;
  }

  console.log(`Testing parse on: ${filePath}\n`);
  const result = await parseR2Document(filePath);

  console.log(`Fiscal Year: ${result.fiscalYear}`);
  console.log(`Agency: ${result.agency}`);
  console.log(`Page Count: ${result.pageCount}`);
  console.log(`Line Items Found: ${result.lineItems.length}`);

  console.log("\nFirst 10 Line Items:");
  console.log("====================");
  for (const item of result.lineItems.slice(0, 10)) {
    console.log(`  ${item.programElement}: ${item.programName?.substring(0, 60)}...`);
    if (item.priorYear || item.currentYear || item.budgetYear) {
      console.log(`    Funding: ${item.priorYear || "-"} / ${item.currentYear || "-"} / ${item.budgetYear || "-"}`);
    }
  }

  // Show sample of raw text
  console.log("\nSample Raw Text (first 2000 chars):");
  console.log("====================================");
  console.log(result.rawText.substring(0, 2000));
}

async function trends() {
  console.log("Computing budget trends...\n");
  const result = await computeTrends();
  console.log(`\nResults:`);
  console.log(`  Trends computed: ${result.computed}`);
  console.log(`  Errors: ${result.errors}`);

  // Show top movers for latest fiscal year
  const latestFY = await prisma.budgetLineItem.aggregate({
    _max: { fiscalYear: true },
  });

  if (latestFY._max.fiscalYear) {
    console.log(`\nTop Movers for FY${latestFY._max.fiscalYear}:`);
    const movers = await getTopMovers(latestFY._max.fiscalYear, 5);

    console.log("\n  Biggest Gainers (% increase):");
    for (const g of movers.gainers) {
      console.log(`    ${g.programElement}: +${g.yoyChangePercent?.toFixed(1)}% (${g.programName?.substring(0, 40)}...)`);
    }

    console.log("\n  Biggest Losers (% decrease):");
    for (const l of movers.losers) {
      console.log(`    ${l.programElement}: ${l.yoyChangePercent?.toFixed(1)}% (${l.programName?.substring(0, 40)}...)`);
    }

    console.log("\n  New Programs:");
    for (const n of movers.newPrograms) {
      console.log(`    ${n.programElement}: $${(n.amount / 1000).toFixed(1)}M (${n.programName?.substring(0, 40)}...)`);
    }
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "seed":
      await seed();
      break;
    case "download":
      await download();
      break;
    case "status":
      await status();
      break;
    case "parse":
      await parse();
      break;
    case "test-parse":
      await testParse(process.argv[3]);
      break;
    case "trends":
      await trends();
      break;
    default:
      console.log("Budget Document Crawler");
      console.log("=======================");
      console.log("Commands:");
      console.log("  seed       - Add known document URLs to database");
      console.log("  download N - Download N pending documents (default: 10)");
      console.log("  parse      - Parse downloaded documents and extract data");
      console.log("  test-parse - Test parsing a single document (optional: path)");
      console.log("  trends     - Compute YoY budget trends");
      console.log("  status     - Show document and data status");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
