# Black-Scholes Risk Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cost risk scoring system using Black-Scholes-inspired volatility modeling on contract ceiling-to-obligation ratios.

**Architecture:** Prisma models store volatility parameters and risk scores. USASpending modification history provides observations. Risk scores combine volatility, lifecycle stage, and current ratio into actionable outputs (0-100 score, probability distribution, breach warnings).

**Tech Stack:** Next.js 15 App Router, Prisma 7, PostgreSQL, TypeScript, React, Tailwind CSS

---

## Phase 1: Data Foundation

### Task 1: Add Prisma Models

**Files:**
- Modify: `prisma/schema.prisma` (append after WasteScore model, ~line 165)

**Step 1: Add the three new models to schema.prisma**

Append to end of file:

```prisma
// ============================================================================
// Risk Model (Black-Scholes Cost Risk)
// ============================================================================

enum ConfidenceLevel {
  high   // 50+ observations
  medium // 20-49 observations
  low    // <20 observations
}

model VolatilityParameter {
  id                Int       @id @default(autoincrement())
  pscCode           String    @map("psc_code")
  agencyCode        String?   @map("agency_code")
  sigma             Decimal   @db.Decimal(8, 4) // Annualized volatility (e.g., 0.2500 = 25%)
  observationCount  Int       @map("observation_count")
  confidenceLevel   ConfidenceLevel @map("confidence_level")
  lastCalculated    DateTime  @map("last_calculated")

  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  @@unique([pscCode, agencyCode])
  @@index([pscCode])
  @@index([confidenceLevel])
  @@map("volatility_parameters")
}

model ContractRiskScore {
  id                      Int       @id @default(autoincrement())
  contractId              Int       @unique @map("contract_id")

  // Current state
  currentRatio            Decimal   @map("current_ratio") @db.Decimal(8, 4)
  impliedVolatility       Decimal   @map("implied_volatility") @db.Decimal(8, 4)
  lifecycleStage          Int       @map("lifecycle_stage") // 0-100 percent complete
  lifecycleMultiplier     Decimal   @map("lifecycle_multiplier") @db.Decimal(4, 2)

  // Outputs
  riskScore               Int       @map("risk_score") // 0-100
  expectedCostLow         Decimal?  @map("expected_cost_low") @db.Decimal(15, 2) // 10th percentile
  expectedCostMid         Decimal?  @map("expected_cost_mid") @db.Decimal(15, 2) // 50th percentile
  expectedCostHigh        Decimal?  @map("expected_cost_high") @db.Decimal(15, 2) // 90th percentile
  ceilingBreachProb       Decimal   @map("ceiling_breach_prob") @db.Decimal(5, 2) // 0-100%
  monthsToWarning         Int?      @map("months_to_warning")

  // Confidence from underlying volatility parameter
  confidenceLevel         ConfidenceLevel @map("confidence_level")

  calculatedAt            DateTime  @map("calculated_at")
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")

  contract                ServiceContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  @@index([riskScore(sort: Desc)])
  @@index([ceilingBreachProb(sort: Desc)])
  @@index([monthsToWarning])
  @@index([confidenceLevel])
  @@map("contract_risk_scores")
}

model ContractCostObservation {
  id                Int       @id @default(autoincrement())
  contractId        Int       @map("contract_id")
  observationDate   DateTime  @map("observation_date")
  ceilingValue      Decimal   @map("ceiling_value") @db.Decimal(15, 2)
  obligationValue   Decimal   @map("obligation_value") @db.Decimal(15, 2)
  ratio             Decimal   @db.Decimal(8, 4)

  createdAt         DateTime  @default(now()) @map("created_at")

  contract          ServiceContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  @@index([contractId, observationDate])
  @@map("contract_cost_observations")
}
```

**Step 2: Add relation to ServiceContract model**

Find ServiceContract model and add to relations section (after wasteScore):

```prisma
  riskScore               ContractRiskScore?
  costObservations        ContractCostObservation[]
```

**Step 3: Generate Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

**Step 4: Push schema to database**

Run: `npx prisma db push`
Expected: Tables created without errors

**Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(risk): add Prisma models for volatility parameters, risk scores, and cost observations"
```

---

### Task 2: Create Observation Extraction Library

**Files:**
- Create: `src/lib/risk/observation-extractor.ts`

**Step 1: Create the risk library directory**

Run: `mkdir -p src/lib/risk`
Expected: Directory created

**Step 2: Write the observation extractor**

Create `src/lib/risk/observation-extractor.ts`:

```typescript
/**
 * Observation Extractor
 * Creates ContractCostObservation records from modification history
 */

import { prisma } from "@/lib/prisma";

interface ObservationData {
  contractId: number;
  observationDate: Date;
  ceilingValue: number;
  obligationValue: number;
  ratio: number;
}

/**
 * Extract observations from a contract's modification history
 * Each modification that changes ceiling or obligation creates an observation
 */
export async function extractObservationsForContract(
  contractId: number
): Promise<ObservationData[]> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
    include: {
      modifications: {
        orderBy: { actionDate: "asc" },
      },
    },
  });

  if (!contract) return [];

  const observations: ObservationData[] = [];

  // Initial observation from contract award
  const initialCeiling = Number(contract.awardCeiling) || 0;
  const initialObligation = Number(contract.obligatedAmount) || 0;

  if (initialCeiling > 0 && contract.awardDate) {
    observations.push({
      contractId,
      observationDate: contract.awardDate,
      ceilingValue: initialCeiling,
      obligationValue: initialObligation,
      ratio: initialObligation / initialCeiling,
    });
  }

  // Track running totals through modifications
  let runningCeiling = initialCeiling;
  let runningObligation = initialObligation;

  for (const mod of contract.modifications) {
    if (!mod.actionDate) continue;

    const obligatedChange = Number(mod.obligatedChange) || 0;
    const newTotal = Number(mod.obligatedTotal);

    // Update running obligation
    if (!isNaN(newTotal) && newTotal > 0) {
      runningObligation = newTotal;
    } else if (obligatedChange !== 0) {
      runningObligation += obligatedChange;
    }

    // Skip if no valid ceiling
    if (runningCeiling <= 0) continue;

    const ratio = runningObligation / runningCeiling;

    // Only add observation if ratio changed significantly (>0.1%)
    const lastRatio = observations.length > 0
      ? observations[observations.length - 1].ratio
      : 0;

    if (Math.abs(ratio - lastRatio) > 0.001) {
      observations.push({
        contractId,
        observationDate: mod.actionDate,
        ceilingValue: runningCeiling,
        obligationValue: runningObligation,
        ratio,
      });
    }
  }

  return observations;
}

/**
 * Save observations to database (upsert pattern)
 */
export async function saveObservationsForContract(
  contractId: number
): Promise<number> {
  const observations = await extractObservationsForContract(contractId);

  // Delete existing observations for this contract
  await prisma.contractCostObservation.deleteMany({
    where: { contractId },
  });

  // Insert new observations
  if (observations.length > 0) {
    await prisma.contractCostObservation.createMany({
      data: observations,
    });
  }

  return observations.length;
}

/**
 * Extract observations for all contracts (batch)
 */
export async function extractAllObservations(): Promise<{
  processed: number;
  totalObservations: number;
  errors: number;
}> {
  const contracts = await prisma.serviceContract.findMany({
    where: {
      awardCeiling: { gt: 0 },
    },
    select: { id: true },
  });

  let processed = 0;
  let totalObservations = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      const count = await saveObservationsForContract(contract.id);
      totalObservations += count;
      processed++;
    } catch (error) {
      console.error(`Error extracting observations for contract ${contract.id}:`, error);
      errors++;
    }
  }

  return { processed, totalObservations, errors };
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/risk/observation-extractor.ts
git commit -m "feat(risk): add observation extractor for contract modification history"
```

---

### Task 3: Create Volatility Calculator

**Files:**
- Create: `src/lib/risk/volatility-calculator.ts`

**Step 1: Write the volatility calculator**

Create `src/lib/risk/volatility-calculator.ts`:

```typescript
/**
 * Volatility Calculator
 * Computes annualized volatility from contract cost observations
 */

import { prisma } from "@/lib/prisma";
import { ConfidenceLevel } from "@prisma/client";

interface VolatilityResult {
  pscCode: string;
  agencyCode: string | null;
  sigma: number;
  observationCount: number;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Calculate volatility for a single contract from its observations
 * Returns annualized standard deviation of ratio changes
 */
export function calculateContractVolatility(
  observations: Array<{ observationDate: Date; ratio: number }>
): number | null {
  if (observations.length < 3) return null;

  // Calculate returns (percentage changes in ratio)
  const returns: Array<{ return: number; daysDelta: number }> = [];

  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1];
    const curr = observations[i];

    if (prev.ratio <= 0) continue;

    const returnPct = (curr.ratio - prev.ratio) / prev.ratio;
    const daysDelta = Math.max(1,
      (curr.observationDate.getTime() - prev.observationDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    returns.push({ return: returnPct, daysDelta });
  }

  if (returns.length < 2) return null;

  // Annualize each return and calculate variance
  const annualizedReturns = returns.map(r =>
    r.return * Math.sqrt(365 / r.daysDelta)
  );

  const mean = annualizedReturns.reduce((a, b) => a + b, 0) / annualizedReturns.length;
  const variance = annualizedReturns.reduce((sum, r) =>
    sum + Math.pow(r - mean, 2), 0
  ) / (annualizedReturns.length - 1);

  return Math.sqrt(variance);
}

/**
 * Get confidence level based on observation count
 */
function getConfidenceLevel(count: number): ConfidenceLevel {
  if (count >= 50) return "high";
  if (count >= 20) return "medium";
  return "low";
}

/**
 * Calculate volatility parameters for all PSC codes
 */
export async function calculateAllVolatilityParameters(): Promise<{
  parameters: number;
  errors: number;
}> {
  // Get all PSC codes with contracts
  const pscCodes = await prisma.serviceContract.groupBy({
    by: ["pscCode"],
    where: {
      pscCode: { not: null },
      costObservations: { some: {} },
    },
    _count: { id: true },
  });

  let parameters = 0;
  let errors = 0;

  for (const { pscCode } of pscCodes) {
    if (!pscCode) continue;

    try {
      // Get all contracts with this PSC code
      const contracts = await prisma.serviceContract.findMany({
        where: {
          pscCode,
          costObservations: { some: {} },
        },
        include: {
          costObservations: {
            orderBy: { observationDate: "asc" },
          },
        },
      });

      // Calculate volatility for each contract
      const volatilities: Array<{ sigma: number; weight: number }> = [];

      for (const contract of contracts) {
        const sigma = calculateContractVolatility(contract.costObservations);
        if (sigma !== null && !isNaN(sigma) && isFinite(sigma)) {
          const weight = Number(contract.obligatedAmount) || 1;
          volatilities.push({ sigma, weight });
        }
      }

      if (volatilities.length === 0) continue;

      // Weighted average volatility
      const totalWeight = volatilities.reduce((sum, v) => sum + v.weight, 0);
      const weightedSigma = volatilities.reduce(
        (sum, v) => sum + v.sigma * v.weight, 0
      ) / totalWeight;

      // Upsert volatility parameter
      await prisma.volatilityParameter.upsert({
        where: {
          pscCode_agencyCode: { pscCode, agencyCode: null },
        },
        create: {
          pscCode,
          agencyCode: null,
          sigma: weightedSigma,
          observationCount: volatilities.length,
          confidenceLevel: getConfidenceLevel(volatilities.length),
          lastCalculated: new Date(),
        },
        update: {
          sigma: weightedSigma,
          observationCount: volatilities.length,
          confidenceLevel: getConfidenceLevel(volatilities.length),
          lastCalculated: new Date(),
        },
      });

      parameters++;
    } catch (error) {
      console.error(`Error calculating volatility for PSC ${pscCode}:`, error);
      errors++;
    }
  }

  return { parameters, errors };
}

/**
 * Get volatility parameter for a contract
 * Falls back to PSC-only if no agency-specific parameter exists
 */
export async function getVolatilityForContract(
  pscCode: string | null,
  agencyCode: string | null
): Promise<{ sigma: number; confidence: ConfidenceLevel } | null> {
  if (!pscCode) return null;

  // Try agency-specific first
  if (agencyCode) {
    const specific = await prisma.volatilityParameter.findUnique({
      where: {
        pscCode_agencyCode: { pscCode, agencyCode },
      },
    });
    if (specific) {
      return { sigma: Number(specific.sigma), confidence: specific.confidenceLevel };
    }
  }

  // Fall back to PSC-only
  const general = await prisma.volatilityParameter.findUnique({
    where: {
      pscCode_agencyCode: { pscCode, agencyCode: null },
    },
  });

  if (general) {
    return { sigma: Number(general.sigma), confidence: general.confidenceLevel };
  }

  return null;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/risk/volatility-calculator.ts
git commit -m "feat(risk): add volatility calculator with weighted PSC aggregation"
```

---

## Phase 2: Risk Scoring

### Task 4: Create Risk Score Calculator

**Files:**
- Create: `src/lib/risk/risk-calculator.ts`

**Step 1: Write the risk score calculator**

Create `src/lib/risk/risk-calculator.ts`:

```typescript
/**
 * Risk Score Calculator
 * Applies Black-Scholes-inspired model to compute contract cost risk
 */

import { prisma } from "@/lib/prisma";
import { ConfidenceLevel } from "@prisma/client";
import { getVolatilityForContract } from "./volatility-calculator";

// Lifecycle multipliers (early contracts more volatile)
const LIFECYCLE_MULTIPLIERS: Record<string, number> = {
  early: 1.5,    // 0-25% complete
  mid: 1.0,      // 25-75% complete
  late: 0.7,     // 75-100% complete
};

// Default volatility when no parameter exists
const DEFAULT_SIGMA = 0.25; // 25%

interface RiskScoreResult {
  currentRatio: number;
  impliedVolatility: number;
  lifecycleStage: number;
  lifecycleMultiplier: number;
  riskScore: number;
  expectedCostLow: number | null;
  expectedCostMid: number | null;
  expectedCostHigh: number | null;
  ceilingBreachProb: number;
  monthsToWarning: number | null;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Calculate lifecycle stage (0-100%)
 */
function calculateLifecycleStage(
  startDate: Date | null,
  endDate: Date | null
): number {
  if (!startDate || !endDate) return 50; // Default to mid-stage

  const now = new Date();
  const start = startDate.getTime();
  const end = endDate.getTime();
  const current = now.getTime();

  if (current <= start) return 0;
  if (current >= end) return 100;

  return Math.round(((current - start) / (end - start)) * 100);
}

/**
 * Get lifecycle multiplier based on stage
 */
function getLifecycleMultiplier(stage: number): number {
  if (stage < 25) return LIFECYCLE_MULTIPLIERS.early;
  if (stage > 75) return LIFECYCLE_MULTIPLIERS.late;
  return LIFECYCLE_MULTIPLIERS.mid;
}

/**
 * Standard normal CDF approximation (for Black-Scholes)
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate expected ratio at time T using geometric Brownian motion
 * Returns percentiles (10th, 50th, 90th)
 */
function projectRatioDistribution(
  currentRatio: number,
  sigma: number,
  yearsRemaining: number
): { low: number; mid: number; high: number } {
  if (yearsRemaining <= 0 || sigma <= 0) {
    return { low: currentRatio, mid: currentRatio, high: currentRatio };
  }

  // Drift is 0 (ratio expected to stay constant without volatility)
  const sqrtT = Math.sqrt(yearsRemaining);

  // Log-normal distribution quantiles
  const z10 = -1.28; // 10th percentile
  const z50 = 0;     // 50th percentile
  const z90 = 1.28;  // 90th percentile

  return {
    low: currentRatio * Math.exp(-0.5 * sigma * sigma * yearsRemaining + sigma * sqrtT * z10),
    mid: currentRatio * Math.exp(-0.5 * sigma * sigma * yearsRemaining + sigma * sqrtT * z50),
    high: currentRatio * Math.exp(-0.5 * sigma * sigma * yearsRemaining + sigma * sqrtT * z90),
  };
}

/**
 * Calculate probability ratio exceeds ceiling (ratio > 1)
 */
function calculateBreachProbability(
  currentRatio: number,
  sigma: number,
  yearsRemaining: number
): number {
  if (currentRatio >= 1) return 100; // Already at/above ceiling
  if (yearsRemaining <= 0 || sigma <= 0) return 0;

  // Using log-normal distribution
  // P(S_T > K) where K = 1 (ceiling)
  const d2 = (Math.log(currentRatio) - 0.5 * sigma * sigma * yearsRemaining) / (sigma * Math.sqrt(yearsRemaining));

  return (1 - normalCDF(d2)) * 100;
}

/**
 * Calculate months until breach probability exceeds 50%
 */
function calculateMonthsToWarning(
  currentRatio: number,
  sigma: number,
  totalMonthsRemaining: number
): number | null {
  if (currentRatio >= 0.9) return 0; // Already at warning threshold
  if (sigma <= 0) return null;

  // Binary search for time when breach prob > 50%
  for (let months = 1; months <= totalMonthsRemaining; months++) {
    const years = months / 12;
    const prob = calculateBreachProbability(currentRatio, sigma, years);
    if (prob >= 50) return months;
  }

  return null; // Won't breach within contract period
}

/**
 * Calculate composite risk score (0-100)
 */
function calculateCompositeScore(
  currentRatio: number,
  sigma: number,
  lifecycleMultiplier: number,
  breachProb: number
): number {
  // Components:
  // 1. Current position risk (ratio closeness to ceiling): 0-40 points
  // 2. Volatility risk (sigma vs typical): 0-30 points
  // 3. Breach probability: 0-30 points

  const positionScore = Math.min(40, currentRatio * 40);
  const volatilityScore = Math.min(30, (sigma / 0.5) * 30 * lifecycleMultiplier);
  const breachScore = breachProb * 0.3;

  return Math.round(Math.min(100, positionScore + volatilityScore + breachScore));
}

/**
 * Calculate risk score for a single contract
 */
export async function calculateRiskScore(
  contractId: number
): Promise<RiskScoreResult | null> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id: contractId },
  });

  if (!contract) return null;

  const ceiling = Number(contract.awardCeiling) || 0;
  const obligated = Number(contract.obligatedAmount) || 0;

  if (ceiling <= 0) return null;

  const currentRatio = obligated / ceiling;

  // Get volatility parameter
  const volatility = await getVolatilityForContract(
    contract.pscCode,
    contract.awardingAgency
  );

  const sigma = volatility?.sigma ?? DEFAULT_SIGMA;
  const confidence = volatility?.confidenceLevel ?? "low";

  // Calculate lifecycle
  const lifecycleStage = calculateLifecycleStage(
    contract.periodOfPerformanceStart,
    contract.periodOfPerformanceEnd
  );
  const lifecycleMultiplier = getLifecycleMultiplier(lifecycleStage);
  const adjustedSigma = sigma * lifecycleMultiplier;

  // Time remaining
  const endDate = contract.periodOfPerformanceEnd;
  const yearsRemaining = endDate
    ? Math.max(0, (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365))
    : 1; // Default 1 year if unknown

  const monthsRemaining = Math.round(yearsRemaining * 12);

  // Project distribution
  const projection = projectRatioDistribution(currentRatio, adjustedSigma, yearsRemaining);

  // Calculate expected costs at each percentile
  const expectedCostLow = projection.low * ceiling;
  const expectedCostMid = projection.mid * ceiling;
  const expectedCostHigh = projection.high * ceiling;

  // Breach probability
  const ceilingBreachProb = calculateBreachProbability(currentRatio, adjustedSigma, yearsRemaining);

  // Months to warning
  const monthsToWarning = calculateMonthsToWarning(currentRatio, adjustedSigma, monthsRemaining);

  // Composite score
  const riskScore = calculateCompositeScore(currentRatio, adjustedSigma, lifecycleMultiplier, ceilingBreachProb);

  return {
    currentRatio,
    impliedVolatility: adjustedSigma,
    lifecycleStage,
    lifecycleMultiplier,
    riskScore,
    expectedCostLow,
    expectedCostMid,
    expectedCostHigh,
    ceilingBreachProb,
    monthsToWarning,
    confidenceLevel: confidence,
  };
}

/**
 * Calculate and save risk score for a contract
 */
export async function saveRiskScore(contractId: number): Promise<void> {
  const result = await calculateRiskScore(contractId);
  if (!result) return;

  await prisma.contractRiskScore.upsert({
    where: { contractId },
    create: {
      contractId,
      ...result,
      calculatedAt: new Date(),
    },
    update: {
      ...result,
      calculatedAt: new Date(),
    },
  });
}

/**
 * Calculate risk scores for all contracts
 */
export async function calculateAllRiskScores(): Promise<{
  processed: number;
  errors: number;
}> {
  const contracts = await prisma.serviceContract.findMany({
    where: {
      awardCeiling: { gt: 0 },
    },
    select: { id: true },
  });

  let processed = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      await saveRiskScore(contract.id);
      processed++;
    } catch (error) {
      console.error(`Error calculating risk for contract ${contract.id}:`, error);
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
git add src/lib/risk/risk-calculator.ts
git commit -m "feat(risk): add Black-Scholes risk calculator with lifecycle adjustments"
```

---

### Task 5: Create Data Sync Script

**Files:**
- Create: `scripts/risk-sync.ts`

**Step 1: Write the sync script**

Create `scripts/risk-sync.ts`:

```typescript
/**
 * Risk Model Data Sync
 * Extracts observations, calculates volatility parameters, and scores contracts
 */

import { prisma } from "../src/lib/prisma";
import { extractAllObservations } from "../src/lib/risk/observation-extractor";
import { calculateAllVolatilityParameters } from "../src/lib/risk/volatility-calculator";
import { calculateAllRiskScores } from "../src/lib/risk/risk-calculator";

async function main() {
  console.log("Starting risk model sync...\n");

  // Step 1: Extract observations from modification history
  console.log("Step 1: Extracting cost observations...");
  const obsResult = await extractAllObservations();
  console.log(`  Processed: ${obsResult.processed} contracts`);
  console.log(`  Observations: ${obsResult.totalObservations}`);
  console.log(`  Errors: ${obsResult.errors}\n`);

  // Step 2: Calculate volatility parameters
  console.log("Step 2: Calculating volatility parameters...");
  const volResult = await calculateAllVolatilityParameters();
  console.log(`  Parameters: ${volResult.parameters}`);
  console.log(`  Errors: ${volResult.errors}\n`);

  // Step 3: Calculate risk scores
  console.log("Step 3: Calculating risk scores...");
  const riskResult = await calculateAllRiskScores();
  console.log(`  Processed: ${riskResult.processed} contracts`);
  console.log(`  Errors: ${riskResult.errors}\n`);

  // Summary
  console.log("Risk model sync complete!");
  console.log(`  Total observations: ${obsResult.totalObservations}`);
  console.log(`  Volatility parameters: ${volResult.parameters}`);
  console.log(`  Contracts scored: ${riskResult.processed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Step 2: Add npm script to package.json**

In package.json, add to "scripts" section:

```json
"risk:sync": "npx tsx scripts/risk-sync.ts"
```

**Step 3: Verify script exists**

Run: `ls scripts/risk-sync.ts`
Expected: File exists

**Step 4: Commit**

```bash
git add scripts/risk-sync.ts package.json
git commit -m "feat(risk): add data sync script for observations, volatility, and risk scores"
```

---

## Phase 3: API Layer

### Task 6: Create Risk Contracts List API

**Files:**
- Create: `src/app/api/risk/contracts/route.ts`

**Step 1: Create directory**

Run: `mkdir -p src/app/api/risk/contracts`
Expected: Directory created

**Step 2: Write the contracts list API**

Create `src/app/api/risk/contracts/route.ts`:

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
    const sortBy = searchParams.get("sortBy") || "riskScore";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Filters
    const pscCode = searchParams.get("psc");
    const agency = searchParams.get("agency");
    const minRiskScore = searchParams.get("minRiskScore") ? parseInt(searchParams.get("minRiskScore")!) : undefined;
    const maxRiskScore = searchParams.get("maxRiskScore") ? parseInt(searchParams.get("maxRiskScore")!) : undefined;
    const confidenceLevel = searchParams.get("confidence");
    const lifecycleStage = searchParams.get("lifecycle"); // early, mid, late

    // Build where clause
    const where: Record<string, unknown> = {
      riskScore: { isNot: null },
    };

    if (pscCode) {
      where.pscCode = { startsWith: pscCode };
    }
    if (agency) {
      where.awardingAgency = { contains: agency, mode: "insensitive" };
    }

    // Risk score filters on relation
    const riskScoreWhere: Record<string, unknown> = {};
    if (minRiskScore !== undefined) {
      riskScoreWhere.riskScore = { gte: minRiskScore };
    }
    if (maxRiskScore !== undefined) {
      riskScoreWhere.riskScore = {
        ...(riskScoreWhere.riskScore as Record<string, unknown> || {}),
        lte: maxRiskScore
      };
    }
    if (confidenceLevel) {
      riskScoreWhere.confidenceLevel = confidenceLevel;
    }
    if (lifecycleStage) {
      const ranges: Record<string, { gte: number; lt?: number }> = {
        early: { gte: 0, lt: 25 },
        mid: { gte: 25, lt: 75 },
        late: { gte: 75 },
      };
      if (ranges[lifecycleStage]) {
        riskScoreWhere.lifecycleStage = ranges[lifecycleStage];
      }
    }

    if (Object.keys(riskScoreWhere).length > 0) {
      where.riskScore = riskScoreWhere;
    }

    // Build orderBy
    const orderBy: Record<string, unknown>[] = [];
    if (sortBy === "riskScore") {
      orderBy.push({ riskScore: { riskScore: sortOrder } });
    } else if (sortBy === "breachProbability") {
      orderBy.push({ riskScore: { ceilingBreachProb: sortOrder } });
    } else if (sortBy === "monthsToWarning") {
      orderBy.push({ riskScore: { monthsToWarning: sortOrder } });
    } else if (sortBy === "obligatedAmount") {
      orderBy.push({ obligatedAmount: sortOrder });
    }

    // Execute query
    const [contracts, total] = await Promise.all([
      prisma.serviceContract.findMany({
        where,
        include: {
          riskScore: true,
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
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        awardCeiling: c.awardCeiling ? Number(c.awardCeiling) : null,
        pscCode: c.pscCode,
        awardingAgency: c.awardingAgency,
        riskScore: c.riskScore?.riskScore ?? null,
        currentRatio: c.riskScore?.currentRatio ? Number(c.riskScore.currentRatio) : null,
        breachProbability: c.riskScore?.ceilingBreachProb ? Number(c.riskScore.ceilingBreachProb) : null,
        monthsToWarning: c.riskScore?.monthsToWarning ?? null,
        lifecycleStage: c.riskScore?.lifecycleStage ?? null,
        confidenceLevel: c.riskScore?.confidenceLevel ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Risk contracts list error:", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/risk/contracts/route.ts
git commit -m "feat(risk): add contracts list API with risk score filtering"
```

---

### Task 7: Create Risk Contract Detail API

**Files:**
- Create: `src/app/api/risk/contracts/[id]/route.ts`

**Step 1: Create directory**

Run: `mkdir -p "src/app/api/risk/contracts/[id]"`
Expected: Directory created

**Step 2: Write the contract detail API**

Create `src/app/api/risk/contracts/[id]/route.ts`:

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
        riskScore: true,
        costObservations: {
          orderBy: { observationDate: "asc" },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Get volatility parameter used
    let volatilityParam = null;
    if (contract.pscCode) {
      volatilityParam = await prisma.volatilityParameter.findFirst({
        where: {
          OR: [
            { pscCode: contract.pscCode, agencyCode: contract.awardingAgency },
            { pscCode: contract.pscCode, agencyCode: null },
          ],
        },
        orderBy: { agencyCode: "desc" }, // Prefer agency-specific
      });
    }

    // Get similar contracts (same PSC) for comparison
    const similarContracts = await prisma.serviceContract.findMany({
      where: {
        pscCode: contract.pscCode,
        id: { not: contractId },
        riskScore: { isNot: null },
      },
      include: {
        riskScore: true,
      },
      orderBy: { riskScore: { riskScore: "desc" } },
      take: 5,
    });

    return NextResponse.json({
      contract: {
        id: contract.id,
        piid: contract.piid,
        vendorName: contract.vendorName,
        awardDescription: contract.awardDescription,
        obligatedAmount: contract.obligatedAmount ? Number(contract.obligatedAmount) : null,
        awardCeiling: contract.awardCeiling ? Number(contract.awardCeiling) : null,
        awardDate: contract.awardDate?.toISOString().split("T")[0] || null,
        periodOfPerformanceStart: contract.periodOfPerformanceStart?.toISOString().split("T")[0] || null,
        periodOfPerformanceEnd: contract.periodOfPerformanceEnd?.toISOString().split("T")[0] || null,
        pscCode: contract.pscCode,
        pscDescription: contract.pscDescription,
        naicsCode: contract.naicsCode,
        awardingAgency: contract.awardingAgency,
      },
      riskScore: contract.riskScore ? {
        riskScore: contract.riskScore.riskScore,
        currentRatio: Number(contract.riskScore.currentRatio),
        impliedVolatility: Number(contract.riskScore.impliedVolatility),
        lifecycleStage: contract.riskScore.lifecycleStage,
        lifecycleMultiplier: Number(contract.riskScore.lifecycleMultiplier),
        expectedCostLow: contract.riskScore.expectedCostLow ? Number(contract.riskScore.expectedCostLow) : null,
        expectedCostMid: contract.riskScore.expectedCostMid ? Number(contract.riskScore.expectedCostMid) : null,
        expectedCostHigh: contract.riskScore.expectedCostHigh ? Number(contract.riskScore.expectedCostHigh) : null,
        ceilingBreachProb: Number(contract.riskScore.ceilingBreachProb),
        monthsToWarning: contract.riskScore.monthsToWarning,
        confidenceLevel: contract.riskScore.confidenceLevel,
        calculatedAt: contract.riskScore.calculatedAt.toISOString(),
      } : null,
      observations: contract.costObservations.map((obs) => ({
        date: obs.observationDate.toISOString().split("T")[0],
        ceiling: Number(obs.ceilingValue),
        obligation: Number(obs.obligationValue),
        ratio: Number(obs.ratio),
      })),
      volatilityParameter: volatilityParam ? {
        pscCode: volatilityParam.pscCode,
        agencyCode: volatilityParam.agencyCode,
        sigma: Number(volatilityParam.sigma),
        observationCount: volatilityParam.observationCount,
        confidenceLevel: volatilityParam.confidenceLevel,
      } : null,
      similarContracts: similarContracts.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        riskScore: c.riskScore?.riskScore ?? null,
        breachProbability: c.riskScore?.ceilingBreachProb ? Number(c.riskScore.ceilingBreachProb) : null,
      })),
    });
  } catch (error) {
    console.error("Risk contract detail error:", error);
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
}
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add "src/app/api/risk/contracts/[id]/route.ts"
git commit -m "feat(risk): add contract detail API with observations and volatility param"
```

---

### Task 8: Create Risk Stats API

**Files:**
- Create: `src/app/api/risk/stats/route.ts`

**Step 1: Create directory**

Run: `mkdir -p src/app/api/risk/stats`
Expected: Directory created

**Step 2: Write the stats API**

Create `src/app/api/risk/stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Basic counts
    const [totalContracts, contractsWithScores] = await Promise.all([
      prisma.serviceContract.count({
        where: { awardCeiling: { gt: 0 } },
      }),
      prisma.contractRiskScore.count(),
    ]);

    // Confidence level distribution
    const confidenceDistribution = await prisma.contractRiskScore.groupBy({
      by: ["confidenceLevel"],
      _count: { id: true },
    });

    // Risk score distribution (buckets)
    const scoreDistribution = await prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
      SELECT
        CASE
          WHEN risk_score >= 80 THEN 'critical'
          WHEN risk_score >= 60 THEN 'high'
          WHEN risk_score >= 40 THEN 'medium'
          WHEN risk_score >= 20 THEN 'low'
          ELSE 'minimal'
        END as bucket,
        COUNT(*) as count
      FROM contract_risk_scores
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

    // Contracts with warning < 12 months
    const urgentWarnings = await prisma.contractRiskScore.count({
      where: {
        monthsToWarning: { not: null, lt: 12 },
      },
    });

    // Top 10 highest risk
    const topRisk = await prisma.serviceContract.findMany({
      where: {
        riskScore: { isNot: null },
      },
      include: {
        riskScore: true,
      },
      orderBy: {
        riskScore: { riskScore: "desc" },
      },
      take: 10,
    });

    // PSC categories with highest average volatility
    const topVolatilePSC = await prisma.volatilityParameter.findMany({
      where: {
        agencyCode: null, // Base parameters only
        confidenceLevel: { in: ["high", "medium"] },
      },
      orderBy: { sigma: "desc" },
      take: 5,
    });

    return NextResponse.json({
      overview: {
        totalContracts,
        contractsWithScores,
        urgentWarnings,
      },
      confidenceDistribution: confidenceDistribution.map((d) => ({
        level: d.confidenceLevel,
        count: d._count.id,
      })),
      scoreDistribution: scoreDistribution.map((d) => ({
        bucket: d.bucket,
        count: Number(d.count),
      })),
      topRisk: topRisk.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        riskScore: c.riskScore?.riskScore ?? null,
        breachProbability: c.riskScore?.ceilingBreachProb ? Number(c.riskScore.ceilingBreachProb) : null,
        monthsToWarning: c.riskScore?.monthsToWarning ?? null,
      })),
      topVolatilePSC: topVolatilePSC.map((p) => ({
        pscCode: p.pscCode,
        sigma: Number(p.sigma),
        observationCount: p.observationCount,
        confidenceLevel: p.confidenceLevel,
      })),
    });
  } catch (error) {
    console.error("Risk stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/risk/stats/route.ts
git commit -m "feat(risk): add dashboard stats API with score distribution and top risk"
```

---

### Task 9: Create Volatility Library API

**Files:**
- Create: `src/app/api/risk/volatility/route.ts`

**Step 1: Create directory**

Run: `mkdir -p src/app/api/risk/volatility`
Expected: Directory created

**Step 2: Write the volatility API**

Create `src/app/api/risk/volatility/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const pscCode = searchParams.get("psc");
    const agency = searchParams.get("agency");
    const minConfidence = searchParams.get("minConfidence");

    // Build where clause
    const where: Record<string, unknown> = {};

    if (pscCode) {
      where.pscCode = { startsWith: pscCode };
    }
    if (agency) {
      where.agencyCode = agency;
    }
    if (minConfidence) {
      const levels: Record<string, string[]> = {
        high: ["high"],
        medium: ["high", "medium"],
        low: ["high", "medium", "low"],
      };
      if (levels[minConfidence]) {
        where.confidenceLevel = { in: levels[minConfidence] };
      }
    }

    const parameters = await prisma.volatilityParameter.findMany({
      where,
      orderBy: [
        { sigma: "desc" },
        { observationCount: "desc" },
      ],
    });

    return NextResponse.json({
      parameters: parameters.map((p) => ({
        pscCode: p.pscCode,
        agencyCode: p.agencyCode,
        sigma: Number(p.sigma),
        sigmaPercent: `${(Number(p.sigma) * 100).toFixed(1)}%`,
        observationCount: p.observationCount,
        confidenceLevel: p.confidenceLevel,
        lastCalculated: p.lastCalculated.toISOString(),
      })),
      total: parameters.length,
    });
  } catch (error) {
    console.error("Volatility API error:", error);
    return NextResponse.json({ error: "Failed to fetch parameters" }, { status: 500 });
  }
}
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/risk/volatility/route.ts
git commit -m "feat(risk): add volatility parameter library API"
```

---

## Phase 4: Frontend

### Task 10: Create Risk Filter Bar Component

**Files:**
- Create: `src/components/RiskFilterBar.tsx`

**Step 1: Write the filter bar component**

Create `src/components/RiskFilterBar.tsx`:

```typescript
"use client";

import { useState } from "react";

export interface RiskFilters {
  psc?: string;
  agency?: string;
  minRiskScore?: number;
  maxRiskScore?: number;
  confidence?: string;
  lifecycle?: string;
}

interface RiskFilterBarProps {
  onFilterChange: (filters: RiskFilters) => void;
}

export function RiskFilterBar({ onFilterChange }: RiskFilterBarProps) {
  const [filters, setFilters] = useState<RiskFilters>({});

  const updateFilter = (key: keyof RiskFilters, value: string | number | undefined) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  const hasFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      {/* PSC Code */}
      <input
        type="text"
        placeholder="PSC Code"
        value={filters.psc || ""}
        onChange={(e) => updateFilter("psc", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-28"
      />

      {/* Agency */}
      <input
        type="text"
        placeholder="Agency"
        value={filters.agency || ""}
        onChange={(e) => updateFilter("agency", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-40"
      />

      {/* Risk Score Range */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="Min"
          value={filters.minRiskScore || ""}
          onChange={(e) => updateFilter("minRiskScore", e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-16"
          min={0}
          max={100}
        />
        <span className="text-zinc-500">-</span>
        <input
          type="number"
          placeholder="Max"
          value={filters.maxRiskScore || ""}
          onChange={(e) => updateFilter("maxRiskScore", e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-16"
          min={0}
          max={100}
        />
        <span className="text-xs text-zinc-500">score</span>
      </div>

      {/* Confidence Level */}
      <select
        value={filters.confidence || ""}
        onChange={(e) => updateFilter("confidence", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white"
      >
        <option value="">All Confidence</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Lifecycle Stage */}
      <select
        value={filters.lifecycle || ""}
        onChange={(e) => updateFilter("lifecycle", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white"
      >
        <option value="">All Stages</option>
        <option value="early">Early (0-25%)</option>
        <option value="mid">Mid (25-75%)</option>
        <option value="late">Late (75-100%)</option>
      </select>

      {/* Clear button */}
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Clear
        </button>
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
git add src/components/RiskFilterBar.tsx
git commit -m "feat(risk): add filter bar component for risk page"
```

---

### Task 11: Create Risk Contract Table Component

**Files:**
- Create: `src/components/RiskContractTable.tsx`

**Step 1: Write the table component**

Create `src/components/RiskContractTable.tsx`:

```typescript
"use client";

interface Contract {
  id: number;
  piid: string;
  vendorName: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  pscCode: string | null;
  awardingAgency: string | null;
  riskScore: number | null;
  currentRatio: number | null;
  breachProbability: number | null;
  monthsToWarning: number | null;
  lifecycleStage: number | null;
  confidenceLevel: string | null;
}

interface RiskContractTableProps {
  contracts: Contract[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onSelect: (id: number) => void;
  selectedId?: number;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

function getRiskColor(score: number | null): string {
  if (score === null) return "text-zinc-500";
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  if (score >= 20) return "text-green-400";
  return "text-green-600";
}

function getConfidenceStyle(level: string | null): string {
  switch (level) {
    case "high":
      return "opacity-100";
    case "medium":
      return "opacity-75";
    default:
      return "opacity-50";
  }
}

export function RiskContractTable({
  contracts,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
  selectedId,
}: RiskContractTableProps) {
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
    <table className="w-full">
      <thead className="bg-zinc-900/50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Vendor / Contract
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            PSC
          </th>
          <SortHeader column="obligatedAmount" label="Obligated" />
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Ratio
          </th>
          <SortHeader column="riskScore" label="Risk Score" />
          <SortHeader column="breachProbability" label="Breach %" />
          <SortHeader column="monthsToWarning" label="Warning" />
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Stage
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800">
        {contracts.map((contract) => (
          <tr
            key={contract.id}
            onClick={() => onSelect(contract.id)}
            className={`cursor-pointer hover:bg-zinc-900/50 transition-colors ${
              selectedId === contract.id ? "bg-zinc-900" : ""
            }`}
          >
            <td className="px-4 py-3">
              <div className="text-sm font-medium text-white truncate max-w-[200px]">
                {contract.vendorName || "Unknown"}
              </div>
              <div className="text-xs text-zinc-500 font-mono">{contract.piid}</div>
            </td>
            <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
              {contract.pscCode || "-"}
            </td>
            <td className="px-4 py-3 text-sm text-white font-mono">
              {contract.obligatedAmount ? formatCurrency(contract.obligatedAmount) : "-"}
            </td>
            <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
              {contract.currentRatio !== null
                ? `${(contract.currentRatio * 100).toFixed(0)}%`
                : "-"}
            </td>
            <td className={`px-4 py-3 text-sm font-mono font-bold ${getRiskColor(contract.riskScore)} ${getConfidenceStyle(contract.confidenceLevel)}`}>
              {contract.riskScore ?? "-"}
            </td>
            <td className={`px-4 py-3 text-sm font-mono ${
              contract.breachProbability !== null && contract.breachProbability > 50
                ? "text-red-400"
                : "text-zinc-400"
            }`}>
              {contract.breachProbability !== null
                ? `${contract.breachProbability.toFixed(0)}%`
                : "-"}
            </td>
            <td className={`px-4 py-3 text-sm font-mono ${
              contract.monthsToWarning !== null && contract.monthsToWarning < 12
                ? "text-orange-400"
                : "text-zinc-400"
            }`}>
              {contract.monthsToWarning !== null
                ? `${contract.monthsToWarning}mo`
                : "-"}
            </td>
            <td className="px-4 py-3">
              <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${contract.lifecycleStage || 0}%` }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/RiskContractTable.tsx
git commit -m "feat(risk): add contract table component with risk indicators"
```

---

### Task 12: Create Risk Contract Detail Component

**Files:**
- Create: `src/components/RiskContractDetail.tsx`

**Step 1: Write the detail component**

Create `src/components/RiskContractDetail.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";

interface ContractDetail {
  contract: {
    id: number;
    piid: string;
    vendorName: string | null;
    awardDescription: string | null;
    obligatedAmount: number | null;
    awardCeiling: number | null;
    awardDate: string | null;
    periodOfPerformanceStart: string | null;
    periodOfPerformanceEnd: string | null;
    pscCode: string | null;
    pscDescription: string | null;
    naicsCode: string | null;
    awardingAgency: string | null;
  };
  riskScore: {
    riskScore: number;
    currentRatio: number;
    impliedVolatility: number;
    lifecycleStage: number;
    lifecycleMultiplier: number;
    expectedCostLow: number | null;
    expectedCostMid: number | null;
    expectedCostHigh: number | null;
    ceilingBreachProb: number;
    monthsToWarning: number | null;
    confidenceLevel: string;
    calculatedAt: string;
  } | null;
  observations: Array<{
    date: string;
    ceiling: number;
    obligation: number;
    ratio: number;
  }>;
  volatilityParameter: {
    pscCode: string;
    agencyCode: string | null;
    sigma: number;
    observationCount: number;
    confidenceLevel: string;
  } | null;
  similarContracts: Array<{
    id: number;
    piid: string;
    vendorName: string | null;
    riskScore: number | null;
    breachProbability: number | null;
  }>;
}

interface RiskContractDetailProps {
  contractId: number | null;
  onClose: () => void;
  onSelectRelated: (id: number) => void;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

function getRiskColor(score: number): string {
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  if (score >= 20) return "text-green-400";
  return "text-green-600";
}

export function RiskContractDetail({
  contractId,
  onClose,
  onSelectRelated,
}: RiskContractDetailProps) {
  const [data, setData] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "comparison">("overview");

  useEffect(() => {
    if (!contractId) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch(`/api/risk/contracts/${contractId}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [contractId]);

  if (!contractId) return null;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-[500px] bg-zinc-950 border-l border-zinc-800 transform transition-transform duration-300 ${
        contractId ? "translate-x-0" : "translate-x-full"
      } overflow-hidden flex flex-col z-50`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-white">Contract Risk Detail</h2>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-500">Loading...</div>
        </div>
      ) : data ? (
        <>
          {/* Contract Header */}
          <div className="p-4 border-b border-zinc-800">
            <div className="text-white font-medium">{data.contract.vendorName || "Unknown Vendor"}</div>
            <div className="text-sm text-zinc-500 font-mono">{data.contract.piid}</div>
            {data.contract.awardDescription && (
              <div className="text-sm text-zinc-400 mt-2 line-clamp-2">
                {data.contract.awardDescription}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            {(["overview", "history", "comparison"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 text-sm capitalize ${
                  activeTab === tab
                    ? "text-white border-b-2 border-red-500"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "overview" && data.riskScore && (
              <>
                {/* Risk Score */}
                <div className="bg-zinc-900 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Risk Score</span>
                    <span className={`text-3xl font-bold ${getRiskColor(data.riskScore.riskScore)}`}>
                      {data.riskScore.riskScore}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Confidence: {data.riskScore.confidenceLevel}
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Current Ratio</div>
                    <div className="text-lg text-white font-mono">
                      {(data.riskScore.currentRatio * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Volatility (σ)</div>
                    <div className="text-lg text-white font-mono">
                      {(data.riskScore.impliedVolatility * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Breach Probability</div>
                    <div className={`text-lg font-mono ${
                      data.riskScore.ceilingBreachProb > 50 ? "text-red-400" : "text-white"
                    }`}>
                      {data.riskScore.ceilingBreachProb.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Warning In</div>
                    <div className={`text-lg font-mono ${
                      data.riskScore.monthsToWarning !== null && data.riskScore.monthsToWarning < 12
                        ? "text-orange-400"
                        : "text-white"
                    }`}>
                      {data.riskScore.monthsToWarning !== null
                        ? `${data.riskScore.monthsToWarning} mo`
                        : "N/A"}
                    </div>
                  </div>
                </div>

                {/* Expected Cost Range */}
                {data.riskScore.expectedCostLow && data.riskScore.expectedCostHigh && (
                  <div className="bg-zinc-900 rounded-lg p-4">
                    <div className="text-xs text-zinc-500 mb-2">Expected Cost at Completion</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400">
                        {formatCurrency(data.riskScore.expectedCostLow)}
                      </span>
                      <span className="text-white font-medium">
                        {data.riskScore.expectedCostMid && formatCurrency(data.riskScore.expectedCostMid)}
                      </span>
                      <span className="text-red-400">
                        {formatCurrency(data.riskScore.expectedCostHigh)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                      <span>10th %ile</span>
                      <span>50th %ile</span>
                      <span>90th %ile</span>
                    </div>
                  </div>
                )}

                {/* Lifecycle */}
                <div className="bg-zinc-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">Lifecycle Stage</span>
                    <span className="text-sm text-white">{data.riskScore.lifecycleStage}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${data.riskScore.lifecycleStage}%` }}
                    />
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">
                    Multiplier: {data.riskScore.lifecycleMultiplier.toFixed(2)}x
                  </div>
                </div>
              </>
            )}

            {activeTab === "history" && (
              <>
                <div className="text-sm text-zinc-400 mb-2">
                  Ceiling-to-Obligation Ratio Over Time
                </div>
                {data.observations.length > 0 ? (
                  <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
                    {data.observations.map((obs, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500 font-mono">{obs.date}</span>
                        <span className="text-white font-mono">
                          {(obs.ratio * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">No observations recorded</div>
                )}

                {data.volatilityParameter && (
                  <div className="bg-zinc-900 rounded-lg p-4 mt-4">
                    <div className="text-xs text-zinc-500 mb-2">Applied Volatility Parameter</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">PSC:</span>
                        <span className="text-white font-mono">{data.volatilityParameter.pscCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">σ:</span>
                        <span className="text-white font-mono">
                          {(data.volatilityParameter.sigma * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Based on:</span>
                        <span className="text-white">{data.volatilityParameter.observationCount} contracts</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Confidence:</span>
                        <span className="text-white capitalize">{data.volatilityParameter.confidenceLevel}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "comparison" && (
              <>
                <div className="text-sm text-zinc-400 mb-2">
                  Similar Contracts (Same PSC)
                </div>
                {data.similarContracts.length > 0 ? (
                  <div className="space-y-2">
                    {data.similarContracts.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => onSelectRelated(c.id)}
                        className="bg-zinc-900 rounded-lg p-3 cursor-pointer hover:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-white">{c.vendorName || "Unknown"}</div>
                            <div className="text-xs text-zinc-500 font-mono">{c.piid}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${getRiskColor(c.riskScore || 0)}`}>
                              {c.riskScore ?? "-"}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {c.breachProbability?.toFixed(0)}% breach
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">No similar contracts found</div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-500">Failed to load contract</div>
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
git add src/components/RiskContractDetail.tsx
git commit -m "feat(risk): add contract detail drawer with overview, history, and comparison tabs"
```

---

### Task 13: Create Risk Page

**Files:**
- Create: `src/app/risk/page.tsx`

**Step 1: Write the risk page**

Create `src/app/risk/page.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { NavTabs } from "@/components/NavTabs";
import { Pagination } from "@/components/Pagination";
import { RiskFilterBar, RiskFilters } from "@/components/RiskFilterBar";
import { RiskContractTable } from "@/components/RiskContractTable";
import { RiskContractDetail } from "@/components/RiskContractDetail";

interface Contract {
  id: number;
  piid: string;
  vendorName: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  pscCode: string | null;
  awardingAgency: string | null;
  riskScore: number | null;
  currentRatio: number | null;
  breachProbability: number | null;
  monthsToWarning: number | null;
  lifecycleStage: number | null;
  confidenceLevel: string | null;
}

interface Stats {
  overview: {
    totalContracts: number;
    contractsWithScores: number;
    urgentWarnings: number;
  };
  scoreDistribution: Array<{ bucket: string; count: number }>;
  confidenceDistribution: Array<{ level: string; count: number }>;
}

export default function RiskPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<RiskFilters>({});
  const [sortBy, setSortBy] = useState("riskScore");
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

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });

    try {
      const res = await fetch(`/api/risk/contracts?${params}`);
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
      const res = await fetch("/api/risk/stats");
      if (!res.ok) return;
      const data = await res.json();
      if (data.overview) {
        setStats(data);
      }
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

  const handleFilterChange = (newFilters: RiskFilters) => {
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
              <span className="text-zinc-400">Cost Risk Model</span>
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
                <span className="text-white ml-2 font-mono">
                  {stats.overview.totalContracts.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Scored:</span>
                <span className="text-white ml-2 font-mono">
                  {stats.overview.contractsWithScores.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Urgent Warnings:</span>
                <span className="text-orange-400 ml-2 font-mono">
                  {stats.overview.urgentWarnings}
                </span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4">
                {stats.scoreDistribution.map((d) => (
                  <div key={d.bucket} className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        d.bucket === "critical"
                          ? "bg-red-500"
                          : d.bucket === "high"
                          ? "bg-orange-500"
                          : d.bucket === "medium"
                          ? "bg-yellow-500"
                          : d.bucket === "low"
                          ? "bg-green-500"
                          : "bg-zinc-500"
                      }`}
                    />
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
          <RiskFilterBar onFilterChange={handleFilterChange} />

          {/* Results info */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {loading ? "Loading..." : `${total.toLocaleString()} contracts with risk scores`}
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <RiskContractTable
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
              page={page}
              totalPages={totalPages}
              total={total}
              limit={50}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>

      {/* Detail Drawer */}
      <RiskContractDetail
        contractId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelectRelated={setSelectedId}
      />
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with /risk route

**Step 3: Commit**

```bash
git add src/app/risk/page.tsx
git commit -m "feat(risk): add main risk page with stats, filters, table, and detail drawer"
```

---

### Task 14: Add Risk Tab to Navigation

**Files:**
- Modify: `src/components/NavTabs.tsx`

**Step 1: Read current NavTabs**

Read the file to see current structure.

**Step 2: Add Risk tab**

Add a new Link for "/risk" with label "Risk" in the navigation tabs array, positioned after "Waste".

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/NavTabs.tsx
git commit -m "feat(risk): add Risk tab to navigation"
```

---

## Final Steps

### Task 15: Run Full Build and Test

**Step 1: Run production build**

Run: `npm run build`
Expected: All routes build successfully

**Step 2: Verify all new routes appear**

Check output includes:
- `/api/risk/contracts`
- `/api/risk/contracts/[id]`
- `/api/risk/stats`
- `/api/risk/volatility`
- `/risk`

**Step 3: Commit any remaining changes**

```bash
git status
git add -A
git commit -m "chore: finalize risk model implementation"
```

---

## Summary

This plan implements:

1. **Data Foundation (Tasks 1-3)**
   - Prisma models for volatility parameters, risk scores, and observations
   - Observation extractor from modification history
   - Volatility calculator with PSC aggregation

2. **Risk Scoring (Tasks 4-5)**
   - Black-Scholes-inspired risk calculator
   - Data sync script for batch processing

3. **API Layer (Tasks 6-9)**
   - Contract list with risk filtering
   - Contract detail with observations and volatility
   - Dashboard stats
   - Volatility library endpoint

4. **Frontend (Tasks 10-14)**
   - Filter bar with confidence and lifecycle filters
   - Contract table with risk indicators
   - Detail drawer with overview/history/comparison tabs
   - Main /risk page
   - Navigation tab

5. **Final (Task 15)**
   - Full build verification
