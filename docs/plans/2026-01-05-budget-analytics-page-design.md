# Budget Analytics Page Design

**Date:** 2026-01-05
**Status:** Approved

## Overview

Create a dedicated Budget Analytics page with full dashboard capabilities, matching the feature richness of platforms like Obviant. The page will serve both business development (identifying opportunities) and policy/research (tracking trends) use cases.

## Navigation

- Add top navigation tabs to header: "Contracts" | "Budget"
- Routes: `/` (contracts), `/budget` (budget analytics)
- Active tab highlighted with red underline
- Remove BudgetAnalytics widget from main contracts page (clean separation)

## Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo | Contract Explorer | [Contracts] [Budget] │
├─────────────────────────────────────────────────────────┤
│  Filter Bar (sticky): FY | Agency | Service | Approp | Search │
├─────────────────────────────────────────────────────────┤
│  Summary Stats Row (4 cards)                             │
├─────────────────────────────────────────────────────────┤
│  Charts Section (2-column grid)                          │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │ Trend Line Chart│  │ Agency Bar Chart │               │
│  └─────────────────┘  └─────────────────┘               │
├─────────────────────────────────────────────────────────┤
│  Movers Section (3-column: Gainers | Losers | New)       │
├─────────────────────────────────────────────────────────┤
│  Full Program Table (searchable, sortable, paginated)    │
└─────────────────────────────────────────────────────────┘
```

## Filter Bar

**Components:**
- Fiscal Year: Multi-select chips (FY24, FY25, FY26) - default latest
- Agency: Dropdown with search
- Service: Dropdown (Army, Navy, Air Force, etc.)
- Appropriation Type: Multi-select (RDT&E, Procurement, O&M)
- Program Search: Text input for program element or name
- Clear Filters: Button (appears when filters active)

**URL State Sync:**
All filters persist to URL query params:
```
/budget?fy=2026&agency=DISA&approp=RDT%26E&q=cyber
```

Real-time updates (300ms debounce for text). Browser back/forward works.

## Summary Stats

| Card | Value | Subtitle |
|------|-------|----------|
| Total Programs | Count matching filters | "Programs in view" |
| Total Budget | Sum of budget year requests | "FY26 Request" |
| Avg YoY Change | Percentage | "Year-over-year" |
| Net Change | Dollar amount (+/-) | "vs. prior year" |

## Charts Section

**Left: Multi-Year Trend Line Chart**
- X-axis: Fiscal years (FY22-FY26 + outyears)
- Y-axis: Total budget in billions
- Toggle by appropriation type or aggregate
- Tooltip with exact values

**Right: Agency/Service Bar Chart**
- Horizontal bars by agency/service
- Sorted by amount descending
- Click to filter table below

## Movers Section

Three side-by-side cards (top 5 each):

| Top Gainers | Top Losers | New Programs |
|-------------|------------|--------------|
| Program + Agency | Program + Agency | Program + Agency |
| +XX% / +$XXM | -XX% / -$XXM | $XXM (NEW) |

"View All" links filter the table. Row click jumps to program.

## Program Table

**Columns:**
- Program Element (sortable)
- Program Name (searchable)
- Agency
- Appropriation Type
- FY25 Enacted
- FY26 Request
- Change ($)
- Change (%)
- Trend (↑ ↓ → NEW END)

**Features:**
- Sort by any column
- Pagination (50 per page)
- Row expand for narrative/description
- Export to CSV

## Technical Implementation

### New Files

**Pages:**
- `src/app/budget/page.tsx` - Main budget analytics page

**Components:**
- `src/components/NavTabs.tsx` - Shared header navigation
- `src/components/BudgetFilterBar.tsx` - Filter controls with URL sync
- `src/components/BudgetTrendChart.tsx` - Recharts line chart
- `src/components/AgencyBarChart.tsx` - Recharts horizontal bar chart
- `src/components/BudgetMoversCards.tsx` - 3-column movers display
- `src/components/BudgetProgramTable.tsx` - Sortable/paginated table

**API Routes:**
- `src/app/api/budget/programs/route.ts` - Paginated, filterable program list
- `src/app/api/budget/summary/route.ts` - Aggregate stats for filters
- `src/app/api/budget/chart-data/route.ts` - Time series for charts

### Modified Files

- `src/app/page.tsx` - Remove BudgetAnalytics import and component
- Header/layout - Add NavTabs component

### Dependencies

```bash
npm install recharts
```

### Cleanup

- Delete `src/components/BudgetAnalytics.tsx`

## Data Flow

1. User lands on `/budget` or navigates via tab
2. URL params parsed into filter state
3. Parallel API calls fetch summary, chart data, movers, programs
4. Filter changes update URL and trigger refetch
5. Chart clicks and mover clicks update filters
