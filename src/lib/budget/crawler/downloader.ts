/**
 * Budget Document Downloader
 * Fetches PDFs from DoD budget sites with rate limiting and retry logic
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

const DATA_DIR = process.env.BUDGET_PDF_DIR || "data/budget-pdfs";

// Rate limiting: 1 request per second
const RATE_LIMIT_MS = 1000;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Compute SHA-256 hash of file contents
function computeHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// Get local path for a document
function getLocalPath(fiscalYear: number, agency: string, filename: string): string {
  return path.join(DATA_DIR, `fy${fiscalYear}`, agency.toLowerCase().replace(/\s+/g, "-"), filename);
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  fileHash?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Download a single budget document
 */
export async function downloadDocument(
  url: string,
  fiscalYear: number,
  agency: string,
  documentId?: number
): Promise<DownloadResult> {
  await rateLimit();

  const filename = path.basename(new URL(url).pathname);
  const localPath = getLocalPath(fiscalYear, agency, filename);

  try {
    // Check if we already have this file
    if (documentId) {
      const existing = await prisma.budgetDocument.findUnique({
        where: { id: documentId },
      });
      if (existing?.status === "downloaded" || existing?.status === "parsed") {
        return { success: true, skipped: true, localPath: existing.localPath || undefined };
      }
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    // Fetch the PDF with browser-like headers
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://comptroller.defense.gov/Budget-Materials/",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const fileHash = computeHash(buffer);

    // Check if content changed (by hash)
    if (documentId) {
      const existing = await prisma.budgetDocument.findUnique({
        where: { id: documentId },
      });
      if (existing?.fileHash === fileHash) {
        return { success: true, skipped: true, localPath, fileHash };
      }
    }

    // Write file
    await fs.writeFile(localPath, buffer);

    // Update database record
    if (documentId) {
      await prisma.budgetDocument.update({
        where: { id: documentId },
        data: {
          localPath,
          fileHash,
          status: "downloaded",
          crawledAt: new Date(),
          errorMessage: null,
        },
      });
    }

    return { success: true, localPath, fileHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update database with error
    if (documentId) {
      await prisma.budgetDocument.update({
        where: { id: documentId },
        data: {
          status: "failed",
          errorMessage,
        },
      });
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Download all pending documents
 */
export async function downloadPendingDocuments(limit: number = 10): Promise<{
  downloaded: number;
  failed: number;
  skipped: number;
}> {
  const pending = await prisma.budgetDocument.findMany({
    where: { status: "pending" },
    take: limit,
    orderBy: { fiscalYear: "desc" },
  });

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of pending) {
    console.log(`Downloading: ${doc.url}`);
    const result = await downloadDocument(doc.url, doc.fiscalYear, doc.agency || "unknown", doc.id);

    if (result.skipped) {
      skipped++;
    } else if (result.success) {
      downloaded++;
      console.log(`  ✓ Saved to: ${result.localPath}`);
    } else {
      failed++;
      console.log(`  ✗ Error: ${result.error}`);
    }
  }

  return { downloaded, failed, skipped };
}

/**
 * Seed known documents into the database
 */
export async function seedKnownDocuments(
  documents: { fy: number; url: string; agency: string }[]
): Promise<number> {
  let created = 0;

  for (const doc of documents) {
    const filename = path.basename(new URL(doc.url).pathname);

    // Check if already exists by URL
    const existing = await prisma.budgetDocument.findFirst({
      where: { url: doc.url },
    });

    if (!existing) {
      await prisma.budgetDocument.create({
        data: {
          fiscalYear: doc.fy,
          agency: doc.agency,
          documentType: "RDT&E",
          url: doc.url,
          filename,
          status: "pending",
        },
      });
      created++;
    }
  }

  return created;
}
