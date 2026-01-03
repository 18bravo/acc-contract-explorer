/**
 * SAM.gov Contract Awards API Client
 * Docs: https://open.gsa.gov/api/get-opportunities-public-api/
 */

const BASE_URL = "https://api.sam.gov/contract-awards/v1/search";

export interface SAMAward {
  piid: string;
  parentIdvPiid?: string;
  awardeeOrRecipient?: {
    name?: string;
    uniqueEntityIdDuns?: string;
    cageCode?: string;
  };
  awardDate?: string;
  currentEndDate?: string;
  baseValue?: number;
  obligatedAmount?: number;
  description?: string;
  naicsCode?: string;
  naicsDescription?: string;
  pscCode?: string;
  pscDescription?: string;
  contractingAgency?: {
    name?: string;
  };
  fundingAgency?: {
    name?: string;
  };
  placeOfPerformance?: {
    state?: string;
    country?: string;
  };
}

export interface SAMSearchResponse {
  awardSummary?: SAMAward[];
  totalRecords?: number;
}

export interface TaskOrderData {
  piid: string;
  parentIdvPiid: string | null;
  vendorName: string | null;
  vendorUei: string | null;
  cageCode: string | null;
  awardDescription: string | null;
  awardDate: string | null;
  periodOfPerformanceEnd: string | null;
  obligatedAmount: number | null;
  naicsCode: string | null;
  naicsDescription: string | null;
  pscCode: string | null;
  awardingAgency: string | null;
  fundingAgency: string | null;
  placeOfPerformanceState: string | null;
  placeOfPerformanceCountry: string | null;
}

/**
 * Search SAM.gov for contract awards
 */
export async function searchSAM(query: string, limit: number = 100): Promise<TaskOrderData[]> {
  const apiKey = process.env.SAM_API_KEY;

  if (!apiKey) {
    console.error("SAM_API_KEY not configured");
    return [];
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      q: query,
      limit: String(limit),
      offset: "0",
    });

    const response = await fetch(`${BASE_URL}?${params}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`SAM.gov API error: ${response.status}`);
      return [];
    }

    const data: SAMSearchResponse = await response.json();

    if (!data.awardSummary) {
      return [];
    }

    return data.awardSummary.map((award) => ({
      piid: award.piid || "",
      parentIdvPiid: award.parentIdvPiid || null,
      vendorName: award.awardeeOrRecipient?.name || null,
      vendorUei: award.awardeeOrRecipient?.uniqueEntityIdDuns || null,
      cageCode: award.awardeeOrRecipient?.cageCode || null,
      awardDescription: award.description || null,
      awardDate: award.awardDate || null,
      periodOfPerformanceEnd: award.currentEndDate || null,
      obligatedAmount: award.obligatedAmount || award.baseValue || null,
      naicsCode: award.naicsCode || null,
      naicsDescription: award.naicsDescription || null,
      pscCode: award.pscCode || null,
      awardingAgency: award.contractingAgency?.name || null,
      fundingAgency: award.fundingAgency?.name || null,
      placeOfPerformanceState: award.placeOfPerformance?.state || null,
      placeOfPerformanceCountry: award.placeOfPerformance?.country || null,
    }));
  } catch (error) {
    console.error("SAM.gov search error:", error);
    return [];
  }
}

/**
 * Search SAM.gov by PIID pattern
 */
export async function searchSAMByPIID(piidPattern: string, limit: number = 100): Promise<TaskOrderData[]> {
  const apiKey = process.env.SAM_API_KEY;

  if (!apiKey) {
    console.error("SAM_API_KEY not configured");
    return [];
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      piid: piidPattern.replace(/-/g, ""), // SAM often prefers no hyphens
      awardOrIDV: "AWARD",
      limit: String(limit),
      offset: "0",
    });

    const response = await fetch(`${BASE_URL}?${params}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data: SAMSearchResponse = await response.json();

    if (!data.awardSummary) {
      return [];
    }

    return data.awardSummary.map((award) => ({
      piid: award.piid || "",
      parentIdvPiid: award.parentIdvPiid || null,
      vendorName: award.awardeeOrRecipient?.name || null,
      vendorUei: award.awardeeOrRecipient?.uniqueEntityIdDuns || null,
      cageCode: award.awardeeOrRecipient?.cageCode || null,
      awardDescription: award.description || null,
      awardDate: award.awardDate || null,
      periodOfPerformanceEnd: award.currentEndDate || null,
      obligatedAmount: award.obligatedAmount || award.baseValue || null,
      naicsCode: award.naicsCode || null,
      naicsDescription: award.naicsDescription || null,
      pscCode: award.pscCode || null,
      awardingAgency: award.contractingAgency?.name || null,
      fundingAgency: award.fundingAgency?.name || null,
      placeOfPerformanceState: award.placeOfPerformance?.state || null,
      placeOfPerformanceCountry: award.placeOfPerformance?.country || null,
    }));
  } catch (error) {
    console.error("SAM.gov PIID search error:", error);
    return [];
  }
}
