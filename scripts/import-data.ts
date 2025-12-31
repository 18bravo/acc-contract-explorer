import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

// Create Prisma client with pg adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Vehicle configurations
const VEHICLES: Record<
  string,
  { name: string; description: string; agency: string; piidPrefix: string }
> = {
  ites_3s: {
    name: "ITES-3S",
    description: "Army IT Enterprise Solutions - Services",
    agency: "Army",
    piidPrefix: "W52P1J-18-D-A",
  },
  ites_3h: {
    name: "ITES-3H",
    description: "Army IT Enterprise Solutions - Hardware",
    agency: "Army",
    piidPrefix: "W52P1J-16-D-00",
  },
  ites_4h: {
    name: "ITES-4H",
    description: "Army IT Enterprise Solutions 4 - Hardware ($10B, awarded Sep 2024)",
    agency: "Army",
    piidPrefix: "W52P1J-24-D-",
  },
  ites_4s: {
    name: "ITES-4S",
    description: "Army IT Enterprise Solutions 4 - Services (planned/pending)",
    agency: "Army",
    piidPrefix: "W52P1J-25-D-",
  },
  rs3: {
    name: "RS3",
    description: "Responsive Strategic Sourcing for Services (ACC-APG)",
    agency: "Army",
    piidPrefix: "W15P7T-19-D-0",
  },
  ts3_ers: {
    name: "TS3/ERS",
    description: "TACOM Strategic Service Solutions / Equipment Related Services",
    agency: "Army",
    piidPrefix: "W56HZV-",
  },
  micc_sbs: {
    name: "MICC SBS",
    description: "MICC/IMCOM Support Base Services",
    agency: "Army",
    piidPrefix: "W9124J-20-D-",
  },
  ngb_ae: {
    name: "NGB A-E IDIQ",
    description: "National Guard Bureau A-E Multi-Region IDIQ",
    agency: "NGB",
    piidPrefix: "W9133L-",
  },
  ngb_support: {
    name: "NGB Support Services",
    description: "National Guard Bureau Acquisition Support Services IDIQ",
    agency: "NGB",
    piidPrefix: "W9133L-",
  },
  usace_matoc: {
    name: "USACE MATOC/SATOC",
    description: "USACE Multiple/Single Award Task Order Contracts",
    agency: "USACE",
    piidPrefix: "W912D",
  },
  oasis_plus: {
    name: "OASIS+",
    description: "GSA OASIS+ Professional Services GWAC",
    agency: "GSA",
    piidPrefix: "47QRCA2",
  },
  gsa_mas: {
    name: "GSA MAS",
    description: "GSA Multiple Award Schedule",
    agency: "GSA",
    piidPrefix: "47QSMS",
  },
  sewp_v: {
    name: "NASA SEWP V",
    description: "NASA Solutions for Enterprise-Wide Procurement V",
    agency: "NASA",
    piidPrefix: "NNG15SC",
  },
  alliant_2: {
    name: "GSA Alliant 2",
    description: "GSA Alliant 2 IT GWAC (active until Alliant 3 awards)",
    agency: "GSA",
    piidPrefix: "GS35F",
  },
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNumber(value: string): number | null {
  if (!value || value === "") return null;
  const num = parseFloat(value.replace(/[,$]/g, ""));
  return isNaN(num) ? null : num;
}

async function importData() {
  const dataDir = path.join(__dirname, "../../data");

  console.log("Starting data import to PostgreSQL...\n");

  // Clear existing data
  console.log("Clearing existing data...");
  await prisma.taskOrder.deleteMany();
  await prisma.contractVehicle.deleteMany();
  console.log("Done.\n");

  // Create contract vehicles
  console.log("Creating contract vehicles...");
  for (const [id, config] of Object.entries(VEHICLES)) {
    await prisma.contractVehicle.create({
      data: {
        id,
        name: config.name,
        description: config.description,
        agency: config.agency,
        piidPrefix: config.piidPrefix,
      },
    });
  }
  console.log(`Created ${Object.keys(VEHICLES).length} contract vehicles.\n`);

  // Import task orders from CSVs
  let totalImported = 0;
  const vehicleStats: Record<string, { count: number; total: number }> = {};

  for (const vehicleId of Object.keys(VEHICLES)) {
    const csvPath = path.join(dataDir, vehicleId, "task_orders.csv");

    if (!fs.existsSync(csvPath)) {
      console.log(`Skipping ${vehicleId}: no CSV file`);
      continue;
    }

    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      console.log(`Skipping ${vehicleId}: empty CSV`);
      continue;
    }

    const headers = parseCSVLine(lines[0]);
    const dataRows = lines.slice(1).map((line) => parseCSVLine(line));

    console.log(`Importing ${vehicleId}: ${dataRows.length} records...`);

    let imported = 0;
    let totalObligated = 0;

    // Process in batches
    const batchSize = 500;
    for (let i = 0; i < dataRows.length; i += batchSize) {
      const batch = dataRows.slice(i, i + batchSize);

      const records = batch.map((row) => {
        const record: Record<string, string> = {};
        headers.forEach((header, idx) => {
          record[header] = row[idx] || "";
        });

        const obligated = parseNumber(record.obligated_amount);
        if (obligated) totalObligated += obligated;

        return {
          piid: record.piid || "",
          parentIdvPiid: record.parent_idv_piid || null,
          vehicleId: vehicleId,
          vehicleName: VEHICLES[vehicleId].name,
          vendorName: record.vendor_name || null,
          vendorUei: record.vendor_uei || null,
          cageCode: record.cage_code || null,
          awardDescription: record.award_description || null,
          productOrServiceDescription: record.product_or_service_description || null,
          naicsDescription: record.naics_description || null,
          awardDate: record.award_date || null,
          periodOfPerformanceStart: record.period_of_performance_start || null,
          periodOfPerformanceEnd: record.period_of_performance_end || null,
          obligatedAmount: obligated,
          baseAndExercisedValue: parseNumber(record.base_and_exercised_value),
          potentialValue: parseNumber(record.potential_value),
          naicsCode: record.naics_code || null,
          pscCode: record.psc_code || null,
          awardingAgency: record.awarding_agency || null,
          fundingAgency: record.funding_agency || null,
          placeOfPerformanceState: record.place_of_performance_state || null,
          placeOfPerformanceCountry: record.place_of_performance_country || null,
          lastModifiedDate: record.last_modified_date || null,
        };
      });

      await prisma.taskOrder.createMany({ data: records });
      imported += records.length;

      // Progress indicator
      if (i % 2000 === 0 && i > 0) {
        console.log(`  ... ${i.toLocaleString()} / ${dataRows.length.toLocaleString()}`);
      }
    }

    vehicleStats[vehicleId] = { count: imported, total: totalObligated };
    totalImported += imported;

    const formatted =
      totalObligated >= 1e9
        ? `$${(totalObligated / 1e9).toFixed(2)}B`
        : `$${(totalObligated / 1e6).toFixed(2)}M`;
    console.log(`  -> ${imported.toLocaleString()} records, ${formatted} obligated`);
  }

  // Update vehicle stats
  console.log("\nUpdating vehicle statistics...");
  for (const [vehicleId, stats] of Object.entries(vehicleStats)) {
    await prisma.contractVehicle.update({
      where: { id: vehicleId },
      data: {
        taskOrderCount: stats.count,
        totalObligated: stats.total,
      },
    });
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`IMPORT COMPLETE`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Total task orders imported: ${totalImported.toLocaleString()}`);

  await prisma.$disconnect();
  await pool.end();
}

importData().catch((e) => {
  console.error("Import failed:", e);
  prisma.$disconnect();
  pool.end();
  process.exit(1);
});
