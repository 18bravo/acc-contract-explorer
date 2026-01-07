# Contract Waste Screener Design

**Date:** 2026-01-07
**Status:** Approved for implementation

## Problem Statement

There are a vast number of wasteful services contracts in DoD. We need a way to use publicly available data from SAM.gov and USASpending.gov to identify wasteful contracts and trace them back to the responsible organizations, contracting officers, and vendors—enabling informed decisions about contract cancellation or restructuring.

## Mental Model

A **trading terminal for contract divestment**: scan the market (all DoD services contracts), run screens/filters to surface candidates, drill into details, and execute trades (recommend cancellation/restructure).

## Approach

**Phase 1: Anomaly-First Screener**
Build a scoring system that flags contracts based on waste signals, then let users drill down. Focuses attention on highest-value targets.

**Phase 2: Org/Vendor Network Explorer**
Add capability to explore by organization hierarchy or vendor portfolio to find systemic patterns.

## Scope

**In Scope:**
- Labor/services contracts (NAICS 541, 561, 518 families + user-defined)
- DoD agencies only
- Public data sources (USASpending, SAM.gov, FPDS)
- First-tier subcontractor data

**Out of Scope (for now):**
- Grants, direct payments, loans
- Non-DoD agencies
- Internal DoD systems (CPAR, etc.)
- Sub-tier subcontractors beyond first tier

---

## Data Model

### New Tables

| Table | Purpose |
|-------|---------|
| `ServiceContract` | Core contract data (PIID, description, dates, values, NAICS, PSC) |
| `ContractModification` | History of mods with amounts and dates |
| `Subaward` | First-tier subcontractor awards linked to parent contract |
| `WasteScore` | Calculated scores per contract (one row per contract, columns for each signal) |
| `Organization` | DoD hierarchy (agency → command → office) for drill-down |

### Relationships

- `ServiceContract` → many `ContractModification`
- `ServiceContract` → many `Subaward`
- `ServiceContract` → one `WasteScore`
- `ServiceContract` → one `Organization` (contracting office)
- `ServiceContract` → one `Vendor`

---

## Waste Score Calculation

Each contract receives a `WasteScore` row with these fields:

| Field | Calculation | Flag Threshold |
|-------|-------------|----------------|
| `costGrowthPct` | (currentValue - baseValue) / baseValue × 100 | > 50% |
| `ceilingUtilization` | obligatedAmount / awardCeiling × 100 | < 20% (underutilized) |
| `contractAgeDays` | today - awardDate | > 5 years |
| `modificationCount` | count of modifications | > 20 mods |
| `passThruRatio` | subawardTotal / obligatedAmount × 100 | > 70% |
| `vendorConcentration` | count of contracts same vendor has in same org | > 5 contracts |
| `duplicateRisk` | similarity score to other contracts in same org (0-100) | > 80 |
| `impliedHourlyRate` | obligatedAmount / estimatedHours (when derivable) | > $250/hr |
| `overallScore` | weighted composite of above signals (0-100) | sortable |

### Scoring Schedule

- On initial data load
- After daily sync (recalculate affected contracts)
- Vendor concentration + duplicate risk recalculated in batch

---

## User Interface

### View 1: Screener (Default Landing)

- **Filter bar:** NAICS, PSC, agency, date range, min contract value, custom NAICS input
- **Results table columns:** Contractor, Description, Obligated, Ceiling, Overall Score, top 2-3 signal flags
- **Sort:** Any column (default: overall score descending)
- **Toggle:** Individual contracts vs. contract families (grouped by parent IDV)
- **Action:** Click row → opens detail view

### View 2: Contract Detail (Drill-Down)

| Section | Content |
|---------|---------|
| Contract Overview | PIID, description, dates, values, type, ceiling vs. obligated |
| Waste Signals | Each score with visual indicator (green/yellow/red) |
| Timeline | Modification history as a chart—when did costs balloon? |
| Organization | Contracting office, funding agency, DoD hierarchy |
| Vendor Profile | Name, UEI, link to their other contracts |
| Subcontractors | First-tier subs, amounts, pass-through breakdown |
| Related Contracts | Similar work in same org + same vendor's other awards |

### View 3: Vendor/Org Explorer (Phase 2)

- Browse by organization hierarchy or vendor
- Aggregate stats and patterns

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/waste/contracts` | Screener results—paginated, filterable, sortable |
| `GET /api/waste/contracts/[id]` | Single contract detail with all scores and related data |
| `GET /api/waste/contracts/[id]/modifications` | Modification history for timeline |
| `GET /api/waste/contracts/[id]/subawards` | Subcontractor list |
| `GET /api/waste/contracts/[id]/related` | Similar contracts in same org + same vendor's other awards |
| `GET /api/waste/vendors/[uei]` | Vendor profile with all their contracts |
| `GET /api/waste/orgs/[id]` | Organization profile with aggregate stats |
| `GET /api/waste/search` | On-demand USASpending API search for contracts not in warehouse |
| `POST /api/waste/sync` | Trigger daily data sync (or called by cron) |
| `GET /api/waste/stats` | Dashboard stats (total contracts, flagged count, top offenders) |

---

## Data Pipeline

### Initial Load

1. Bulk download from USASpending (awards + subawards for target NAICS codes, DoD only)
2. Parse and load into `ServiceContract`, `Subaward`, `Organization` tables
3. Fetch modification history from FPDS for each contract
4. Run waste score calculation for all contracts

### Daily Sync

1. Query USASpending API for awards modified since last sync
2. Upsert new/changed contracts
3. Fetch any new modifications
4. Recalculate waste scores for affected contracts
5. Recalculate vendor concentration + duplicate risk in batch

### On-Demand Search

1. User searches for something not in warehouse
2. Hit USASpending API with their query
3. Return results with basic info (no waste scores yet)
4. Option to "Add to tracking" → ingests into warehouse and calculates scores

---

## Future Enhancements (Phase 2+)

- **Saved searches & watchlists:** Save filter configurations, bookmark contracts
- **Action tracking:** Mark contracts as "under review" / "recommended for cancellation" / "cleared"
- **Org/Vendor explorer:** Browse by hierarchy, find systemic patterns
- **Internal data integration:** CPAR performance data, org directories (requires access)

---

## Technical Notes

- Reuses existing PostgreSQL + Prisma setup
- Follows same hybrid pattern as contract explorer (warehouse + on-demand API)
- NAICS families: 541 (Professional Services), 561 (Admin Support), 518 (Data Processing)
- Subcontractor data via USASpending subaward endpoints (FSRS data, now on SAM.gov)
