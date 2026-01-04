# Budget Analytics Platform Design

## Overview

A budget intelligence platform that crawls DoD budget justification documents from FY2015-2026, extracts structured data and narrative context, and presents it through an opportunities-focused analytics dashboard.

**Target Users:**
- Defense contractors and BD teams (capture strategy, opportunity identification)
- Government analysts and program managers (program tracking, comparative analysis)

**Primary Value Proposition:**
"What's hot/cold" dashboard showing biggest YoY budget increases/decreases, new programs, and terminated programs - enabling users to identify opportunities before competitors.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  PDF Crawlers   │────▶│  Parsing Pipeline │────▶│  PostgreSQL │
│  (Node.js)      │     │  (Tables + GPT-5) │     │             │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                              ┌─────────────────────────┼─────────────────────────┐
                              │                         │                         │
                        ┌─────▼─────┐            ┌──────▼──────┐           ┌──────▼──────┐
                        │  Grafana   │            │  Next.js    │           │  Next.js    │
                        │ (Power     │            │ (Self-Svc   │           │ (Contract   │
                        │ Dashboards)│            │  Reports)   │           │  Search)    │
                        └───────────┘            └─────────────┘           └─────────────┘
```

**Key Components:**
- Shared PostgreSQL database for budget data and existing contract data
- Grafana for pre-built power dashboards
- Custom Next.js UI for self-service report builder, watchlists, and alerts
- Existing Next.js contract search remains independent (potential future linking)

## Data Sources

### DoD-Wide
| Source | URL | Coverage |
|--------|-----|----------|
| OSD Comptroller | comptroller.defense.gov/Budget-Materials/ | Master DoD budgets, all appropriations |
| CAPE | cape.osd.mil (SNAPIT portal) | Analysis docs, selected agency data |
| Congress | congress.gov, appropriations.house.gov | Congressional markups and enacted |

### Military Services
| Service | URL |
|---------|-----|
| Army | asafm.army.mil/Budget-Materials/ |
| Navy/Marines | secnav.navy.mil/fmc/fmb/ |
| Air Force | saffm.hq.af.mil/FM-Resources/Budget/ |
| Space Force | (separated from AF, FY2020+) |

### Defense Agencies
- DARPA, MDA, DISA, DLA, DCAA, DCMA, DHA, DTRA, NGA, NSA (unclassified portions)

### Service Labs & Commands
- NRL, AFRL, ARL (research labs)
- ONR, AFOSR, ARO (research offices)
- NAVAIR, NAVSEA, NAVWAR
- Army PEOs, AFC (Army Futures Command)

### Other
- SOCOM, TRANSCOM, CYBERCOM (where public)
- DOE/NNSA (nuclear weapons, overlaps with DoD)

**Document Types:**
- President's Budget submissions
- Congressional Budget Justifications
- R-1/R-2 exhibits (RDT&E)
- P-1/P-40 exhibits (Procurement)
- O-1 exhibits (O&M)
- Budget justification narratives

**Historical Coverage:** FY2015-FY2026 (~10+ years)

## Data Model

```sql
-- Budget line items (core table)
CREATE TABLE budget_line_items (
  id SERIAL PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  appropriation_type VARCHAR(50) NOT NULL,  -- RDT&E, Procurement, O&M
  agency VARCHAR(100),
  service VARCHAR(50),
  program_element VARCHAR(20),
  line_item_number VARCHAR(20),
  program_name TEXT,
  prior_year_actual DECIMAL(15,2),
  current_year_enacted DECIMAL(15,2),
  budget_year_request DECIMAL(15,2),
  outyear_1 DECIMAL(15,2),
  outyear_2 DECIMAL(15,2),
  outyear_3 DECIMAL(15,2),
  outyear_4 DECIMAL(15,2),
  outyear_5 DECIMAL(15,2),
  source_document_url TEXT,
  extracted_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(fiscal_year, program_element, line_item_number, agency)
);

-- Narrative context from AI parsing
CREATE TABLE budget_narratives (
  id SERIAL PRIMARY KEY,
  line_item_id INTEGER REFERENCES budget_line_items(id),
  narrative_type VARCHAR(50),  -- mission, accomplishments, changes
  content TEXT,
  ai_summary TEXT,
  extracted_at TIMESTAMP DEFAULT NOW()
);

-- Document tracking
CREATE TABLE budget_documents (
  id SERIAL PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  agency VARCHAR(100),
  document_type VARCHAR(50),
  url TEXT NOT NULL,
  filename VARCHAR(255),
  file_hash VARCHAR(64),
  crawled_at TIMESTAMP,
  parsed_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, downloaded, parsed, failed
  error_message TEXT
);

-- Pre-computed trends (for fast Grafana queries)
CREATE TABLE budget_trends (
  id SERIAL PRIMARY KEY,
  program_element VARCHAR(20),
  program_name TEXT,
  fiscal_year INTEGER,
  agency VARCHAR(100),
  appropriation_type VARCHAR(50),
  amount DECIMAL(15,2),
  yoy_change_dollars DECIMAL(15,2),
  yoy_change_percent DECIMAL(8,2),
  five_year_cagr DECIMAL(8,2),
  trend_direction VARCHAR(10),  -- up, down, flat, new, terminated

  UNIQUE(program_element, fiscal_year, agency, appropriation_type)
);

-- Indexes for Grafana performance
CREATE INDEX idx_line_items_fy ON budget_line_items(fiscal_year);
CREATE INDEX idx_line_items_agency ON budget_line_items(agency);
CREATE INDEX idx_line_items_pe ON budget_line_items(program_element);
CREATE INDEX idx_trends_direction ON budget_trends(trend_direction, fiscal_year);
CREATE INDEX idx_trends_yoy ON budget_trends(yoy_change_percent DESC);
```

## Crawling Pipeline

### Directory Structure
```
src/lib/budget/
  ├── crawler/
  │   ├── sources.ts        -- URL patterns for each agency/year
  │   ├── discovery.ts      -- Find all PDFs for a fiscal year
  │   ├── downloader.ts     -- Fetch and store PDFs locally
  │   └── scheduler.ts      -- Queue management, rate limiting
  ├── parser/
  │   ├── table-extractor.ts    -- pdf-parse + tabula for exhibits
  │   ├── ai-narrator.ts        -- GPT-5 for narrative sections
  │   └── normalizer.ts         -- Standardize across agencies
  └── loader/
      ├── db-writer.ts      -- Prisma inserts
      └── trend-calculator.ts   -- Compute YoY changes
```

### Crawl Behavior
- Rate limiting: 1 request/second per domain
- Store raw PDFs locally in `data/budget-pdfs/{fy}/{agency}/`
- Track document status: discovered → downloaded → parsed → loaded
- Incremental: detect new/changed documents via URL patterns and file hashes
- Retry failed downloads with exponential backoff

### URL Patterns
Comptroller site follows predictable structure:
```
comptroller.defense.gov/Portals/45/Documents/defbudget/FY{YEAR}/budget_justification/pdfs/
  ├── 01_Operation_and_Maintenance/
  ├── 02_Procurement/
  ├── 03_RDT_and_E/
  └── ...
```

## Parsing Pipeline

### Stage 1: Table Extraction
Extract structured data from budget exhibits (R-1, R-2, P-1, etc.):
- `pdf-parse` or `pdfjs-dist` for text extraction
- `tabula-js` for table detection
- Custom regex patterns for exhibit-specific formats

### Stage 2: AI Parsing (GPT-5)
For narrative sections and complex layouts:
```typescript
const prompt = `
Extract budget data from this DoD justification document section.
Return JSON with:
- program_element: string (e.g., "0602702E")
- program_name: string
- amounts: { fy2024: number, fy2025: number, fy2026: number, ... }
- mission_description: string (1-2 sentences)
- key_changes: string[] (significant YoY changes mentioned)
- related_programs: string[] (any cross-references)
`;
```

### Stage 3: Validation & Normalization
- Cross-check AI extractions against table extractions
- Flag discrepancies for manual review queue
- Normalize agency names, program elements across fiscal years
- Handle program renumbers/mergers (track PE number changes over time)

## Grafana Dashboards

### Dashboard 1: "What's Hot/Cold" (Primary)
| Panel | Visualization | Query Focus |
|-------|--------------|-------------|
| Top 10 Movers (Up) | Horizontal bar | Biggest $ increases YoY |
| Top 10 Movers (Down) | Horizontal bar | Biggest $ decreases YoY |
| New Programs | Table | Programs appearing for first time |
| Terminated Programs | Table | Programs with $0 in latest year |
| Biggest Programs | Treemap | Top 50 by total funding |
| Hot Sectors Heatmap | Heatmap | Mission area trends |

**Dashboard Variables:**
- `$fiscal_year` - Year range selector
- `$agency` - Multi-select agency filter
- `$appropriation` - RDT&E, Procurement, O&M
- `$min_amount` - Minimum dollar threshold

### Dashboard 2: Program Deep Dive
- 10-year funding timeline (line chart)
- Narrative summaries by year (text panel)
- Related programs (table)
- Links to source PDFs

### Dashboard 3: Agency Comparison
- Side-by-side service/agency funding trends
- Stacked area charts by appropriation type
- Portfolio composition pie charts

## Self-Service Features (Next.js)

### Visual Report Builder
- Drag-and-drop interface for metric/dimension selection
- Chart type picker (line, bar, table, treemap)
- Filter builder with save/share capability
- Export to CSV/PDF

### Saved Searches & Watchlists
- Save complex filter combinations
- Create program watchlists
- Share with team members

### Alerts
- Email notifications when watched programs change >X%
- Webhook integration for Slack/Teams
- Daily/weekly digest options

### Embedded Grafana
- Embed specific Grafana panels in Next.js pages
- Unified navigation between contract search and budget analytics

## Implementation Phases

### Phase 1: Foundation
- Set up Grafana instance (Docker or Grafana Cloud)
- Add budget tables to PostgreSQL schema (Prisma migration)
- Build basic crawler for comptroller.defense.gov (OSD docs, FY2024-2026)
- Parse one document type end-to-end (R-2 exhibits)
- First Grafana dashboard with real data

### Phase 2: Scale Crawling
- Add all source sites (Services, agencies, labs)
- Expand to FY2015-2023 historical data
- Integrate GPT-5 narrative extraction
- Document status tracking and error handling
- Raw PDF storage and re-parsing capability

### Phase 3: Analytics Dashboards
- "What's Hot/Cold" primary dashboard
- Program deep-dive dashboard
- Agency comparison dashboard
- Pre-computed trends table for query performance
- Dashboard variables and filters

### Phase 4: Self-Service (Next.js)
- Visual report builder UI
- Saved searches and watchlists
- Email alerts integration
- Embedded Grafana panels
- User accounts and sharing

## Technical Considerations

### Performance
- Pre-compute trends table to avoid complex joins in Grafana
- Index heavily on fiscal_year, agency, program_element
- Consider TimescaleDB extension for time-series optimization
- Pagination for large result sets

### Data Quality
- Validation queue for AI extraction discrepancies
- Manual review interface for flagged records
- Version tracking for re-parsed documents
- Audit trail for data corrections

### Cost Estimation
- GPT-5 API costs: ~$0.01-0.05 per document page (estimate)
- Storage: ~50GB for raw PDFs across 10 years
- Grafana Cloud: Free tier may suffice; paid for advanced features
