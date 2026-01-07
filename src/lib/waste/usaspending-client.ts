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
