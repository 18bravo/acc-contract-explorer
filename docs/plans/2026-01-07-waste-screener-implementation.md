# Contract Waste Screener Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a "trading terminal" for identifying wasteful DoD services contracts, with anomaly scoring, filtering, and drill-down investigation.

**Architecture:** Add new Prisma models for service contracts, modifications, subawards, organizations, and waste scores. Create API endpoints under `/api/waste/`. Build a new page at `/waste` with screener table and detail drawer. Reuse existing patterns from search/budget features.

**Tech Stack:** Next.js 15, Prisma 7, PostgreSQL, React, Tailwind CSS, USASpending API

---

## Task 1: Add Prisma Schema Models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the ServiceContract model**

Add after the existing models (around line 187):

```prisma
// ============================================================================
// Contract Waste Screener Models
// ============================================================================

model ServiceContract {
  id                      Int       @id @default(autoincrement())
  piid                    String    @unique
  parentIdvPiid           String?   @map("parent_idv_piid")

  // Award details
  awardDescription        String?   @map("award_description") @db.Text
  awardType               String?   @map("award_type")
  contractType            String?   @map("contract_type")

  // Dates
  awardDate               DateTime? @map("award_date")
  periodOfPerformanceStart DateTime? @map("period_of_performance_start")
  periodOfPerformanceEnd   DateTime? @map("period_of_performance_end")

  // Financial
  baseValue               Decimal?  @map("base_value") @db.Decimal(15, 2)
  currentValue            Decimal?  @map("current_value") @db.Decimal(15, 2)
  obligatedAmount         Decimal?  @map("obligated_amount") @db.Decimal(15, 2)
  awardCeiling            Decimal?  @map("award_ceiling") @db.Decimal(15, 2)

  // Classification
  naicsCode               String?   @map("naics_code")
  naicsDescription        String?   @map("naics_description")
  pscCode                 String?   @map("psc_code")
  pscDescription          String?   @map("psc_description")

  // Vendor
  vendorName              String?   @map("vendor_name")
  vendorUei               String?   @map("vendor_uei")
  vendorCageCode          String?   @map("vendor_cage_code")

  // Organization
  contractingOfficeId     Int?      @map("contracting_office_id")
  contractingOfficeName   String?   @map("contracting_office_name")
  awardingAgency          String?   @map("awarding_agency")
  awardingSubAgency       String?   @map("awarding_sub_agency")
  fundingAgency           String?   @map("funding_agency")
  fundingSubAgency        String?   @map("funding_sub_agency")

  // Location
  placeOfPerformanceState String?   @map("place_of_performance_state")
  placeOfPerformanceCountry String? @map("place_of_performance_country")

  // Metadata from USASpending
  usaspendingAwardId      String?   @map("usaspending_award_id")
  lastModifiedDate        DateTime? @map("last_modified_date")

  // Timestamps
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")

  // Relations
  modifications           ContractModification[]
  subawards               Subaward[]
  wasteScore              WasteScore?
  contractingOffice       DoDOrganization? @relation(fields: [contractingOfficeId], references: [id])

  @@index([vendorUei])
  @@index([vendorName])
  @@index([naicsCode])
  @@index([pscCode])
  @@index([awardingAgency])
  @@index([awardDate])
  @@index([contractingOfficeId])
  @@map("service_contracts")
}

model ContractModification {
  id                Int       @id @default(autoincrement())
  contractId        Int       @map("contract_id")
  modificationNumber String?  @map("modification_number")
  actionDate        DateTime? @map("action_date")
  actionType        String?   @map("action_type")
  description       String?   @db.Text
  obligatedChange   Decimal?  @map("obligated_change") @db.Decimal(15, 2)
  obligatedTotal    Decimal?  @map("obligated_total") @db.Decimal(15, 2)

  createdAt         DateTime  @default(now()) @map("created_at")

  contract          ServiceContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  @@index([contractId])
  @@index([actionDate])
  @@map("contract_modifications")
}

model Subaward {
  id                      Int       @id @default(autoincrement())
  contractId              Int       @map("contract_id")
  subawardNumber          String?   @map("subaward_number")
  subawardAmount          Decimal?  @map("subaward_amount") @db.Decimal(15, 2)
  subcontractorName       String?   @map("subcontractor_name")
  subcontractorUei        String?   @map("subcontractor_uei")
  subcontractorCageCode   String?   @map("subcontractor_cage_code")
  description             String?   @db.Text
  actionDate              DateTime? @map("action_date")
  placeOfPerformanceState String?   @map("place_of_performance_state")

  createdAt               DateTime  @default(now()) @map("created_at")

  contract                ServiceContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  @@index([contractId])
  @@index([subcontractorUei])
  @@map("subawards")
}

model WasteScore {
  id                  Int       @id @default(autoincrement())
  contractId          Int       @unique @map("contract_id")

  // Individual waste signals (0-100 each)
  costGrowthPct       Decimal?  @map("cost_growth_pct") @db.Decimal(8, 2)
  ceilingUtilization  Decimal?  @map("ceiling_utilization") @db.Decimal(8, 2)
  contractAgeDays     Int?      @map("contract_age_days")
  modificationCount   Int?      @map("modification_count")
  passThruRatio       Decimal?  @map("pass_thru_ratio") @db.Decimal(8, 2)
  vendorConcentration Int?      @map("vendor_concentration")
  duplicateRisk       Decimal?  @map("duplicate_risk") @db.Decimal(8, 2)
  impliedHourlyRate   Decimal?  @map("implied_hourly_rate") @db.Decimal(10, 2)

  // Composite score
  overallScore        Decimal?  @map("overall_score") @db.Decimal(8, 2)

  // Flags for quick filtering
  flagCostGrowth      Boolean   @default(false) @map("flag_cost_growth")
  flagUnderutilized   Boolean   @default(false) @map("flag_underutilized")
  flagOldContract     Boolean   @default(false) @map("flag_old_contract")
  flagHighMods        Boolean   @default(false) @map("flag_high_mods")
  flagPassThru        Boolean   @default(false) @map("flag_pass_thru")
  flagVendorConc      Boolean   @default(false) @map("flag_vendor_conc")
  flagDuplicate       Boolean   @default(false) @map("flag_duplicate")
  flagHighRate        Boolean   @default(false) @map("flag_high_rate")

  calculatedAt        DateTime  @default(now()) @map("calculated_at")

  contract            ServiceContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  @@index([overallScore(sort: Desc)])
  @@index([flagCostGrowth])
  @@index([flagPassThru])
  @@map("waste_scores")
}

model DoDOrganization {
  id                Int       @id @default(autoincrement())
  code              String?   @unique
  name              String
  level             String?   // agency, command, office
  parentId          Int?      @map("parent_id")

  createdAt         DateTime  @default(now()) @map("created_at")

  parent            DoDOrganization?  @relation("OrgHierarchy", fields: [parentId], references: [id])
  children          DoDOrganization[] @relation("OrgHierarchy")
  contracts         ServiceContract[]

  @@index([parentId])
  @@index([level])
  @@map("dod_organizations")
}
```

**Step 2: Run prisma generate to validate**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors

**Step 3: Push schema to database**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema"

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(waste): add Prisma models for service contracts, mods, subawards, scores"
```

---

## Task 2: Create USASpending API Client for Services Contracts

**Files:**
- Create: `src/lib/waste/usaspending-client.ts`

**Step 1: Create the API client**

```typescript
/**
 * USASpending API Client for Waste Screener
 * Fetches DoD services contracts with full detail
 */

const BASE_URL = "https://api.usaspending.gov/api/v2";

// Target NAICS codes for services
export const SERVICE_NAICS_CODES = [
  "541330", "541511", "541512", "541519", "541611", "541690", // Professional/Technical
  "561110", "561320", // Administrative
  "518210", // Data Processing
];

// DoD agency codes for filtering
export const DOD_AGENCY_CODES = ["097", "017", "021", "057", "096"]; // DoD, Navy, Army, AF, etc.

export interface ServiceContractResult {
  piid: string;
  parentIdvPiid: string | null;
  awardDescription: string | null;
  awardType: string | null;
  awardDate: string | null;
  periodOfPerformanceStart: string | null;
  periodOfPerformanceEnd: string | null;
  baseValue: number | null;
  currentValue: number | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  naicsCode: string | null;
  naicsDescription: string | null;
  pscCode: string | null;
  pscDescription: string | null;
  vendorName: string | null;
  vendorUei: string | null;
  vendorCageCode: string | null;
  awardingAgency: string | null;
  awardingSubAgency: string | null;
  fundingAgency: string | null;
  contractingOfficeName: string | null;
  placeOfPerformanceState: string | null;
  usaspendingAwardId: string | null;
  lastModifiedDate: string | null;
}

export interface SubawardResult {
  subawardNumber: string | null;
  subawardAmount: number | null;
  subcontractorName: string | null;
  subcontractorUei: string | null;
  description: string | null;
  actionDate: string | null;
  placeOfPerformanceState: string | null;
}

/**
 * Search for DoD services contracts
 */
export async function searchDoDServicesContracts(
  options: {
    naicsCodes?: string[];
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ results: ServiceContractResult[]; total: number; hasNext: boolean }> {
  const {
    naicsCodes = SERVICE_NAICS_CODES,
    startDate,
    endDate,
    minAmount = 100000,
    page = 1,
    limit = 100,
  } = options;

  try {
    const filters: Record<string, unknown> = {
      award_type_codes: ["A", "B", "C", "D"], // Contracts only
      naics_codes: naicsCodes,
      agencies: DOD_AGENCY_CODES.map((code) => ({
        type: "awarding",
        tier: "toptier",
        toptier_code: code,
      })),
    };

    if (startDate) {
      filters.time_period = [{ start_date: startDate, end_date: endDate || new Date().toISOString().split("T")[0] }];
    }
    if (minAmount) {
      filters.award_amounts = [{ lower_bound: minAmount }];
    }

    const response = await fetch(`${BASE_URL}/search/spending_by_award/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        fields: [
          "Award ID",
          "Recipient Name",
          "Award Amount",
          "Total Outlays",
          "Description",
          "Start Date",
          "End Date",
          "Awarding Agency",
          "Awarding Sub Agency",
          "Funding Agency",
          "Award Type",
          "generated_internal_id",
          "recipient_uei",
          "NAICS Code",
          "NAICS Description",
          "PSC Code",
          "PSC Description",
          "Contracting Office Name",
          "Place of Performance State Code",
          "Last Modified Date",
        ],
        page,
        limit,
        sort: "Award Amount",
        order: "desc",
      }),
    });

    if (!response.ok) {
      console.error(`USASpending API error: ${response.status}`);
      return { results: [], total: 0, hasNext: false };
    }

    const data = await response.json();

    const results: ServiceContractResult[] = data.results.map((award: Record<string, unknown>) => ({
      piid: (award["Award ID"] as string) || "",
      parentIdvPiid: null,
      awardDescription: (award["Description"] as string) || null,
      awardType: (award["Award Type"] as string) || null,
      awardDate: (award["Start Date"] as string) || null,
      periodOfPerformanceStart: (award["Start Date"] as string) || null,
      periodOfPerformanceEnd: (award["End Date"] as string) || null,
      baseValue: null, // Need detail endpoint
      currentValue: (award["Award Amount"] as number) || null,
      obligatedAmount: (award["Total Outlays"] as number) || null,
      awardCeiling: null, // Need detail endpoint
      naicsCode: (award["NAICS Code"] as string) || null,
      naicsDescription: (award["NAICS Description"] as string) || null,
      pscCode: (award["PSC Code"] as string) || null,
      pscDescription: (award["PSC Description"] as string) || null,
      vendorName: (award["Recipient Name"] as string) || null,
      vendorUei: (award["recipient_uei"] as string) || null,
      vendorCageCode: null,
      awardingAgency: (award["Awarding Agency"] as string) || null,
      awardingSubAgency: (award["Awarding Sub Agency"] as string) || null,
      fundingAgency: (award["Funding Agency"] as string) || null,
      contractingOfficeName: (award["Contracting Office Name"] as string) || null,
      placeOfPerformanceState: (award["Place of Performance State Code"] as string) || null,
      usaspendingAwardId: (award["generated_internal_id"] as string) || null,
      lastModifiedDate: (award["Last Modified Date"] as string) || null,
    }));

    return {
      results,
      total: data.page_metadata?.total || 0,
      hasNext: data.page_metadata?.hasNext || false,
    };
  } catch (error) {
    console.error("USASpending services search error:", error);
    return { results: [], total: 0, hasNext: false };
  }
}

/**
 * Fetch subawards for a contract
 */
export async function fetchSubawards(
  awardId: string,
  limit: number = 100
): Promise<SubawardResult[]> {
  try {
    const response = await fetch(`${BASE_URL}/subawards/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        award_id: awardId,
        page: 1,
        limit,
        sort: "subaward_amount",
        order: "desc",
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    return (data.results || []).map((sub: Record<string, unknown>) => ({
      subawardNumber: (sub["subaward_number"] as string) || null,
      subawardAmount: (sub["subaward_amount"] as number) || null,
      subcontractorName: (sub["sub_awardee_or_recipient_legal"] as string) || null,
      subcontractorUei: (sub["sub_awardee_or_recipient_uniqu"] as string) || null,
      description: (sub["description"] as string) || null,
      actionDate: (sub["action_date"] as string) || null,
      placeOfPerformanceState: (sub["place_of_perform_state_code"] as string) || null,
    }));
  } catch (error) {
    console.error("USASpending subawards error:", error);
    return [];
  }
}

/**
 * Fetch contract award detail for base/ceiling values
 */
export async function fetchContractDetail(
  awardId: string
): Promise<{ baseValue: number | null; awardCeiling: number | null } | null> {
  try {
    const response = await fetch(`${BASE_URL}/awards/${awardId}/`);
    if (!response.ok) return null;

    const data = await response.json();
    return {
      baseValue: data.base_and_all_options_value || null,
      awardCeiling: data.total_obligation || null,
    };
  } catch (error) {
    console.error("USASpending detail error:", error);
    return null;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/waste/usaspending-client.ts
git commit -m "feat(waste): add USASpending API client for services contracts"
```

---

## Task 3: Create Waste Score Calculator

**Files:**
- Create: `src/lib/waste/score-calculator.ts`

**Step 1: Create the calculator**

```typescript
/**
 * Waste Score Calculator
 * Computes individual waste signals and overall score for contracts
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// Thresholds for flagging
const THRESHOLDS = {
  costGrowthPct: 50, // Flag if > 50% growth
  ceilingUtilization: 20, // Flag if < 20% utilized
  contractAgeDays: 5 * 365, // Flag if > 5 years
  modificationCount: 20, // Flag if > 20 mods
  passThruRatio: 70, // Flag if > 70% passed through
  vendorConcentration: 5, // Flag if > 5 contracts same vendor/org
  duplicateRisk: 80, // Flag if > 80 similarity
  impliedHourlyRate: 250, // Flag if > $250/hr
};

// Weights for overall score
const WEIGHTS = {
  costGrowthPct: 0.20,
  ceilingUtilization: 0.10,
  contractAgeDays: 0.10,
  modificationCount: 0.10,
  passThruRatio: 0.15,
  vendorConcentration: 0.10,
  duplicateRisk: 0.15,
  impliedHourlyRate: 0.10,
};

interface ContractData {
  id: number;
  baseValue: Decimal | null;
  currentValue: Decimal | null;
  obligatedAmount: Decimal | null;
  awardCeiling: Decimal | null;
  awardDate: Date | null;
  vendorUei: string | null;
  contractingOfficeId: number | null;
  awardDescription: string | null;
}

interface ScoreResult {
  costGrowthPct: number | null;
  ceilingUtilization: number | null;
  contractAgeDays: number | null;
  modificationCount: number;
  passThruRatio: number | null;
  vendorConcentration: number;
  duplicateRisk: number | null;
  impliedHourlyRate: number | null;
  overallScore: number;
  flagCostGrowth: boolean;
  flagUnderutilized: boolean;
  flagOldContract: boolean;
  flagHighMods: boolean;
  flagPassThru: boolean;
  flagVendorConc: boolean;
  flagDuplicate: boolean;
  flagHighRate: boolean;
}

function toNumber(val: Decimal | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

/**
 * Calculate waste scores for a single contract
 */
export async function calculateWasteScore(contractId: number): Promise<ScoreResult> {
  // Fetch contract with related data
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
    include: {
      modifications: true,
      subawards: true,
    },
  });

  if (!contract) {
    throw new Error(`Contract ${contractId} not found`);
  }

  // 1. Cost Growth %
  const baseValue = toNumber(contract.baseValue);
  const currentValue = toNumber(contract.currentValue);
  let costGrowthPct: number | null = null;
  if (baseValue && baseValue > 0 && currentValue) {
    costGrowthPct = ((currentValue - baseValue) / baseValue) * 100;
  }

  // 2. Ceiling Utilization %
  const obligatedAmount = toNumber(contract.obligatedAmount);
  const awardCeiling = toNumber(contract.awardCeiling);
  let ceilingUtilization: number | null = null;
  if (awardCeiling && awardCeiling > 0 && obligatedAmount !== null) {
    ceilingUtilization = (obligatedAmount / awardCeiling) * 100;
  }

  // 3. Contract Age (days)
  let contractAgeDays: number | null = null;
  if (contract.awardDate) {
    const now = new Date();
    contractAgeDays = Math.floor((now.getTime() - contract.awardDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 4. Modification Count
  const modificationCount = contract.modifications.length;

  // 5. Pass-Through Ratio
  let passThruRatio: number | null = null;
  if (obligatedAmount && obligatedAmount > 0 && contract.subawards.length > 0) {
    const totalSubawards = contract.subawards.reduce(
      (sum, sub) => sum + (toNumber(sub.subawardAmount) || 0),
      0
    );
    passThruRatio = (totalSubawards / obligatedAmount) * 100;
  }

  // 6. Vendor Concentration (count of contracts same vendor has in same org)
  let vendorConcentration = 0;
  if (contract.vendorUei && contract.contractingOfficeId) {
    vendorConcentration = await prisma.serviceContract.count({
      where: {
        vendorUei: contract.vendorUei,
        contractingOfficeId: contract.contractingOfficeId,
        id: { not: contractId },
      },
    });
  }

  // 7. Duplicate Risk (placeholder - would use text similarity)
  // For now, return null - will implement with pg_trgm or vector similarity later
  const duplicateRisk: number | null = null;

  // 8. Implied Hourly Rate (placeholder - requires labor hour estimation)
  const impliedHourlyRate: number | null = null;

  // Calculate flags
  const flagCostGrowth = costGrowthPct !== null && costGrowthPct > THRESHOLDS.costGrowthPct;
  const flagUnderutilized = ceilingUtilization !== null && ceilingUtilization < THRESHOLDS.ceilingUtilization;
  const flagOldContract = contractAgeDays !== null && contractAgeDays > THRESHOLDS.contractAgeDays;
  const flagHighMods = modificationCount > THRESHOLDS.modificationCount;
  const flagPassThru = passThruRatio !== null && passThruRatio > THRESHOLDS.passThruRatio;
  const flagVendorConc = vendorConcentration > THRESHOLDS.vendorConcentration;
  const flagDuplicate = duplicateRisk !== null && duplicateRisk > THRESHOLDS.duplicateRisk;
  const flagHighRate = impliedHourlyRate !== null && impliedHourlyRate > THRESHOLDS.impliedHourlyRate;

  // Calculate overall score (0-100, higher = more wasteful)
  let overallScore = 0;
  let totalWeight = 0;

  function addScore(value: number | null, threshold: number, weight: number, inverted: boolean = false) {
    if (value === null) return;
    totalWeight += weight;
    // Normalize to 0-100 based on threshold (100 = at or above threshold)
    let normalized = inverted
      ? Math.max(0, (threshold - value) / threshold) * 100
      : Math.min(100, (value / threshold) * 100);
    overallScore += normalized * weight;
  }

  addScore(costGrowthPct, THRESHOLDS.costGrowthPct, WEIGHTS.costGrowthPct);
  addScore(ceilingUtilization, THRESHOLDS.ceilingUtilization, WEIGHTS.ceilingUtilization, true);
  addScore(contractAgeDays, THRESHOLDS.contractAgeDays, WEIGHTS.contractAgeDays);
  addScore(modificationCount, THRESHOLDS.modificationCount, WEIGHTS.modificationCount);
  addScore(passThruRatio, THRESHOLDS.passThruRatio, WEIGHTS.passThruRatio);
  addScore(vendorConcentration, THRESHOLDS.vendorConcentration, WEIGHTS.vendorConcentration);
  addScore(duplicateRisk, THRESHOLDS.duplicateRisk, WEIGHTS.duplicateRisk);
  addScore(impliedHourlyRate, THRESHOLDS.impliedHourlyRate, WEIGHTS.impliedHourlyRate);

  // Normalize by actual weights used
  if (totalWeight > 0) {
    overallScore = overallScore / totalWeight;
  }

  return {
    costGrowthPct,
    ceilingUtilization,
    contractAgeDays,
    modificationCount,
    passThruRatio,
    vendorConcentration,
    duplicateRisk,
    impliedHourlyRate,
    overallScore: Math.round(overallScore * 100) / 100,
    flagCostGrowth,
    flagUnderutilized,
    flagOldContract,
    flagHighMods,
    flagPassThru,
    flagVendorConc,
    flagDuplicate,
    flagHighRate,
  };
}

/**
 * Calculate and save waste scores for a contract
 */
export async function saveWasteScore(contractId: number): Promise<void> {
  const scores = await calculateWasteScore(contractId);

  await prisma.wasteScore.upsert({
    where: { contractId },
    create: {
      contractId,
      ...scores,
      calculatedAt: new Date(),
    },
    update: {
      ...scores,
      calculatedAt: new Date(),
    },
  });
}

/**
 * Batch calculate waste scores for all contracts
 */
export async function calculateAllWasteScores(): Promise<{ processed: number; errors: number }> {
  const contracts = await prisma.serviceContract.findMany({
    select: { id: true },
  });

  let processed = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      await saveWasteScore(contract.id);
      processed++;
    } catch (error) {
      console.error(`Error calculating score for contract ${contract.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/waste/score-calculator.ts
git commit -m "feat(waste): add waste score calculator with 8 signals"
```

---

## Task 4: Create API Route - Screener List

**Files:**
- Create: `src/app/api/waste/contracts/route.ts`

**Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    // Sorting
    const sortBy = searchParams.get("sortBy") || "overallScore";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Filters
    const naicsCode = searchParams.get("naics");
    const pscCode = searchParams.get("psc");
    const agency = searchParams.get("agency");
    const minAmount = searchParams.get("minAmount") ? parseFloat(searchParams.get("minAmount")!) : undefined;
    const maxAmount = searchParams.get("maxAmount") ? parseFloat(searchParams.get("maxAmount")!) : undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Flag filters
    const flagCostGrowth = searchParams.get("flagCostGrowth") === "true";
    const flagUnderutilized = searchParams.get("flagUnderutilized") === "true";
    const flagOldContract = searchParams.get("flagOldContract") === "true";
    const flagHighMods = searchParams.get("flagHighMods") === "true";
    const flagPassThru = searchParams.get("flagPassThru") === "true";
    const flagVendorConc = searchParams.get("flagVendorConc") === "true";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (naicsCode) {
      where.naicsCode = { startsWith: naicsCode };
    }
    if (pscCode) {
      where.pscCode = { startsWith: pscCode };
    }
    if (agency) {
      where.awardingAgency = { contains: agency, mode: "insensitive" };
    }
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.obligatedAmount = {};
      if (minAmount !== undefined) (where.obligatedAmount as Record<string, number>).gte = minAmount;
      if (maxAmount !== undefined) (where.obligatedAmount as Record<string, number>).lte = maxAmount;
    }
    if (startDate) {
      where.awardDate = { ...((where.awardDate as Record<string, unknown>) || {}), gte: new Date(startDate) };
    }
    if (endDate) {
      where.awardDate = { ...((where.awardDate as Record<string, unknown>) || {}), lte: new Date(endDate) };
    }

    // Flag filters on waste score
    const wasteScoreWhere: Record<string, boolean> = {};
    if (flagCostGrowth) wasteScoreWhere.flagCostGrowth = true;
    if (flagUnderutilized) wasteScoreWhere.flagUnderutilized = true;
    if (flagOldContract) wasteScoreWhere.flagOldContract = true;
    if (flagHighMods) wasteScoreWhere.flagHighMods = true;
    if (flagPassThru) wasteScoreWhere.flagPassThru = true;
    if (flagVendorConc) wasteScoreWhere.flagVendorConc = true;

    if (Object.keys(wasteScoreWhere).length > 0) {
      where.wasteScore = wasteScoreWhere;
    }

    // Build orderBy
    const orderBy: Record<string, unknown>[] = [];
    if (sortBy === "overallScore") {
      orderBy.push({ wasteScore: { overallScore: sortOrder } });
    } else if (sortBy === "obligatedAmount") {
      orderBy.push({ obligatedAmount: sortOrder });
    } else if (sortBy === "awardDate") {
      orderBy.push({ awardDate: sortOrder });
    } else if (sortBy === "vendorName") {
      orderBy.push({ vendorName: sortOrder });
    }

    // Execute query
    const [contracts, total] = await Promise.all([
      prisma.serviceContract.findMany({
        where,
        include: {
          wasteScore: true,
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.serviceContract.count({ where }),
    ]);

    return NextResponse.json({
      results: contracts.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        awardDescription: c.awardDescription,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        awardCeiling: c.awardCeiling ? Number(c.awardCeiling) : null,
        awardDate: c.awardDate?.toISOString().split("T")[0] || null,
        naicsCode: c.naicsCode,
        pscCode: c.pscCode,
        awardingAgency: c.awardingAgency,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
        flags: c.wasteScore
          ? {
              costGrowth: c.wasteScore.flagCostGrowth,
              underutilized: c.wasteScore.flagUnderutilized,
              oldContract: c.wasteScore.flagOldContract,
              highMods: c.wasteScore.flagHighMods,
              passThru: c.wasteScore.flagPassThru,
              vendorConc: c.wasteScore.flagVendorConc,
              duplicate: c.wasteScore.flagDuplicate,
              highRate: c.wasteScore.flagHighRate,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Waste contracts list error:", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/waste/contracts/route.ts
git commit -m "feat(waste): add API route for screener contract list"
```

---

## Task 5: Create API Route - Contract Detail

**Files:**
- Create: `src/app/api/waste/contracts/[id]/route.ts`

**Step 1: Create the detail route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contractId = parseInt(id);

    if (isNaN(contractId)) {
      return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
    }

    const contract = await prisma.serviceContract.findUnique({
      where: { id: contractId },
      include: {
        wasteScore: true,
        modifications: {
          orderBy: { actionDate: "desc" },
        },
        subawards: {
          orderBy: { subawardAmount: "desc" },
        },
        contractingOffice: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Fetch related contracts (same vendor in same org)
    const relatedContracts = await prisma.serviceContract.findMany({
      where: {
        OR: [
          // Same vendor
          contract.vendorUei
            ? { vendorUei: contract.vendorUei, id: { not: contractId } }
            : { id: -1 }, // no match
          // Same org, similar description
          contract.contractingOfficeId
            ? { contractingOfficeId: contract.contractingOfficeId, id: { not: contractId } }
            : { id: -1 },
        ],
      },
      include: { wasteScore: true },
      take: 10,
      orderBy: { obligatedAmount: "desc" },
    });

    // Calculate subaward totals
    const subawardTotal = contract.subawards.reduce(
      (sum, sub) => sum + (sub.subawardAmount ? Number(sub.subawardAmount) : 0),
      0
    );

    return NextResponse.json({
      contract: {
        id: contract.id,
        piid: contract.piid,
        parentIdvPiid: contract.parentIdvPiid,
        awardDescription: contract.awardDescription,
        awardType: contract.awardType,
        contractType: contract.contractType,
        awardDate: contract.awardDate?.toISOString().split("T")[0] || null,
        periodOfPerformanceStart: contract.periodOfPerformanceStart?.toISOString().split("T")[0] || null,
        periodOfPerformanceEnd: contract.periodOfPerformanceEnd?.toISOString().split("T")[0] || null,
        baseValue: contract.baseValue ? Number(contract.baseValue) : null,
        currentValue: contract.currentValue ? Number(contract.currentValue) : null,
        obligatedAmount: contract.obligatedAmount ? Number(contract.obligatedAmount) : null,
        awardCeiling: contract.awardCeiling ? Number(contract.awardCeiling) : null,
        naicsCode: contract.naicsCode,
        naicsDescription: contract.naicsDescription,
        pscCode: contract.pscCode,
        pscDescription: contract.pscDescription,
        vendorName: contract.vendorName,
        vendorUei: contract.vendorUei,
        vendorCageCode: contract.vendorCageCode,
        awardingAgency: contract.awardingAgency,
        awardingSubAgency: contract.awardingSubAgency,
        fundingAgency: contract.fundingAgency,
        contractingOfficeName: contract.contractingOfficeName,
        placeOfPerformanceState: contract.placeOfPerformanceState,
      },
      wasteScore: contract.wasteScore
        ? {
            costGrowthPct: contract.wasteScore.costGrowthPct ? Number(contract.wasteScore.costGrowthPct) : null,
            ceilingUtilization: contract.wasteScore.ceilingUtilization ? Number(contract.wasteScore.ceilingUtilization) : null,
            contractAgeDays: contract.wasteScore.contractAgeDays,
            modificationCount: contract.wasteScore.modificationCount,
            passThruRatio: contract.wasteScore.passThruRatio ? Number(contract.wasteScore.passThruRatio) : null,
            vendorConcentration: contract.wasteScore.vendorConcentration,
            duplicateRisk: contract.wasteScore.duplicateRisk ? Number(contract.wasteScore.duplicateRisk) : null,
            impliedHourlyRate: contract.wasteScore.impliedHourlyRate ? Number(contract.wasteScore.impliedHourlyRate) : null,
            overallScore: contract.wasteScore.overallScore ? Number(contract.wasteScore.overallScore) : null,
            flags: {
              costGrowth: contract.wasteScore.flagCostGrowth,
              underutilized: contract.wasteScore.flagUnderutilized,
              oldContract: contract.wasteScore.flagOldContract,
              highMods: contract.wasteScore.flagHighMods,
              passThru: contract.wasteScore.flagPassThru,
              vendorConc: contract.wasteScore.flagVendorConc,
              duplicate: contract.wasteScore.flagDuplicate,
              highRate: contract.wasteScore.flagHighRate,
            },
            calculatedAt: contract.wasteScore.calculatedAt?.toISOString() || null,
          }
        : null,
      modifications: contract.modifications.map((mod) => ({
        id: mod.id,
        modificationNumber: mod.modificationNumber,
        actionDate: mod.actionDate?.toISOString().split("T")[0] || null,
        actionType: mod.actionType,
        description: mod.description,
        obligatedChange: mod.obligatedChange ? Number(mod.obligatedChange) : null,
        obligatedTotal: mod.obligatedTotal ? Number(mod.obligatedTotal) : null,
      })),
      subawards: {
        total: subawardTotal,
        passThruPercent: contract.obligatedAmount && Number(contract.obligatedAmount) > 0
          ? (subawardTotal / Number(contract.obligatedAmount)) * 100
          : null,
        items: contract.subawards.map((sub) => ({
          id: sub.id,
          subawardNumber: sub.subawardNumber,
          subawardAmount: sub.subawardAmount ? Number(sub.subawardAmount) : null,
          subcontractorName: sub.subcontractorName,
          subcontractorUei: sub.subcontractorUei,
          description: sub.description,
          actionDate: sub.actionDate?.toISOString().split("T")[0] || null,
        })),
      },
      organization: contract.contractingOffice
        ? {
            id: contract.contractingOffice.id,
            name: contract.contractingOffice.name,
            code: contract.contractingOffice.code,
            level: contract.contractingOffice.level,
            parent: contract.contractingOffice.parent
              ? {
                  id: contract.contractingOffice.parent.id,
                  name: contract.contractingOffice.parent.name,
                  code: contract.contractingOffice.parent.code,
                }
              : null,
          }
        : null,
      relatedContracts: relatedContracts.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        awardDescription: c.awardDescription,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
        relationshipType: c.vendorUei === contract.vendorUei ? "same_vendor" : "same_org",
      })),
    });
  } catch (error) {
    console.error("Contract detail error:", error);
    return NextResponse.json({ error: "Failed to fetch contract details" }, { status: 500 });
  }
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/waste/contracts/\[id\]/route.ts
git commit -m "feat(waste): add API route for contract detail view"
```

---

## Task 6: Create API Route - Stats Dashboard

**Files:**
- Create: `src/app/api/waste/stats/route.ts`

**Step 1: Create the stats route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Basic counts
    const [totalContracts, contractsWithScores] = await Promise.all([
      prisma.serviceContract.count(),
      prisma.wasteScore.count(),
    ]);

    // Flag counts
    const flagCounts = await prisma.wasteScore.groupBy({
      by: [],
      _count: {
        _all: true,
      },
      _sum: {
        flagCostGrowth: false,
        flagUnderutilized: false,
        flagOldContract: false,
        flagHighMods: false,
        flagPassThru: false,
        flagVendorConc: false,
        flagDuplicate: false,
        flagHighRate: false,
      },
    });

    // Count flagged contracts (simpler approach)
    const [
      flaggedCostGrowth,
      flaggedUnderutilized,
      flaggedOldContract,
      flaggedHighMods,
      flaggedPassThru,
      flaggedVendorConc,
    ] = await Promise.all([
      prisma.wasteScore.count({ where: { flagCostGrowth: true } }),
      prisma.wasteScore.count({ where: { flagUnderutilized: true } }),
      prisma.wasteScore.count({ where: { flagOldContract: true } }),
      prisma.wasteScore.count({ where: { flagHighMods: true } }),
      prisma.wasteScore.count({ where: { flagPassThru: true } }),
      prisma.wasteScore.count({ where: { flagVendorConc: true } }),
    ]);

    // Total obligated amount
    const totalObligated = await prisma.serviceContract.aggregate({
      _sum: { obligatedAmount: true },
    });

    // Top flagged contracts
    const topFlagged = await prisma.serviceContract.findMany({
      where: {
        wasteScore: {
          overallScore: { gt: 50 },
        },
      },
      include: { wasteScore: true },
      orderBy: { wasteScore: { overallScore: "desc" } },
      take: 10,
    });

    // Score distribution
    const scoreDistribution = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN overall_score >= 80 THEN 'critical'
          WHEN overall_score >= 60 THEN 'high'
          WHEN overall_score >= 40 THEN 'medium'
          WHEN overall_score >= 20 THEN 'low'
          ELSE 'minimal'
        END as bucket,
        COUNT(*) as count
      FROM waste_scores
      WHERE overall_score IS NOT NULL
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
    `;

    return NextResponse.json({
      overview: {
        totalContracts,
        contractsWithScores,
        totalObligated: totalObligated._sum.obligatedAmount
          ? Number(totalObligated._sum.obligatedAmount)
          : 0,
      },
      flaggedCounts: {
        costGrowth: flaggedCostGrowth,
        underutilized: flaggedUnderutilized,
        oldContract: flaggedOldContract,
        highMods: flaggedHighMods,
        passThru: flaggedPassThru,
        vendorConc: flaggedVendorConc,
      },
      scoreDistribution: scoreDistribution.map((d) => ({
        bucket: d.bucket,
        count: Number(d.count),
      })),
      topFlagged: topFlagged.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
      })),
    });
  } catch (error) {
    console.error("Waste stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/waste/stats/route.ts
git commit -m "feat(waste): add API route for dashboard stats"
```

---

## Task 7: Create Waste Page - Filter Bar Component

**Files:**
- Create: `src/components/WasteFilterBar.tsx`

**Step 1: Create the filter bar**

```tsx
"use client";

import { useState } from "react";

interface WasteFilterBarProps {
  onFilterChange: (filters: WasteFilters) => void;
  initialFilters?: WasteFilters;
}

export interface WasteFilters {
  naics?: string;
  psc?: string;
  agency?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  flagCostGrowth?: boolean;
  flagUnderutilized?: boolean;
  flagOldContract?: boolean;
  flagHighMods?: boolean;
  flagPassThru?: boolean;
  flagVendorConc?: boolean;
}

const FLAG_OPTIONS = [
  { key: "flagCostGrowth", label: "Cost Growth >50%" },
  { key: "flagUnderutilized", label: "Underutilized Ceiling" },
  { key: "flagOldContract", label: ">5 Years Old" },
  { key: "flagHighMods", label: ">20 Modifications" },
  { key: "flagPassThru", label: ">70% Pass-Through" },
  { key: "flagVendorConc", label: "Vendor Concentration" },
] as const;

export function WasteFilterBar({ onFilterChange, initialFilters = {} }: WasteFilterBarProps) {
  const [filters, setFilters] = useState<WasteFilters>(initialFilters);
  const [naicsInput, setNaicsInput] = useState(initialFilters.naics || "");

  const updateFilter = (key: keyof WasteFilters, value: unknown) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleNaicsSubmit = () => {
    updateFilter("naics", naicsInput);
  };

  const toggleFlag = (key: keyof WasteFilters) => {
    updateFilter(key, !filters[key]);
  };

  const clearFilters = () => {
    setFilters({});
    setNaicsInput("");
    onFilterChange({});
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      {/* Top row: NAICS, Agency, Amount */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* NAICS Input */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">NAICS Code</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={naicsInput}
              onChange={(e) => setNaicsInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNaicsSubmit()}
              placeholder="e.g., 541511"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
            />
            <button
              onClick={handleNaicsSubmit}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Agency */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Agency</label>
          <input
            type="text"
            value={filters.agency || ""}
            onChange={(e) => updateFilter("agency", e.target.value)}
            placeholder="e.g., Army"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>

        {/* Min Amount */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Min Amount ($)</label>
          <input
            type="number"
            value={filters.minAmount || ""}
            onChange={(e) => updateFilter("minAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="100,000"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>

        {/* Max Amount */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Max Amount ($)</label>
          <input
            type="number"
            value={filters.maxAmount || ""}
            onChange={(e) => updateFilter("maxAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="No limit"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Flag toggles */}
      <div>
        <label className="block text-xs text-zinc-400 mb-2">Waste Flags</label>
        <div className="flex flex-wrap gap-2">
          {FLAG_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleFlag(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filters[key]
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear button */}
      {activeFilterCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={clearFilters}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Clear all filters ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/WasteFilterBar.tsx
git commit -m "feat(waste): add filter bar component"
```

---

## Task 8: Create Waste Page - Contract Table Component

**Files:**
- Create: `src/components/WasteContractTable.tsx`

**Step 1: Create the table component**

```tsx
"use client";

interface WasteContract {
  id: number;
  piid: string;
  vendorName: string | null;
  awardDescription: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  awardDate: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  awardingAgency: string | null;
  overallScore: number | null;
  flags: {
    costGrowth: boolean;
    underutilized: boolean;
    oldContract: boolean;
    highMods: boolean;
    passThru: boolean;
    vendorConc: boolean;
    duplicate: boolean;
    highRate: boolean;
  } | null;
}

interface WasteContractTableProps {
  contracts: WasteContract[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onSelect: (id: number) => void;
  selectedId?: number;
}

const FLAG_LABELS: Record<string, string> = {
  costGrowth: "Growth",
  underutilized: "Unused",
  oldContract: "Old",
  highMods: "Mods",
  passThru: "Pass-Thru",
  vendorConc: "Vendor",
  duplicate: "Dupe",
  highRate: "Rate",
};

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-zinc-500";
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  return "text-green-500";
}

export function WasteContractTable({
  contracts,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
  selectedId,
}: WasteContractTableProps) {
  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-white"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortBy === column && (
          <span className="text-red-500">{sortOrder === "asc" ? "↑" : "↓"}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-zinc-900 border-b border-zinc-800">
          <tr>
            <SortHeader column="overallScore" label="Score" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Flags
            </th>
            <SortHeader column="vendorName" label="Vendor" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Description
            </th>
            <SortHeader column="obligatedAmount" label="Obligated" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Ceiling
            </th>
            <SortHeader column="awardDate" label="Award Date" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Agency
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {contracts.map((contract) => (
            <tr
              key={contract.id}
              onClick={() => onSelect(contract.id)}
              className={`cursor-pointer transition-colors ${
                selectedId === contract.id
                  ? "bg-zinc-800"
                  : "hover:bg-zinc-900"
              }`}
            >
              <td className="px-4 py-3">
                <span className={`font-mono font-bold ${getScoreColor(contract.overallScore)}`}>
                  {contract.overallScore !== null ? contract.overallScore.toFixed(0) : "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {contract.flags &&
                    Object.entries(contract.flags)
                      .filter(([, value]) => value)
                      .slice(0, 3)
                      .map(([key]) => (
                        <span
                          key={key}
                          className="px-1.5 py-0.5 text-xs bg-red-900/50 text-red-400 rounded"
                        >
                          {FLAG_LABELS[key] || key}
                        </span>
                      ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-white max-w-[200px] truncate">
                {contract.vendorName || "Unknown"}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 max-w-[300px] truncate">
                {contract.awardDescription || "—"}
              </td>
              <td className="px-4 py-3 text-sm text-white font-mono">
                {formatCurrency(contract.obligatedAmount)}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
                {formatCurrency(contract.awardCeiling)}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400">
                {contract.awardDate || "—"}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 max-w-[150px] truncate">
                {contract.awardingAgency || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {contracts.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No contracts found matching your filters
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/WasteContractTable.tsx
git commit -m "feat(waste): add contract table component"
```

---

## Task 9: Create Waste Page - Detail Drawer Component

**Files:**
- Create: `src/components/WasteContractDetail.tsx`

**Step 1: Create the detail drawer**

```tsx
"use client";

import { useEffect, useState } from "react";

interface ContractDetail {
  contract: {
    id: number;
    piid: string;
    parentIdvPiid: string | null;
    awardDescription: string | null;
    awardType: string | null;
    awardDate: string | null;
    periodOfPerformanceStart: string | null;
    periodOfPerformanceEnd: string | null;
    baseValue: number | null;
    currentValue: number | null;
    obligatedAmount: number | null;
    awardCeiling: number | null;
    naicsCode: string | null;
    naicsDescription: string | null;
    pscCode: string | null;
    pscDescription: string | null;
    vendorName: string | null;
    vendorUei: string | null;
    awardingAgency: string | null;
    awardingSubAgency: string | null;
    fundingAgency: string | null;
    contractingOfficeName: string | null;
    placeOfPerformanceState: string | null;
  };
  wasteScore: {
    costGrowthPct: number | null;
    ceilingUtilization: number | null;
    contractAgeDays: number | null;
    modificationCount: number | null;
    passThruRatio: number | null;
    vendorConcentration: number | null;
    duplicateRisk: number | null;
    impliedHourlyRate: number | null;
    overallScore: number | null;
    flags: Record<string, boolean>;
  } | null;
  modifications: Array<{
    id: number;
    modificationNumber: string | null;
    actionDate: string | null;
    actionType: string | null;
    description: string | null;
    obligatedChange: number | null;
    obligatedTotal: number | null;
  }>;
  subawards: {
    total: number;
    passThruPercent: number | null;
    items: Array<{
      id: number;
      subawardNumber: string | null;
      subawardAmount: number | null;
      subcontractorName: string | null;
      description: string | null;
      actionDate: string | null;
    }>;
  };
  relatedContracts: Array<{
    id: number;
    piid: string;
    vendorName: string | null;
    obligatedAmount: number | null;
    overallScore: number | null;
    relationshipType: string;
  }>;
}

interface WasteContractDetailProps {
  contractId: number | null;
  onClose: () => void;
  onSelectRelated: (id: number) => void;
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ScoreIndicator({ value, threshold, inverted = false, label }: {
  value: number | null;
  threshold: number;
  inverted?: boolean;
  label: string;
}) {
  if (value === null) return null;

  const isFlagged = inverted ? value < threshold : value > threshold;
  const color = isFlagged ? "text-red-500" : "text-green-500";
  const bgColor = isFlagged ? "bg-red-900/30" : "bg-green-900/30";

  return (
    <div className={`p-3 rounded-lg ${bgColor}`}>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>
        {typeof value === "number" ? value.toFixed(1) : value}
        {label.includes("%") ? "%" : ""}
      </div>
    </div>
  );
}

export function WasteContractDetail({ contractId, onClose, onSelectRelated }: WasteContractDetailProps) {
  const [data, setData] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"scores" | "mods" | "subs" | "related">("scores");

  useEffect(() => {
    if (!contractId) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch(`/api/waste/contracts/${contractId}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [contractId]);

  if (!contractId) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-zinc-950 border-l border-zinc-800 shadow-xl overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Contract Detail</h2>
          {data && (
            <p className="text-sm text-zinc-400 font-mono">{data.contract.piid}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-zinc-800 rounded-lg"
        >
          <span className="text-zinc-400 text-xl">×</span>
        </button>
      </div>

      {loading && (
        <div className="p-8 text-center text-zinc-500">Loading...</div>
      )}

      {data && !loading && (
        <div className="p-4 space-y-6">
          {/* Overview */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-400">Overview</h3>
            <p className="text-sm text-white">{data.contract.awardDescription || "No description"}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Vendor:</span>
                <span className="text-white ml-2">{data.contract.vendorName || "Unknown"}</span>
              </div>
              <div>
                <span className="text-zinc-500">Agency:</span>
                <span className="text-white ml-2">{data.contract.awardingAgency || "Unknown"}</span>
              </div>
              <div>
                <span className="text-zinc-500">Obligated:</span>
                <span className="text-white ml-2">{formatCurrency(data.contract.obligatedAmount)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Ceiling:</span>
                <span className="text-white ml-2">{formatCurrency(data.contract.awardCeiling)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Award Date:</span>
                <span className="text-white ml-2">{data.contract.awardDate || "—"}</span>
              </div>
              <div>
                <span className="text-zinc-500">NAICS:</span>
                <span className="text-white ml-2">{data.contract.naicsCode || "—"}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-zinc-800">
            <div className="flex gap-4">
              {(["scores", "mods", "subs", "related"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-red-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-white"
                  }`}
                >
                  {tab === "scores" && "Waste Scores"}
                  {tab === "mods" && `Mods (${data.modifications.length})`}
                  {tab === "subs" && `Subs (${data.subawards.items.length})`}
                  {tab === "related" && `Related (${data.relatedContracts.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "scores" && data.wasteScore && (
            <div className="grid grid-cols-2 gap-3">
              <ScoreIndicator
                value={data.wasteScore.costGrowthPct}
                threshold={50}
                label="Cost Growth %"
              />
              <ScoreIndicator
                value={data.wasteScore.ceilingUtilization}
                threshold={20}
                inverted
                label="Ceiling Used %"
              />
              <ScoreIndicator
                value={data.wasteScore.contractAgeDays ? data.wasteScore.contractAgeDays / 365 : null}
                threshold={5}
                label="Age (Years)"
              />
              <ScoreIndicator
                value={data.wasteScore.modificationCount}
                threshold={20}
                label="Modifications"
              />
              <ScoreIndicator
                value={data.wasteScore.passThruRatio}
                threshold={70}
                label="Pass-Through %"
              />
              <ScoreIndicator
                value={data.wasteScore.vendorConcentration}
                threshold={5}
                label="Vendor Contracts"
              />
            </div>
          )}

          {activeTab === "mods" && (
            <div className="space-y-2">
              {data.modifications.length === 0 ? (
                <p className="text-zinc-500 text-sm">No modifications recorded</p>
              ) : (
                data.modifications.map((mod) => (
                  <div key={mod.id} className="p-3 bg-zinc-900 rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">{mod.actionDate || "Unknown date"}</span>
                      <span className={mod.obligatedChange && mod.obligatedChange > 0 ? "text-red-400" : "text-green-400"}>
                        {mod.obligatedChange ? formatCurrency(mod.obligatedChange) : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 truncate">{mod.description || "No description"}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "subs" && (
            <div className="space-y-2">
              <div className="p-3 bg-zinc-900 rounded-lg">
                <div className="text-xs text-zinc-400">Total Subawarded</div>
                <div className="text-lg font-bold text-white">{formatCurrency(data.subawards.total)}</div>
                {data.subawards.passThruPercent !== null && (
                  <div className="text-xs text-zinc-500">
                    {data.subawards.passThruPercent.toFixed(1)}% of obligated amount
                  </div>
                )}
              </div>
              {data.subawards.items.map((sub) => (
                <div key={sub.id} className="p-3 bg-zinc-900 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-white">{sub.subcontractorName || "Unknown"}</span>
                    <span className="text-zinc-400">{formatCurrency(sub.subawardAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "related" && (
            <div className="space-y-2">
              {data.relatedContracts.length === 0 ? (
                <p className="text-zinc-500 text-sm">No related contracts found</p>
              ) : (
                data.relatedContracts.map((rel) => (
                  <div
                    key={rel.id}
                    onClick={() => onSelectRelated(rel.id)}
                    className="p-3 bg-zinc-900 rounded-lg cursor-pointer hover:bg-zinc-800"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-white">{rel.vendorName || "Unknown"}</span>
                      <span className="text-zinc-400">{formatCurrency(rel.obligatedAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-zinc-500 font-mono">{rel.piid}</span>
                      <span className={rel.relationshipType === "same_vendor" ? "text-blue-400" : "text-purple-400"}>
                        {rel.relationshipType === "same_vendor" ? "Same Vendor" : "Same Office"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/WasteContractDetail.tsx
git commit -m "feat(waste): add contract detail drawer component"
```

---

## Task 10: Create Waste Page

**Files:**
- Create: `src/app/waste/page.tsx`

**Step 1: Create the page**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { NavTabs } from "@/components/NavTabs";
import { Pagination } from "@/components/Pagination";
import { WasteFilterBar, WasteFilters } from "@/components/WasteFilterBar";
import { WasteContractTable } from "@/components/WasteContractTable";
import { WasteContractDetail } from "@/components/WasteContractDetail";

interface Contract {
  id: number;
  piid: string;
  vendorName: string | null;
  awardDescription: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  awardDate: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  awardingAgency: string | null;
  overallScore: number | null;
  flags: {
    costGrowth: boolean;
    underutilized: boolean;
    oldContract: boolean;
    highMods: boolean;
    passThru: boolean;
    vendorConc: boolean;
    duplicate: boolean;
    highRate: boolean;
  } | null;
}

interface Stats {
  overview: {
    totalContracts: number;
    contractsWithScores: number;
    totalObligated: number;
  };
  flaggedCounts: Record<string, number>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

export default function WastePage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<WasteFilters>({});
  const [sortBy, setSortBy] = useState("overallScore");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams({
      page: page.toString(),
      limit: "50",
      sortBy,
      sortOrder,
    });

    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });

    try {
      const res = await fetch(`/api/waste/contracts?${params}`);
      const data = await res.json();
      setContracts(data.results || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch contracts:", error);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/waste/stats");
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const handleFilterChange = (newFilters: WasteFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-red-500 font-bold text-xl">WARWERX</div>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Contract Waste Screener</span>
            </div>
            <NavTabs />
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      {stats && (
        <div className="border-b border-zinc-800 bg-zinc-950/50">
          <div className="max-w-[1800px] mx-auto px-6 py-3">
            <div className="flex items-center gap-8 text-sm">
              <div>
                <span className="text-zinc-500">Contracts:</span>
                <span className="text-white ml-2 font-mono">{stats.overview.totalContracts.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-zinc-500">Scored:</span>
                <span className="text-white ml-2 font-mono">{stats.overview.contractsWithScores.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-zinc-500">Total Obligated:</span>
                <span className="text-white ml-2 font-mono">{formatCurrency(stats.overview.totalObligated)}</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4">
                {stats.scoreDistribution.map((d) => (
                  <div key={d.bucket} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${
                      d.bucket === "critical" ? "bg-red-500" :
                      d.bucket === "high" ? "bg-orange-500" :
                      d.bucket === "medium" ? "bg-yellow-500" :
                      d.bucket === "low" ? "bg-green-500" : "bg-zinc-500"
                    }`} />
                    <span className="text-zinc-400 text-xs">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="space-y-4">
          {/* Filters */}
          <WasteFilterBar onFilterChange={handleFilterChange} />

          {/* Results info */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {loading ? "Loading..." : `${total.toLocaleString()} contracts found`}
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <WasteContractTable
              contracts={contracts}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              onSelect={setSelectedId}
              selectedId={selectedId || undefined}
            />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>

      {/* Detail Drawer */}
      <WasteContractDetail
        contractId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelectRelated={setSelectedId}
      />
    </div>
  );
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/waste/page.tsx
git commit -m "feat(waste): add waste screener page"
```

---

## Task 11: Update NavTabs to Include Waste

**Files:**
- Modify: `src/components/NavTabs.tsx`

**Step 1: Add Waste tab**

Replace the tabs array (around line 6-9):

```typescript
const tabs = [
  { name: "Contracts", href: "/" },
  { name: "Budget", href: "/budget" },
  { name: "Waste", href: "/waste" },
];
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/NavTabs.tsx
git commit -m "feat(waste): add Waste tab to navigation"
```

---

## Task 12: Create Data Sync Script

**Files:**
- Create: `scripts/sync-waste-contracts.ts`

**Step 1: Create the sync script**

```typescript
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
```

**Step 2: Add script to package.json**

In package.json, add to scripts:

```json
"waste:sync": "npx tsx scripts/sync-waste-contracts.ts"
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only non-blocking warnings)

**Step 4: Commit**

```bash
git add scripts/sync-waste-contracts.ts package.json
git commit -m "feat(waste): add data sync script for USASpending"
```

---

## Summary

This plan creates:
1. **Database schema** - 5 new models for contracts, modifications, subawards, scores, orgs
2. **API client** - USASpending integration for DoD services contracts
3. **Score calculator** - 8 waste signals with weighted overall score
4. **API routes** - List, detail, and stats endpoints
5. **UI components** - Filter bar, table, detail drawer
6. **Page** - Full waste screener at `/waste`
7. **Data sync** - Script to populate from USASpending

After all tasks, run `npm run build` to verify, then `npm run waste:sync` to populate initial data.
