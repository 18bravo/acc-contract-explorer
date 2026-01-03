/**
 * USAspending.gov API Client
 * Docs: https://api.usaspending.gov/docs/
 */

const BASE_URL = "https://api.usaspending.gov/api/v2";

export interface USAspendingAward {
  "Award ID": string;
  "Recipient Name": string;
  "Award Amount": number;
  "Total Outlays": number;
  Description: string;
  "Start Date": string;
  "End Date": string;
  "Awarding Agency": string;
  "Awarding Sub Agency": string;
  "Funding Agency": string;
  "Award Type": string;
  generated_internal_id: string;
  recipient_uei: string;
  recipient_id: string;
  prime_award_recipient_id: string;
}

export interface USAspendingSearchResponse {
  results: USAspendingAward[];
  page_metadata: {
    page: number;
    hasNext: boolean;
    hasPrevious: boolean;
    total: number;
  };
}

export interface TaskOrderData {
  piid: string;
  parentIdvPiid: string | null;
  vendorName: string | null;
  vendorUei: string | null;
  awardDescription: string | null;
  awardDate: string | null;
  periodOfPerformanceStart: string | null;
  periodOfPerformanceEnd: string | null;
  obligatedAmount: number | null;
  awardingAgency: string | null;
  fundingAgency: string | null;
}

export async function searchUSAspending(query: string, limit: number = 100): Promise<TaskOrderData[]> {
  try {
    const response = await fetch(`${BASE_URL}/search/spending_by_award/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: {
          keywords: [query],
          award_type_codes: ["A", "B", "C", "D"], // Contracts only
        },
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
        ],
        page: 1,
        limit,
        sort: "Award Amount",
        order: "desc",
      }),
    });

    if (!response.ok) {
      console.error(`USAspending API error: ${response.status}`);
      return [];
    }

    const data: USAspendingSearchResponse = await response.json();

    return data.results.map((award) => ({
      piid: award["Award ID"] || "",
      parentIdvPiid: null,
      vendorName: award["Recipient Name"] || null,
      vendorUei: award.recipient_uei || null,
      awardDescription: award.Description || null,
      awardDate: award["Start Date"] || null,
      periodOfPerformanceStart: award["Start Date"] || null,
      periodOfPerformanceEnd: award["End Date"] || null,
      obligatedAmount: award["Award Amount"] || null,
      awardingAgency: award["Awarding Agency"] || null,
      fundingAgency: award["Funding Agency"] || null,
    }));
  } catch (error) {
    console.error("USAspending search error:", error);
    return [];
  }
}

/**
 * Search for awards by PIID pattern
 */
export async function searchByPIID(piidPattern: string, limit: number = 100): Promise<TaskOrderData[]> {
  try {
    const response = await fetch(`${BASE_URL}/search/spending_by_award/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: {
          award_ids: [piidPattern],
          award_type_codes: ["A", "B", "C", "D"],
        },
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
        ],
        page: 1,
        limit,
        sort: "Award Amount",
        order: "desc",
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data: USAspendingSearchResponse = await response.json();

    return data.results.map((award) => ({
      piid: award["Award ID"] || "",
      parentIdvPiid: null,
      vendorName: award["Recipient Name"] || null,
      vendorUei: award.recipient_uei || null,
      awardDescription: award.Description || null,
      awardDate: award["Start Date"] || null,
      periodOfPerformanceStart: award["Start Date"] || null,
      periodOfPerformanceEnd: award["End Date"] || null,
      obligatedAmount: award["Award Amount"] || null,
      awardingAgency: award["Awarding Agency"] || null,
      fundingAgency: award["Funding Agency"] || null,
    }));
  } catch (error) {
    console.error("USAspending PIID search error:", error);
    return [];
  }
}
