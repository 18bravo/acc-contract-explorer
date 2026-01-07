/**
 * Budget Document Source Definitions
 * URL patterns and metadata for crawling DoD budget justification documents
 */

export interface BudgetSource {
  id: string;
  name: string;
  agency: string;
  baseUrl: string;
  fiscalYears: number[];
  documentTypes: string[];
  urlPattern: (fy: number, docType: string) => string;
}

// OSD Comptroller - Primary source for DoD-wide budget materials
export const COMPTROLLER_SOURCE: BudgetSource = {
  id: "osd-comptroller",
  name: "OSD Comptroller",
  agency: "OSD",
  baseUrl: "https://comptroller.defense.gov",
  fiscalYears: [2024, 2025, 2026],
  documentTypes: ["RDT&E", "Procurement", "O&M"],
  urlPattern: (fy: number, docType: string) => {
    const docFolder = {
      "RDT&E": "03_RDT_and_E",
      "Procurement": "02_Procurement",
      "O&M": "01_Operation_and_Maintenance",
    }[docType] || docType;
    return `https://comptroller.defense.gov/Portals/45/Documents/defbudget/FY${fy}/budget_justification/pdfs/${docFolder}/`;
  },
};

// Service-specific sources
export const ARMY_SOURCE: BudgetSource = {
  id: "army",
  name: "Army Budget",
  agency: "Army",
  baseUrl: "https://asafm.army.mil",
  fiscalYears: [2024, 2025, 2026],
  documentTypes: ["RDT&E", "Procurement", "O&M"],
  urlPattern: (fy: number, _docType: string) =>
    `https://asafm.army.mil/Budget-Materials/FY${fy}/`,
};

export const NAVY_SOURCE: BudgetSource = {
  id: "navy",
  name: "Navy/Marines Budget",
  agency: "Navy",
  baseUrl: "https://www.secnav.navy.mil",
  fiscalYears: [2024, 2025, 2026],
  documentTypes: ["RDT&E", "Procurement", "O&M"],
  urlPattern: (fy: number, _docType: string) =>
    `https://www.secnav.navy.mil/fmc/fmb/Pages/Fiscal-Year-${fy}.aspx`,
};

export const AIR_FORCE_SOURCE: BudgetSource = {
  id: "air-force",
  name: "Air Force Budget",
  agency: "Air Force",
  baseUrl: "https://www.saffm.hq.af.mil",
  fiscalYears: [2024, 2025, 2026],
  documentTypes: ["RDT&E", "Procurement", "O&M"],
  urlPattern: (fy: number, _docType: string) =>
    `https://www.saffm.hq.af.mil/FM-Resources/Budget/FY${fy}/`,
};

// All sources
export const ALL_SOURCES: BudgetSource[] = [
  COMPTROLLER_SOURCE,
  ARMY_SOURCE,
  NAVY_SOURCE,
  AIR_FORCE_SOURCE,
];

// Defense agencies with RDT&E budgets
const RDTE_AGENCIES = [
  "DARPA", "DTRA", "MDA", "DISA", "OSD", "DHA", "DCMA", "CBDP", "TJS",
  "SOCOM", "WHS", "DLA", "DCAA", "DTIC", "DSS", "DFAS"
];

// Generate URLs for a fiscal year range
function generateR2Urls(startFY: number, endFY: number): { fy: number; url: string; agency: string }[] {
  const docs: { fy: number; url: string; agency: string }[] = [];

  for (let fy = startFY; fy <= endFY; fy++) {
    for (const agency of RDTE_AGENCIES) {
      docs.push({
        fy,
        url: `https://comptroller.defense.gov/Portals/45/Documents/defbudget/FY${fy}/budget_justification/pdfs/03_RDT_and_E/RDTE_${agency}_PB_${fy}.pdf`,
        agency,
      });
    }
  }

  return docs;
}

// Known R-2 exhibit documents (RDT&E)
// Coverage: FY2018-FY2026 (9 years of data)
export const KNOWN_R2_DOCUMENTS: { fy: number; url: string; agency: string }[] = [
  ...generateR2Urls(2018, 2026),
];
