/**
 * R-2 Budget Table Extractor
 * Extracts structured data from DoD R-2 (RDT&E) budget justification PDFs
 */

import { promises as fs } from "fs";
// Use legacy build for Node.js environments
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

interface PdfParseResult {
  text: string;
  numpages: number;
}

async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  let fullText = "";
  const numPages = doc.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    fullText += pageText + "\n";
  }

  return {
    text: fullText,
    numpages: numPages,
  };
}

export interface R2LineItem {
  programElement: string;
  programName: string;
  budgetActivity: string | null;
  priorYear: number | null;
  currentYear: number | null;
  budgetYear: number | null;
  outyear1: number | null;
  outyear2: number | null;
  outyear3: number | null;
  outyear4: number | null;
  outyear5: number | null;
  totalCost: number | null;
  mission: string | null;
  description: string | null;
}

export interface ParsedR2Document {
  fiscalYear: number;
  agency: string;
  lineItems: R2LineItem[];
  rawText: string;
  pageCount: number;
}

/**
 * Parse a dollar amount from text (e.g., "1,234.567" or "1234.567")
 * R-2 exhibits typically show amounts in thousands of dollars
 */
function parseDollars(text: string): number | null {
  if (!text || text.trim() === "" || text === "-" || text === "N/A") {
    return null;
  }
  const cleaned = text.replace(/[,$\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract Program Element number (e.g., "0601102A")
 * Format: 7 digits + 1 letter (agency code)
 */
function extractProgramElement(text: string): string | null {
  const match = text.match(/\b(\d{7}[A-Z])\b/);
  return match ? match[1] : null;
}

/**
 * Extract R-2 line items from PDF text
 * This is a heuristic approach that works for most DoD R-2 format documents
 */
function extractLineItems(text: string, fiscalYear: number): R2LineItem[] {
  const lineItems: R2LineItem[] = [];

  // Split into sections (R-2 exhibits are typically organized by PE)
  // Look for patterns like "PE 0601102A" or "Program Element: 0601102A"
  const pePattern = /(?:PE\s*|Program\s*Element[:\s]*)?(\d{7}[A-Z])\s*[:\-]?\s*([^\n]+)/gi;
  const matches = text.matchAll(pePattern);

  for (const match of matches) {
    const pe = match[1];
    const programName = match[2].trim().substring(0, 200); // Limit length

    // Try to find funding amounts near this PE
    // R-2 exhibits typically have columns: Prior Year, Current Year, Budget Year, etc.
    const lineItem: R2LineItem = {
      programElement: pe,
      programName: programName,
      budgetActivity: null,
      priorYear: null,
      currentYear: null,
      budgetYear: null,
      outyear1: null,
      outyear2: null,
      outyear3: null,
      outyear4: null,
      outyear5: null,
      totalCost: null,
      mission: null,
      description: null,
    };

    // Look for funding table data near this PE
    // This regex looks for a row of numbers that might be the funding line
    const fundingPattern = new RegExp(
      `${pe}[^\\d]*([\\d,.]+)\\s+([\\d,.]+)\\s+([\\d,.]+)`,
      "i"
    );
    const fundingMatch = text.match(fundingPattern);
    if (fundingMatch) {
      lineItem.priorYear = parseDollars(fundingMatch[1]);
      lineItem.currentYear = parseDollars(fundingMatch[2]);
      lineItem.budgetYear = parseDollars(fundingMatch[3]);
    }

    // Look for mission/description text
    const missionPattern = new RegExp(
      `${pe}[\\s\\S]{0,500}?(?:Mission|Description)[:\\s]*([^\\n]+)`,
      "i"
    );
    const missionMatch = text.match(missionPattern);
    if (missionMatch) {
      lineItem.mission = missionMatch[1].trim().substring(0, 500);
    }

    lineItems.push(lineItem);
  }

  return lineItems;
}

/**
 * Extract fiscal year from document text
 */
function extractFiscalYear(text: string): number {
  // Look for "FY 2025" or "Fiscal Year 2025" patterns
  const fyPattern = /(?:FY|Fiscal\s*Year)\s*(\d{4})/i;
  const match = text.match(fyPattern);
  if (match) {
    return parseInt(match[1]);
  }
  // Default to current year if not found
  return new Date().getFullYear();
}

/**
 * Extract agency from document text
 */
function extractAgency(text: string): string {
  // Common agency patterns in R-2 documents
  const agencies = [
    { pattern: /Defense\s*Threat\s*Reduction\s*Agency|DTRA/i, name: "DTRA" },
    { pattern: /Defense\s*Advanced\s*Research\s*Projects\s*Agency|DARPA/i, name: "DARPA" },
    { pattern: /Missile\s*Defense\s*Agency|MDA/i, name: "MDA" },
    { pattern: /Office\s*of\s*the\s*Secretary\s*of\s*Defense|OSD/i, name: "OSD" },
    { pattern: /Defense\s*Information\s*Systems\s*Agency|DISA/i, name: "DISA" },
    { pattern: /Defense\s*Health\s*Agency|DHA/i, name: "DHA" },
    { pattern: /Department\s*of\s*the\s*Army|Army/i, name: "Army" },
    { pattern: /Department\s*of\s*the\s*Navy|Navy/i, name: "Navy" },
    { pattern: /Department\s*of\s*the\s*Air\s*Force|Air\s*Force/i, name: "Air Force" },
  ];

  for (const { pattern, name } of agencies) {
    if (pattern.test(text)) {
      return name;
    }
  }

  return "Unknown";
}

/**
 * Parse an R-2 budget document PDF
 */
export async function parseR2Document(filePath: string): Promise<ParsedR2Document> {
  const buffer = await fs.readFile(filePath);
  const data = await parsePdf(buffer);

  const text = data.text;
  const fiscalYear = extractFiscalYear(text);
  const agency = extractAgency(text);
  const lineItems = extractLineItems(text, fiscalYear);

  return {
    fiscalYear,
    agency,
    lineItems,
    rawText: text,
    pageCount: data.numpages,
  };
}

/**
 * Parse R-2 document and save to database
 */
export async function parseAndSaveR2Document(
  filePath: string,
  documentId: number
): Promise<{ success: boolean; lineItemCount: number; error?: string }> {
  try {
    const { prisma } = await import("@/lib/prisma");

    const parsed = await parseR2Document(filePath);

    console.log(`Parsed ${parsed.lineItems.length} line items from ${parsed.agency} FY${parsed.fiscalYear}`);

    let savedCount = 0;
    for (const item of parsed.lineItems) {
      if (!item.programElement) continue;

      try {
        await prisma.budgetLineItem.upsert({
          where: {
            fiscalYear_programElement_lineItemNumber_agency: {
              fiscalYear: parsed.fiscalYear,
              programElement: item.programElement,
              lineItemNumber: item.programElement, // Use PE as line item number for R-2
              agency: parsed.agency,
            },
          },
          update: {
            programName: item.programName,
            priorYearActual: item.priorYear,
            currentYearEnacted: item.currentYear,
            budgetYearRequest: item.budgetYear,
            outyear1: item.outyear1,
            outyear2: item.outyear2,
            outyear3: item.outyear3,
            outyear4: item.outyear4,
            outyear5: item.outyear5,
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
            outyear1: item.outyear1,
            outyear2: item.outyear2,
            outyear3: item.outyear3,
            outyear4: item.outyear4,
            outyear5: item.outyear5,
            sourceDocumentUrl: filePath,
          },
        });
        savedCount++;

        // Save narrative if available
        if (item.mission || item.description) {
          const lineItemRecord = await prisma.budgetLineItem.findFirst({
            where: {
              fiscalYear: parsed.fiscalYear,
              programElement: item.programElement,
              agency: parsed.agency,
            },
          });

          if (lineItemRecord) {
            await prisma.budgetNarrative.create({
              data: {
                lineItemId: lineItemRecord.id,
                narrativeType: "mission",
                content: item.mission || item.description,
              },
            });
          }
        }
      } catch (e) {
        console.error(`Failed to save line item ${item.programElement}:`, e);
      }
    }

    // Update document status
    await prisma.budgetDocument.update({
      where: { id: documentId },
      data: {
        status: "parsed",
        parsedAt: new Date(),
      },
    });

    return { success: true, lineItemCount: savedCount };
  } catch (error) {
    return {
      success: false,
      lineItemCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
