# Complete Budget Data Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Download ALL DoD budget documents (R-2, P-1, O-1) and parse them into the database for the Budget Analytics dashboard.

**Architecture:**
1. Expand source definitions to include ALL budget document types (R-2 for RDT&E, P-1 for Procurement, O-1 for O&M)
2. Add parsers for P-1 and O-1 document formats alongside existing R-2 parser
3. Create a master pipeline script that downloads all documents and parses them
4. Run the pipeline to populate the database completely

**Tech Stack:** TypeScript, pdfjs-dist, Prisma, PostgreSQL

---

## Task 1: Parse All Existing Downloaded R-2 PDFs

**Files:**
- Create: `scripts/parse-all-budgets.ts`

**Step 1: Create the parsing script**

```typescript
/**
 * Parse all downloaded budget PDFs into the database
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = "data/budget-pdfs";

// Import dynamically to handle module resolution
async function main() {
  const { parseR2Document } = await import("../src/lib/budget/parser/table-extractor");
  const { PrismaClient } = await import("@prisma/client");

  const prisma = new PrismaClient();

  try {
    // Find all PDF files
    const fyDirs = await fs.readdir(DATA_DIR);
    let totalParsed = 0;
    let totalFailed = 0;

    for (const fyDir of fyDirs) {
      if (!fyDir.startsWith("fy")) continue;
      const fiscalYear = parseInt(fyDir.replace("fy", ""));

      const fyPath = path.join(DATA_DIR, fyDir);
      const agencies = await fs.readdir(fyPath);

      for (const agencyDir of agencies) {
        const agencyPath = path.join(fyPath, agencyDir);
        const stat = await fs.stat(agencyPath);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(agencyPath);
        for (const file of files) {
          if (!file.endsWith(".pdf")) continue;

          const filePath = path.join(agencyPath, file);
          console.log(`Parsing: ${filePath}`);

          try {
            const parsed = await parseR2Document(filePath);
            console.log(`  Found ${parsed.lineItems.length} line items for ${parsed.agency} FY${parsed.fiscalYear}`);

            // Save line items to database
            for (const item of parsed.lineItems) {
              if (!item.programElement) continue;

              await prisma.budgetLineItem.upsert({
                where: {
                  fiscalYear_programElement_lineItemNumber_agency: {
                    fiscalYear: parsed.fiscalYear,
                    programElement: item.programElement,
                    lineItemNumber: item.programElement,
                    agency: parsed.agency,
                  },
                },
                update: {
                  programName: item.programName,
                  priorYearActual: item.priorYear,
                  currentYearEnacted: item.currentYear,
                  budgetYearRequest: item.budgetYear,
                },
                create: {
                  fiscalYear: parsed.fiscalYear,
                  appropriationType: "RDT&E",
                  agency: parsed.agency,
                  programElement: item.programElement,
                  lineItemNumber: item.programElement,
                  programName: item.programName,
                  priorYearActual: item.priorYear,
                  currentYearEnacted: item.currentYear,
                  budgetYearRequest: item.budgetYear,
                  sourceDocumentUrl: filePath,
                },
              });
            }

            totalParsed++;
          } catch (err) {
            console.error(`  Failed: ${err}`);
            totalFailed++;
          }
        }
      }
    }

    console.log(`\nDone! Parsed: ${totalParsed}, Failed: ${totalFailed}`);

    // Compute trends
    console.log("\nComputing budget trends...");
    const { computeTrends } = await import("../src/lib/budget/loader/trend-calculator");
    await computeTrends();
    console.log("Trends computed!");

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
```

**Step 2: Run the script to parse all existing PDFs**

Run: `cd /Users/johnferry-work/Documents/GitHub/ACC\ data\ dump/web && npx tsx scripts/parse-all-budgets.ts`
Expected: Parses 30 PDFs and populates budget_line_items and budget_trends tables

**Step 3: Verify data in database**

Run: `curl -s "http://localhost:3000/api/budget/summary" | jq '.filters'`
Expected: Multiple agencies appear in the filters list

---

## Task 2: Add More Defense Agency R-2 Document URLs

**Files:**
- Modify: `src/lib/budget/crawler/sources.ts`

**Step 1: Expand RDTE_AGENCIES list to include all defense agencies**

The current list is missing some agencies. Add these to the RDTE_AGENCIES array:

```typescript
// Defense agencies with RDT&E budgets - EXPANDED
const RDTE_AGENCIES = [
  // Defense-wide agencies
  "DARPA",    // Defense Advanced Research Projects Agency
  "DTRA",     // Defense Threat Reduction Agency
  "MDA",      // Missile Defense Agency
  "DISA",     // Defense Information Systems Agency
  "OSD",      // Office of Secretary of Defense
  "DHA",      // Defense Health Agency
  "DCMA",     // Defense Contract Management Agency
  "CBDP",     // Chemical and Biological Defense Program
  "TJS",      // The Joint Staff
  "SOCOM",    // Special Operations Command
  "WHS",      // Washington Headquarters Services
  "DLA",      // Defense Logistics Agency
  "DCAA",     // Defense Contract Audit Agency
  "DTIC",     // Defense Technical Information Center
  "DSS",      // Defense Security Service
  "DFAS",     // Defense Finance and Accounting Service
  "CHIPS",    // CHIPS Act programs
  // Military services (these have separate volume PDFs)
  // Will be handled separately
];
```

---

## Task 3: Download Missing R-2 Documents

**Files:**
- Create: `scripts/download-all-budgets.ts`

**Step 1: Create download script**

```typescript
/**
 * Download all available DoD budget PDFs
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = "data/budget-pdfs";
const RATE_LIMIT_MS = 2000; // 2 seconds between requests

// All known defense agencies with RDT&E budgets
const RDTE_AGENCIES = [
  "DARPA", "DTRA", "MDA", "DISA", "OSD", "DHA", "DCMA", "CBDP", "TJS",
  "SOCOM", "WHS", "DLA", "DCAA", "DTIC", "DSS", "DFAS", "CHIPS"
];

// Fiscal years to download
const FISCAL_YEARS = [2023, 2024, 2025, 2026];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(url: string, localPath: string): Promise<boolean> {
  try {
    // Check if already exists
    try {
      await fs.access(localPath);
      console.log(`  Already exists: ${localPath}`);
      return true;
    } catch {
      // File doesn't exist, proceed to download
    }

    console.log(`  Downloading: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/pdf,*/*",
        "Referer": "https://comptroller.defense.gov/Budget-Materials/",
      },
    });

    if (!response.ok) {
      console.log(`  HTTP ${response.status}: ${url}`);
      return false;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);
    console.log(`  Saved: ${localPath}`);
    return true;
  } catch (err) {
    console.error(`  Error: ${err}`);
    return false;
  }
}

async function main() {
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (const fy of FISCAL_YEARS) {
    console.log(`\n=== FY${fy} ===`);

    for (const agency of RDTE_AGENCIES) {
      const url = `https://comptroller.defense.gov/Portals/45/Documents/defbudget/FY${fy}/budget_justification/pdfs/03_RDT_and_E/RDTE_${agency}_PB_${fy}.pdf`;
      const localPath = path.join(DATA_DIR, `fy${fy}`, agency.toLowerCase(), `RDTE_${agency}_PB_${fy}.pdf`);

      const result = await downloadFile(url, localPath);
      if (result) {
        downloaded++;
      } else {
        failed++;
      }

      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total attempted: ${downloaded + failed}`);
}

main().catch(console.error);
```

**Step 2: Run download script**

Run: `cd /Users/johnferry-work/Documents/GitHub/ACC\ data\ dump/web && npx tsx scripts/download-all-budgets.ts`
Expected: Downloads all available R-2 documents (some may 404 if agency doesn't exist for that year)

---

## Task 4: Improve R-2 Parser Agency Detection

**Files:**
- Modify: `src/lib/budget/parser/table-extractor.ts`

**Step 1: Expand agency detection patterns**

Add more agency patterns to `extractAgency` function:

```typescript
function extractAgency(text: string): string {
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
```

---

## Task 5: Run Full Parse Pipeline and Verify

**Step 1: Run the parse script again with improved parser**

Run: `cd /Users/johnferry-work/Documents/GitHub/ACC\ data\ dump/web && npx tsx scripts/parse-all-budgets.ts`

**Step 2: Check final data coverage**

Run: `curl -s "http://localhost:3000/api/budget/summary" | jq '.'`

Expected output showing multiple agencies:
```json
{
  "summary": {
    "totalPrograms": 1000+,
    "totalBudget": ...,
    "avgYoyChangePercent": ...,
    "netChangeDollars": ...,
    "displayFiscalYear": 2026
  },
  "filters": {
    "fiscalYears": [2026, 2025, 2024, 2023],
    "agencies": ["DTRA", "DISA", "DARPA", "MDA", "OSD", ...],
    "appropriationTypes": ["RDT&E"]
  }
}
```

**Step 3: Verify dashboard shows expanded data**

Open: http://localhost:3000/budget
Expected: Agency bar chart shows multiple agencies, filters work for all agencies

---

## Task 6: (Optional Future) Add P-1 and O-1 Parsers

This task is for expanding beyond RDT&E to Procurement and O&M budgets. Can be done as follow-up work.

**P-1 (Procurement) documents** follow a different format than R-2:
- Organized by Procurement Line Item Number (PLIN) instead of Program Element
- Different column structure for quantities and unit costs

**O-1 (O&M) documents** are also different:
- Organized by budget activity and subactivity
- Focus on operating costs, personnel, maintenance

These would require new parser modules in `src/lib/budget/parser/`.

---

## Summary

After completing Tasks 1-5:
- All downloaded R-2 PDFs will be parsed
- Missing R-2 documents will be downloaded
- Budget analytics dashboard will show data from all defense agencies
- Trend calculations will include all available data

P-1 and O-1 support can be added in future iterations.
