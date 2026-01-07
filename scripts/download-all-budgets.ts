/**
 * Download all available DoD RDTE budget PDFs
 * Sources: Defense-Wide (comptroller.defense.gov), Army, Navy, Air Force, Space Force
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = "data/budget-pdfs";
const RATE_LIMIT_MS = 2000; // 2 seconds between requests
const MAX_RETRIES = 2;

// Fiscal years to download
const FISCAL_YEARS = [2024, 2025, 2026];

// ============================================================================
// Defense-Wide Agencies (comptroller.defense.gov)
// ============================================================================

interface DefenseWideAgency {
  code: string;
  name: string;
  urlPattern?: "standard" | "darpa" | "mda" | "volume";
}

const DEFENSE_WIDE_AGENCIES: DefenseWideAgency[] = [
  // Standard pattern: RDTE_{code}_PB_{year}.pdf
  { code: "DTRA", name: "Defense Threat Reduction Agency" },
  { code: "DISA", name: "Defense Information Systems Agency" },
  { code: "OSD", name: "Office of Secretary of Defense" },
  { code: "DCMA", name: "Defense Contract Management Agency" },
  { code: "CBDP", name: "Chemical and Biological Defense Program" },
  { code: "TJS", name: "The Joint Staff" },
  { code: "SOCOM", name: "Special Operations Command" },
  { code: "DLA", name: "Defense Logistics Agency" },
  { code: "DCAA", name: "Defense Contract Audit Agency" },
  { code: "DTIC", name: "Defense Technical Information Center" },
  { code: "CHIPS", name: "CHIPS and Science Act Programs" },
  { code: "OTE", name: "Operational Test and Evaluation" },
  { code: "DSCA", name: "Defense Security Cooperation Agency" },
  { code: "SDA", name: "Space Development Agency" },
  // Special patterns
  { code: "DARPA", name: "Defense Advanced Research Projects Agency", urlPattern: "darpa" },
  { code: "MDA", name: "Missile Defense Agency", urlPattern: "mda" },
  // Note: WHS, DHA, DLSA don't have separate RDTE budgets in the 03_RDT_and_E folder
  // DHA is in 09_Defense_Health_Program folder (separate download function)
];

function getDefenseWideUrl(agency: DefenseWideAgency, fy: number): string {
  // Note: comptroller.defense.gov URLs use lowercase "fy" in some paths
  const base = `https://comptroller.defense.gov/Portals/45/Documents/defbudget/fy${fy}/budget_justification/pdfs/03_RDT_and_E`;

  switch (agency.urlPattern) {
    case "darpa":
      // Pattern: RDTE_Vol1_DARPA_MasterJustificationBook_PB_2024.pdf
      return `${base}/RDTE_Vol1_DARPA_MasterJustificationBook_PB_${fy}.pdf`;
    case "mda":
      // Pattern: RDTE_Vol2_MDA_RDTE_PB24_Justification_Book.pdf (uses 2-digit year)
      const yy = String(fy).slice(-2);
      return `${base}/RDTE_Vol2_MDA_RDTE_PB${yy}_Justification_Book.pdf`;
    default:
      // Standard pattern: RDTE_DTRA_PB_2024.pdf
      return `${base}/RDTE_${agency.code}_PB_${fy}.pdf`;
  }
}

// ============================================================================
// Army RDTE Volumes (asafm.army.mil)
// URL patterns and volume assignments vary by fiscal year:
// - FY2026: Discretionary Budget/rdte/, Vol 3 for BA5, Vol 4 for BA6/7/9
// - FY2024: Base Budget/rdte/, Vol 2 for BA5, Vol 3 for BA6/7/8
// - FY2025: Base Budget/Research, Development, Test and Evaluation/, same as FY2024
// ============================================================================

interface ArmyVolume {
  ba: string;
  description: string;
}

// Budget activities (volume assignment depends on fiscal year)
const ARMY_BUDGET_ACTIVITIES: ArmyVolume[] = [
  { ba: "1", description: "Basic Research" },
  { ba: "2", description: "Applied Research" },
  { ba: "3", description: "Advanced Technology Development" },
  { ba: "4A", description: "Advanced Component Development & Prototypes" },
  { ba: "4B", description: "Advanced Component Development & Prototypes" },
  { ba: "5A", description: "System Development & Demonstration" },
  { ba: "5C", description: "System Development & Demonstration" },
  { ba: "5D", description: "System Development & Demonstration" },
  { ba: "6", description: "RDT&E Management Support" },
  { ba: "7", description: "Operational Systems Development" },
  { ba: "8", description: "Software and Digital Technology Pilot Programs" },
  { ba: "9", description: "Classified Programs" },
];

function getArmyVolumeForBA(ba: string, fy: number): number {
  if (fy === 2026) {
    // FY2026 volume assignments
    if (["1", "2", "3"].includes(ba)) return 1;
    if (["4A", "4B"].includes(ba)) return 2;
    if (["5A", "5C", "5D"].includes(ba)) return 3;
    return 4; // BA 6, 7, 9
  } else {
    // FY2024/2025 volume assignments
    if (["1", "2", "3"].includes(ba)) return 1;
    if (["4A", "4B", "5A", "5C", "5D"].includes(ba)) return 2;
    return 3; // BA 6, 7, 8
  }
}

function getArmyUrl(ba: string, fy: number): string {
  const base = "https://www.asafm.army.mil/Portals/72/Documents/BudgetMaterial";
  const vol = getArmyVolumeForBA(ba, fy);

  if (fy === 2026) {
    // FY2026: Discretionary Budget folder with spaces
    return `${base}/${fy}/Discretionary%20Budget/rdte/RDTE%20-%20Vol%20${vol}%20-%20Budget%20Activity%20${ba}.pdf`;
  } else if (fy === 2025) {
    // FY2025: Base Budget with long folder name and spaces around dashes
    return `${base}/${fy}/Base%20Budget/Research,%20Development,%20Test%20and%20Evaluation/RDTE%20-%20Vol%20${vol}%20-%20Budget%20Activity%20${ba}.pdf`;
  } else {
    // FY2024: Base Budget/rdte - "RDTE-Vol X-Budget Activity Y.pdf" (space after Vol, no space after second dash)
    return `${base}/${fy}/Base%20Budget/rdte/RDTE-Vol%20${vol}-Budget%20Activity%20${ba}.pdf`;
  }
}

// ============================================================================
// Navy RDTE Volumes (secnav.navy.mil)
// URL pattern: https://www.secnav.navy.mil/fmc/fmb/Documents/{yy}pres/RDTEN_BA{ba}_Book.pdf
// BA7 is not available as a separate document in recent years (FY2018+)
// ============================================================================

interface NavyVolume {
  ba: string;
  description: string;
}

const NAVY_VOLUMES: NavyVolume[] = [
  { ba: "1-3", description: "Basic/Applied Research & ATD" },
  { ba: "4", description: "Advanced Component Development" },
  { ba: "5", description: "System Development & Demonstration" },
  { ba: "6", description: "RDT&E Management Support" },
];

function getNavyUrl(vol: NavyVolume, fy: number): string {
  const yy = String(fy).slice(-2);
  // Navy uses underscores in BA designations: RDTEN_BA1-3_Book.pdf, RDTEN_BA4_Book.pdf
  return `https://www.secnav.navy.mil/fmc/fmb/Documents/${yy}pres/RDTEN_BA${vol.ba}_Book.pdf`;
}

// ============================================================================
// Air Force RDTE (saffm.hq.af.mil)
// Multiple volumes per fiscal year: Vol I, Vol II, Vol IIIa, Vol IIIb
// FY24: Uses subfolder "Research and Development Test and Evaluation/"
// FY25/26: Uses root FY folder directly
// Note: Vol IIIa/IIIb may not exist for all years
// ============================================================================

interface AirForceVolume {
  vol: string;
  description: string;
}

const AIR_FORCE_VOLUMES: AirForceVolume[] = [
  { vol: "Vol I", description: "Basic Research & Applied Research" },
  { vol: "Vol II", description: "Advanced Technology Development" },
  { vol: "Vol IIIa", description: "Advanced Component Development (Part A)" },
  { vol: "Vol IIIb", description: "Advanced Component Development (Part B)" },
];

function getAirForceUrls(fy: number): { url: string; vol: string }[] {
  const yy = String(fy).slice(-2);
  const base = `https://www.saffm.hq.af.mil/Portals/84/documents/FY${yy}`;
  const filename = `FY${yy} Air Force Research and Development Test and Evaluation`;

  if (fy === 2024) {
    // FY24: Uses subfolder with unencoded spaces in folder name
    return AIR_FORCE_VOLUMES.map(v => ({
      url: `${base}/Research%20and%20Development%20Test%20and%20Evaluation/${encodeURIComponent(filename + " " + v.vol)}.pdf`,
      vol: v.vol,
    }));
  } else {
    // FY25/26: Root folder with spaces encoded
    return AIR_FORCE_VOLUMES.map(v => ({
      url: `${base}/${encodeURIComponent(filename + " " + v.vol)}.pdf`,
      vol: v.vol,
    }));
  }
}

// ============================================================================
// Space Force RDTE (saffm.hq.af.mil)
// FY24: Uses subfolder "Research and Development Test and Evaluation/"
// FY25+: May use root FY folder
// ============================================================================

function getSpaceForceUrl(fy: number): string {
  const yy = String(fy).slice(-2);
  const base = `https://www.saffm.hq.af.mil/Portals/84/documents/FY${yy}`;
  const filename = `FY${yy}%20Space%20Force%20Research%20and%20Development%20Test%20and%20Evaluation.pdf`;

  if (fy === 2024) {
    // FY24: Uses subfolder
    return `${base}/Research%20and%20Development%20Test%20and%20Evaluation/${filename}`;
  } else {
    // FY25+: Root folder
    return `${base}/${filename}`;
  }
}

// ============================================================================
// Download Infrastructure
// ============================================================================

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(url: string, localPath: string, retries = 0): Promise<"downloaded" | "exists" | "failed"> {
  try {
    // Check if already exists
    try {
      await fs.access(localPath);
      console.log(`  [EXISTS] ${path.basename(localPath)}`);
      return "exists";
    } catch {
      // File doesn't exist, proceed to download
    }

    console.log(`  [DOWNLOADING] ${url.split("/").pop()}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (response.status === 403 && retries < MAX_RETRIES) {
      console.log(`  [RETRY] 403 Forbidden, waiting and retrying...`);
      await sleep(5000);
      return downloadFile(url, localPath, retries + 1);
    }

    if (!response.ok) {
      console.log(`  [FAILED] HTTP ${response.status}`);
      return "failed";
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Verify it's actually a PDF
    if (buffer.length < 1000 || !buffer.toString("utf8", 0, 5).includes("%PDF")) {
      console.log(`  [FAILED] Not a valid PDF (${buffer.length} bytes)`);
      return "failed";
    }

    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);
    console.log(`  [SAVED] ${path.basename(localPath)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    return "downloaded";
  } catch (err) {
    console.error(`  [ERROR] ${err}`);
    return "failed";
  }
}

// ============================================================================
// Main Download Functions
// ============================================================================

interface DownloadStats {
  downloaded: number;
  exists: number;
  failed: number;
  failedUrls: string[];
}

async function downloadDefenseWide(stats: DownloadStats) {
  console.log("\n" + "=".repeat(60));
  console.log("DEFENSE-WIDE AGENCIES (comptroller.defense.gov)");
  console.log("=".repeat(60));

  for (const fy of FISCAL_YEARS) {
    console.log(`\n--- FY${fy} ---`);

    for (const agency of DEFENSE_WIDE_AGENCIES) {
      const url = getDefenseWideUrl(agency, fy);
      const localPath = path.join(DATA_DIR, `fy${fy}`, "defense-wide", agency.code.toLowerCase(), `RDTE_${agency.code}_PB_${fy}.pdf`);

      const result = await downloadFile(url, localPath);
      if (result === "downloaded") stats.downloaded++;
      else if (result === "exists") stats.exists++;
      else {
        stats.failed++;
        stats.failedUrls.push(url);
      }

      await sleep(RATE_LIMIT_MS);
    }
  }
}

async function downloadArmy(stats: DownloadStats) {
  console.log("\n" + "=".repeat(60));
  console.log("U.S. ARMY (asafm.army.mil)");
  console.log("=".repeat(60));

  for (const fy of FISCAL_YEARS) {
    console.log(`\n--- FY${fy} ---`);

    // Filter budget activities based on fiscal year (BA9 only for FY2026, BA8 only for FY2024/2025)
    const activitiesForYear = ARMY_BUDGET_ACTIVITIES.filter(a => {
      if (fy === 2026) return a.ba !== "8"; // FY2026 has BA9, not BA8
      return a.ba !== "9"; // FY2024/2025 have BA8, not BA9
    });

    for (const activity of activitiesForYear) {
      const vol = getArmyVolumeForBA(activity.ba, fy);
      const url = getArmyUrl(activity.ba, fy);
      const localPath = path.join(DATA_DIR, `fy${fy}`, "army", `RDTE_Vol${vol}_BA${activity.ba}_${fy}.pdf`);

      const result = await downloadFile(url, localPath);
      if (result === "downloaded") stats.downloaded++;
      else if (result === "exists") stats.exists++;
      else {
        stats.failed++;
        stats.failedUrls.push(url);
      }

      await sleep(RATE_LIMIT_MS);
    }
  }
}

async function downloadNavy(stats: DownloadStats) {
  console.log("\n" + "=".repeat(60));
  console.log("U.S. NAVY (secnav.navy.mil)");
  console.log("=".repeat(60));

  for (const fy of FISCAL_YEARS) {
    console.log(`\n--- FY${fy} ---`);

    for (const vol of NAVY_VOLUMES) {
      const url = getNavyUrl(vol, fy);
      const localPath = path.join(DATA_DIR, `fy${fy}`, "navy", `RDTEN_BA${vol.ba}_${fy}.pdf`);

      const result = await downloadFile(url, localPath);
      if (result === "downloaded") stats.downloaded++;
      else if (result === "exists") stats.exists++;
      else {
        stats.failed++;
        stats.failedUrls.push(url);
      }

      await sleep(RATE_LIMIT_MS);
    }
  }
}

async function downloadAirForce(stats: DownloadStats) {
  console.log("\n" + "=".repeat(60));
  console.log("U.S. AIR FORCE (saffm.hq.af.mil)");
  console.log("=".repeat(60));

  for (const fy of FISCAL_YEARS) {
    console.log(`\n--- FY${fy} ---`);

    const volumes = getAirForceUrls(fy);
    for (const { url, vol } of volumes) {
      const volSafe = vol.replace(/ /g, "_");
      const localPath = path.join(DATA_DIR, `fy${fy}`, "air-force", `RDTE_AF_${volSafe}_${fy}.pdf`);

      const result = await downloadFile(url, localPath);
      if (result === "downloaded") stats.downloaded++;
      else if (result === "exists") stats.exists++;
      else {
        stats.failed++;
        stats.failedUrls.push(url);
      }

      await sleep(RATE_LIMIT_MS);
    }
  }
}

async function downloadSpaceForce(stats: DownloadStats) {
  console.log("\n" + "=".repeat(60));
  console.log("U.S. SPACE FORCE (saffm.hq.af.mil)");
  console.log("=".repeat(60));

  for (const fy of FISCAL_YEARS) {
    console.log(`\n--- FY${fy} ---`);

    const url = getSpaceForceUrl(fy);
    const localPath = path.join(DATA_DIR, `fy${fy}`, "space-force", `RDTE_SF_${fy}.pdf`);

    const result = await downloadFile(url, localPath);
    if (result === "downloaded") stats.downloaded++;
    else if (result === "exists") stats.exists++;
    else {
      stats.failed++;
      stats.failedUrls.push(url);
    }

    await sleep(RATE_LIMIT_MS);
  }
}

// ============================================================================
// Defense Health Program (comptroller.defense.gov)
// Separate budget section from RDTE
// ============================================================================

async function downloadDefenseHealthProgram(stats: DownloadStats) {
  console.log("\n" + "=".repeat(60));
  console.log("DEFENSE HEALTH PROGRAM (comptroller.defense.gov)");
  console.log("=".repeat(60));

  for (const fy of FISCAL_YEARS) {
    console.log(`\n--- FY${fy} ---`);

    const base = `https://comptroller.defense.gov/Portals/45/Documents/defbudget/FY${fy}/budget_justification/pdfs/09_Defense_Health_Program`;

    // Different naming convention per year
    const urls: { url: string; name: string }[] = [];

    if (fy === 2024) {
      urls.push({
        url: `${base}/00-DHP_Vols_I_II_and_III_PB24.pdf`,
        name: `DHP_Vols_I_II_III_${fy}.pdf`,
      });
    } else {
      urls.push({
        url: `${base}/00-DHP_Vols_I_and_II_PB${String(fy).slice(-2)}.pdf`,
        name: `DHP_Vols_I_II_${fy}.pdf`,
      });
      urls.push({
        url: `${base}/00-DHP_Vol_III_PB${String(fy).slice(-2)}.pdf`,
        name: `DHP_Vol_III_${fy}.pdf`,
      });
    }

    for (const { url, name } of urls) {
      const localPath = path.join(DATA_DIR, `fy${fy}`, "defense-health-program", name);

      const result = await downloadFile(url, localPath);
      if (result === "downloaded") stats.downloaded++;
      else if (result === "exists") stats.exists++;
      else {
        stats.failed++;
        stats.failedUrls.push(url);
      }

      await sleep(RATE_LIMIT_MS);
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log("DoD RDTE Budget Document Downloader");
  console.log("====================================");
  console.log(`Fiscal Years: ${FISCAL_YEARS.join(", ")}`);
  console.log(`Output Directory: ${DATA_DIR}`);
  console.log(`Rate Limit: ${RATE_LIMIT_MS}ms between requests`);

  const stats: DownloadStats = {
    downloaded: 0,
    exists: 0,
    failed: 0,
    failedUrls: [],
  };

  // Download from all sources
  await downloadDefenseWide(stats);
  await downloadArmy(stats);
  await downloadNavy(stats);
  await downloadAirForce(stats);
  await downloadSpaceForce(stats);
  await downloadDefenseHealthProgram(stats);

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("DOWNLOAD SUMMARY");
  console.log("=".repeat(60));
  console.log(`New downloads:    ${stats.downloaded}`);
  console.log(`Already existed:  ${stats.exists}`);
  console.log(`Failed:           ${stats.failed}`);
  console.log(`Total processed:  ${stats.downloaded + stats.exists + stats.failed}`);

  if (stats.failedUrls.length > 0) {
    console.log("\nFailed URLs:");
    stats.failedUrls.forEach(url => console.log(`  - ${url}`));
  }
}

main().catch(console.error);
