/**
 * Parse all downloaded budget PDFs into the database
 */

import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const DATA_DIR = "data/budget-pdfs";

// Expanded agency detection
function extractAgencyFromText(text: string): string {
  const agencies = [
    { pattern: /Defense\s*Threat\s*Reduction\s*Agency|DTRA/i, name: "DTRA" },
    { pattern: /Defense\s*Advanced\s*Research\s*Projects\s*Agency|DARPA/i, name: "DARPA" },
    { pattern: /Missile\s*Defense\s*Agency|MDA/i, name: "MDA" },
    { pattern: /Office\s*of\s*the\s*Secretary\s*of\s*Defense|OSD/i, name: "OSD" },
    { pattern: /Defense\s*Information\s*Systems\s*Agency|DISA/i, name: "DISA" },
    { pattern: /Defense\s*Health\s*Agency|DHA/i, name: "DHA" },
    { pattern: /Defense\s*Contract\s*Management\s*Agency|DCMA/i, name: "DCMA" },
    { pattern: /Chemical.*Biological\s*Defense|CBDP/i, name: "CBDP" },
    { pattern: /Joint\s*Staff|TJS/i, name: "TJS" },
    { pattern: /Special\s*Operations\s*Command|SOCOM|USSOCOM/i, name: "SOCOM" },
    { pattern: /Washington\s*Headquarters|WHS/i, name: "WHS" },
    { pattern: /Defense\s*Logistics\s*Agency|DLA/i, name: "DLA" },
    { pattern: /Defense\s*Contract\s*Audit|DCAA/i, name: "DCAA" },
    { pattern: /Defense\s*Technical\s*Information|DTIC/i, name: "DTIC" },
    { pattern: /Defense\s*Security\s*Service|DSS/i, name: "DSS" },
    { pattern: /Defense\s*Finance.*Accounting|DFAS/i, name: "DFAS" },
    { pattern: /Department\s*of\s*the\s*Army|Army/i, name: "Army" },
    { pattern: /Department\s*of\s*the\s*Navy|Navy/i, name: "Navy" },
    { pattern: /Department\s*of\s*the\s*Air\s*Force|Air\s*Force/i, name: "Air Force" },
    { pattern: /Space\s*Force/i, name: "Space Force" },
    { pattern: /Marine\s*Corps/i, name: "Marines" },
  ];

  for (const { pattern, name } of agencies) {
    if (pattern.test(text)) {
      return name;
    }
  }

  return "Unknown";
}

// Extract agency from filename as fallback
function extractAgencyFromFilename(filename: string): string {
  // Defense-Wide pattern: RDTE_AGENCY_PB_YEAR.pdf
  const dwMatch = filename.match(/RDTE_([A-Z]+)_PB_/i);
  if (dwMatch) return dwMatch[1].toUpperCase();

  // Army pattern: RDTE_Vol#_BA##_YEAR.pdf
  if (filename.match(/RDTE_Vol\d+_BA/i)) return "Army";

  // Navy pattern: RDTEN_BA##_YEAR.pdf
  if (filename.match(/RDTEN_BA/i)) return "Navy";

  // Air Force pattern: RDTE_AF_YEAR.pdf
  if (filename.match(/RDTE_AF_/i)) return "Air Force";

  // Space Force pattern: RDTE_SF_YEAR.pdf
  if (filename.match(/RDTE_SF_/i)) return "Space Force";

  return "Unknown";
}

// Extract agency from directory path
function extractAgencyFromPath(filepath: string): string {
  // Check directory name for service branches
  if (filepath.includes("/army/")) return "Army";
  if (filepath.includes("/navy/")) return "Navy";
  if (filepath.includes("/air-force/")) return "Air Force";
  if (filepath.includes("/space-force/")) return "Space Force";

  // Defense-Wide agencies - extract from nested path
  const dwMatch = filepath.match(/defense-wide\/([a-z]+)\//i);
  if (dwMatch) return dwMatch[1].toUpperCase();

  // Fallback to old flat structure (fy2024/dtra/...)
  const oldMatch = filepath.match(/fy\d{4}\/([a-z]+)\//i);
  if (oldMatch) {
    const dirName = oldMatch[1].toUpperCase();
    // Map directory names to proper agency names
    if (dirName !== "ARMY" && dirName !== "NAVY" && dirName !== "AIR-FORCE" && dirName !== "SPACE-FORCE" && dirName !== "DEFENSE-WIDE") {
      return dirName;
    }
  }

  return "Unknown";
}

// Recursively find all PDF files in a directory
async function findPDFs(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findPDFs(fullPath)));
    } else if (entry.name.endsWith(".pdf")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Extract fiscal year from path
function extractFYFromPath(filepath: string): number {
  const match = filepath.match(/fy(\d{4})/i);
  return match ? parseInt(match[1]) : 2026;
}

async function main() {
  // Dynamic imports
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Initialize Prisma with PostgreSQL adapter
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find all PDF files recursively
    console.log("Scanning for PDF files...");
    const allPDFs = await findPDFs(DATA_DIR);
    console.log(`Found ${allPDFs.length} PDF files\n`);

    // Deduplicate based on filename to avoid parsing the same document twice
    const seenFiles = new Set<string>();
    const uniquePDFs = allPDFs.filter((pdfPath) => {
      const filename = path.basename(pdfPath);
      if (seenFiles.has(filename)) return false;
      seenFiles.add(filename);
      return true;
    });
    console.log(`Processing ${uniquePDFs.length} unique PDF files\n`);

    let totalParsed = 0;
    let totalFailed = 0;
    let totalLineItems = 0;

    for (const filePath of uniquePDFs) {
      const file = path.basename(filePath);
      const fiscalYear = extractFYFromPath(filePath);
      console.log(`\nParsing: ${filePath}`);

      try {
        // Read and parse PDF
        const buffer = await fs.readFile(filePath);
        const data = new Uint8Array(buffer);
        const loadingTask = getDocument({ data, useSystemFonts: true });
        const doc = await loadingTask.promise;

        let fullText = "";
        const numPages = doc.numPages;

        for (let i = 1; i <= Math.min(numPages, 50); i++) {
          // Limit to first 50 pages for speed
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: unknown) =>
              "str" in (item as Record<string, unknown>)
                ? (item as Record<string, string>).str
                : ""
            )
            .join(" ");
          fullText += pageText + "\n";
        }

        // Extract fiscal year from text
        const fyMatch = fullText.match(/(?:FY|Fiscal\s*Year)\s*(\d{4})/i);
        const parsedFY = fyMatch ? parseInt(fyMatch[1]) : fiscalYear;

        // Extract agency: try path first, then filename, then text content
        let agency = extractAgencyFromPath(filePath);
        if (agency === "Unknown") {
          agency = extractAgencyFromFilename(file);
        }
        if (agency === "Unknown") {
          agency = extractAgencyFromText(fullText);
        }

        // Extract program elements
        const pePattern =
          /(?:PE\s*|Program\s*Element[:\s]*)?(\d{7}[A-Z])\s*[:\-]?\s*([^\n]+)/gi;
        const matches = Array.from(fullText.matchAll(pePattern));

        console.log(
          `  FY${parsedFY} ${agency}: Found ${matches.length} program elements (${numPages} pages)`
        );

        // Deduplicate program elements
        const seenPEs = new Set<string>();
        let savedCount = 0;

        for (const match of matches) {
          const pe = match[1];
          if (seenPEs.has(pe)) continue;
          seenPEs.add(pe);

          const programName = match[2].trim().substring(0, 500);

          // Try to find funding amounts near this PE
          const fundingPattern = new RegExp(
            `${pe}[^\\d]*([\\d,.]+)\\s+([\\d,.]+)\\s+([\\d,.]+)`,
            "i"
          );
          const fundingMatch = fullText.match(fundingPattern);

          const priorYear = fundingMatch
            ? parseFloat(fundingMatch[1].replace(/[,$]/g, "")) || null
            : null;
          const currentYear = fundingMatch
            ? parseFloat(fundingMatch[2].replace(/[,$]/g, "")) || null
            : null;
          const budgetYear = fundingMatch
            ? parseFloat(fundingMatch[3].replace(/[,$]/g, "")) || null
            : null;

          try {
            await prisma.budgetLineItem.upsert({
              where: {
                fiscalYear_programElement_lineItemNumber_agency: {
                  fiscalYear: parsedFY,
                  programElement: pe,
                  lineItemNumber: pe,
                  agency: agency,
                },
              },
              update: {
                programName: programName,
                priorYearActual: priorYear,
                currentYearEnacted: currentYear,
                budgetYearRequest: budgetYear,
              },
              create: {
                fiscalYear: parsedFY,
                appropriationType: "RDT&E",
                agency: agency,
                programElement: pe,
                lineItemNumber: pe,
                programName: programName,
                priorYearActual: priorYear,
                currentYearEnacted: currentYear,
                budgetYearRequest: budgetYear,
                sourceDocumentUrl: filePath,
              },
            });
            savedCount++;
          } catch (err) {
            // Skip duplicates silently
          }
        }

        console.log(`  Saved ${savedCount} unique line items`);
        totalLineItems += savedCount;
        totalParsed++;
      } catch (err) {
        console.error(`  Failed: ${err}`);
        totalFailed++;
      }
    }

    console.log(`\n========================================`);
    console.log(`Parsing complete!`);
    console.log(`  Documents parsed: ${totalParsed}`);
    console.log(`  Documents failed: ${totalFailed}`);
    console.log(`  Total line items: ${totalLineItems}`);
    console.log(`========================================\n`);

    // Compute trends
    console.log("Computing budget trends...");

    // Get all unique combinations for trend calculation
    const lineItems = await prisma.budgetLineItem.findMany({
      select: {
        programElement: true,
        programName: true,
        fiscalYear: true,
        agency: true,
        appropriationType: true,
        budgetYearRequest: true,
      },
    });

    // Group by program element + agency
    const programs = new Map<string, typeof lineItems>();
    for (const item of lineItems) {
      const key = `${item.programElement}-${item.agency}`;
      if (!programs.has(key)) {
        programs.set(key, []);
      }
      programs.get(key)!.push(item);
    }

    let trendsCreated = 0;
    for (const [key, items] of programs) {
      // Sort by fiscal year
      items.sort((a, b) => a.fiscalYear - b.fiscalYear);

      for (let i = 0; i < items.length; i++) {
        const current = items[i];
        const prior = i > 0 ? items[i - 1] : null;

        const currentAmount = current.budgetYearRequest ? Number(current.budgetYearRequest) : null;
        const priorAmount = prior?.budgetYearRequest ? Number(prior.budgetYearRequest) : null;

        let yoyChangeDollars: number | null = null;
        let yoyChangePercent: number | null = null;
        let trendDirection = "flat";

        if (currentAmount !== null && priorAmount !== null && priorAmount !== 0) {
          yoyChangeDollars = currentAmount - priorAmount;
          yoyChangePercent = ((currentAmount - priorAmount) / priorAmount) * 100;

          if (yoyChangePercent > 5) trendDirection = "up";
          else if (yoyChangePercent < -5) trendDirection = "down";
        } else if (currentAmount !== null && priorAmount === null) {
          trendDirection = "new";
          yoyChangeDollars = currentAmount;
        } else if (currentAmount === null && priorAmount !== null) {
          trendDirection = "terminated";
          yoyChangeDollars = -priorAmount;
        }

        try {
          await prisma.budgetTrend.upsert({
            where: {
              programElement_fiscalYear_agency_appropriationType: {
                programElement: current.programElement!,
                fiscalYear: current.fiscalYear,
                agency: current.agency!,
                appropriationType: current.appropriationType,
              },
            },
            update: {
              programName: current.programName,
              amount: currentAmount,
              yoyChangeDollars,
              yoyChangePercent,
              trendDirection,
            },
            create: {
              programElement: current.programElement,
              programName: current.programName,
              fiscalYear: current.fiscalYear,
              agency: current.agency,
              appropriationType: current.appropriationType,
              amount: currentAmount,
              yoyChangeDollars,
              yoyChangePercent,
              trendDirection,
            },
          });
          trendsCreated++;
        } catch (err) {
          // Skip errors
        }
      }
    }

    console.log(`Trends computed: ${trendsCreated} records`);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
