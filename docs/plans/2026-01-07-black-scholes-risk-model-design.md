# Black-Scholes Cost Risk Model for Government Contracts

**Date:** 2026-01-07
**Status:** Approved

## Overview

Apply option pricing theory to government contract cost uncertainty. Instead of treating contracts as fixed-price commitments, model them as assets with volatility - the ceiling-to-obligation ratio is the "price" that fluctuates over time.

The system derives volatility parameters from USASpending modification history, segments by PSC code (with agency as secondary factor), and produces layered outputs: risk scores for triage, probability distributions for analysis, and timeline warnings for POM planning.

## Core Concept

**Key insight:** The ratio of current obligations to contract ceiling, tracked over time, reveals how fast a contract consumes its headroom. Contracts that burn ceiling faster than expected (high volatility) are more likely to require cost increases.

**Volatility parameter (σ):** Calculated as the annualized standard deviation of percentage changes in the ceiling-to-obligation ratio. Each contract modification that changes either value creates an observation. Segmented by PSC code primarily, with agency as a secondary factor when data supports it.

**Lifecycle adjustment:** Raw volatility is modified by contract completion percentage. Early-stage contracts (< 25% complete) receive a volatility multiplier reflecting inherent uncertainty. Mature contracts (> 75% complete) have more stable trajectories.

**Confidence scoring:** Each volatility parameter carries a confidence level based on observation count for that PSC/agency combination. Categories with 50+ historical contracts get "high confidence." Sparse categories show "estimated" with wider uncertainty bands.

## Data Model

### VolatilityParameter

The library of historical volatility values.

| Field | Type | Description |
|-------|------|-------------|
| psc_code | String | Primary segmentation key |
| agency_code | String? | Secondary factor (nullable, for agency-specific overrides) |
| sigma | Decimal | Annualized volatility (e.g., 0.25 = 25%) |
| observation_count | Int | Number of contracts used to calculate |
| confidence_level | Enum | "high" (50+), "medium" (20-49), "low" (<20) |
| last_calculated | DateTime | Timestamp for freshness tracking |

### ContractRiskScore

Computed risk for each active contract.

| Field | Type | Description |
|-------|------|-------------|
| contract_id | String | Foreign key to existing contract data |
| current_ratio | Decimal | Current ceiling-to-obligation ratio |
| implied_volatility | Decimal | σ applied (from parameter library) |
| lifecycle_stage | Int | Percentage complete (0-100) |
| lifecycle_multiplier | Decimal | Adjustment factor based on stage |
| risk_score | Int | Overall 0-100 score for quick triage |
| expected_cost_low | Decimal | Lower bound of confidence interval |
| expected_cost_high | Decimal | Upper bound of confidence interval |
| ceiling_breach_probability | Decimal | Probability of exceeding current ceiling |
| months_to_warning | Int? | Projected months until likely ceiling breach |

### ContractCostObservation

Raw time series for volatility calculation.

| Field | Type | Description |
|-------|------|-------------|
| contract_id | String | Which contract |
| observation_date | DateTime | When the change occurred |
| ceiling_value | Decimal | Contract ceiling at observation |
| obligation_value | Decimal | Total obligations at observation |
| ratio | Decimal | Calculated ratio at that point |

## Volatility Calculation Pipeline

### Historical Analysis (Batch Job)

1. **Pull modification history** - For each completed contract in USASpending, fetch all modifications ordered by date. Each modification with ceiling or obligation change becomes a ContractCostObservation.

2. **Calculate per-contract volatility** - For contracts with 3+ observations, compute the standard deviation of percentage changes in the ratio between consecutive observations. Annualize based on time gaps between observations.

3. **Aggregate by segment** - Group completed contracts by PSC code. Calculate weighted average volatility (weighted by contract size). For PSC/agency combinations with 20+ contracts, store agency-specific parameter.

4. **Assign confidence levels** - Tag each parameter with confidence based on observation count. Store in VolatilityParameter table.

### Ongoing Updates

- New contract modifications trigger ContractCostObservation inserts
- Nightly job recalculates VolatilityParameter values as new contracts complete
- Active contracts get ContractRiskScore recalculated when their observations update or volatility parameters change

### Initial Data Load

Focus on DoD contracts (agency codes starting with "97") in services/R&D PSC categories. This aligns with waste screener scope and provides the most relevant data for defense acquisition planning.

## Risk Score Calculation

### Risk Score (0-100)

Combines multiple factors into a single sortable value:
- Base score from volatility percentile (σ compared to all contracts)
- Lifecycle multiplier (early stage = higher risk)
- Current ratio position (already at 80% ceiling utilization = elevated risk)
- Weighted combination, normalized to 0-100

### Probability Distribution

Using Black-Scholes-style projection:
- Current ratio as "spot price"
- Volatility parameter (σ) for the contract's PSC/agency
- Time remaining on period of performance
- Output: Expected final ratio at contract end with confidence bands (10th/50th/90th percentile)

### Ceiling Breach Probability

Likelihood the contract exceeds 100% ceiling utilization before completion. Derived from the distribution - the area of the probability curve above 100%.

### Months to Warning

If breach probability > 50%, project when the expected ratio trajectory crosses a warning threshold (e.g., 90% utilization). This is the POM planning signal - "expect to need additional funding in X months."

### Confidence Display

All metrics shown with confidence indicator based on the underlying volatility parameter quality. Low-confidence scores display with visual cues (muted colors, uncertainty bands, "estimated" label).

## API Endpoints

### GET /api/risk/contracts

Paginated list of contracts with risk scores.

**Query params:**
- `sortBy`: riskScore, breachProbability, monthsToWarning, obligatedAmount
- `sortOrder`: asc, desc
- `page`, `limit`: Pagination
- `psc`, `agency`: Filter by code
- `minRiskScore`, `maxRiskScore`: Score range
- `confidenceLevel`: high, medium, low, all
- `lifecycleStage`: early, mid, late

**Returns:** Contract summary with risk score, breach probability, months to warning, confidence level

### GET /api/risk/contracts/[id]

Detailed risk view for single contract.

**Returns:**
- Full risk score breakdown
- Probability distribution (percentiles)
- Observation history
- Applied volatility parameter with confidence
- Comparable contracts in same PSC

### GET /api/risk/stats

Dashboard overview.

**Returns:**
- Total contracts scored
- Distribution by risk level (critical/high/medium/low)
- Count by confidence level
- Top 10 highest risk contracts
- PSC categories with highest average volatility

### GET /api/risk/volatility

Volatility parameter library.

**Query params:** `psc`, `agency`, `minConfidence`

**Returns:** List of volatility parameters with observation counts

### POST /api/risk/sync

Trigger data sync (admin). Fetches new modifications from USASpending, recalculates observations and scores.

## User Interface

### Main /risk Page Layout

**Stats bar (top):**
- Total contracts analyzed
- Breakdown by risk level (critical/high/medium/low)
- Average confidence level
- Contracts with ceiling breach warning < 12 months

**Filter bar:**
- PSC category
- Agency
- Risk score range
- Confidence level (high/medium/low/all)
- Lifecycle stage (early/mid/late)
- Breach warning timeframe

**Contract table:**
- Columns: Vendor, Contract ID, PSC, Agency, Obligated Amount, Ceiling, Current Ratio, Risk Score, Breach Probability, Months to Warning, Confidence
- Sortable by risk score, breach probability, months to warning, amount
- Risk score cell: color gradient (green-yellow-red) with confidence indicator (solid = high, hatched = medium, outline = low)
- Row click opens detail drawer

### Detail Drawer

**Overview tab:**
- Risk score breakdown showing each factor's contribution
- Probability distribution chart (bell curve with percentile markers)
- Ceiling breach probability gauge

**History tab:**
- Time series chart of ceiling-to-obligation ratio over contract life
- Modification events marked on timeline

**Comparison tab:**
- Similar contracts in same PSC showing historical outcomes
- Applied volatility parameter with observation count

**Timeline tab:**
- Projected ratio trajectory with confidence bands
- Warning threshold line
- POM-relevant dates highlighted

## Implementation Phases

### Phase 1: Data Foundation
- Add Prisma models for VolatilityParameter, ContractRiskScore, ContractCostObservation
- Create USASpending modification history fetcher (extend existing client)
- Build observation extraction pipeline

### Phase 2: Volatility Calculation
- Implement per-contract volatility calculation from observations
- Build aggregation logic for PSC/agency segmentation
- Create confidence level assignment
- Run initial historical analysis on DoD contracts

### Phase 3: Risk Scoring
- Implement risk score calculation with lifecycle adjustments
- Build probability distribution projection
- Calculate breach probability and months-to-warning
- Create scoring job for active contracts

### Phase 4: API Layer
- Implement all four API endpoints
- Add sync endpoint for manual refresh
- Include confidence metadata in all responses

### Phase 5: Frontend
- Build /risk page with stats bar, filters, table
- Create detail drawer with all four tabs
- Add visualization components (distribution chart, timeline, ratio history)
- Implement confidence-aware styling

## Data Scope

Start with DoD services contracts (same scope as waste screener) to leverage existing data pipeline.
