/**
 * Query Parser using OpenAI
 * Translates natural language queries into structured search parameters
 */

import OpenAI from "openai";

// Known ACC contract vehicles and their identifiers
const CONTRACT_VEHICLES: Record<string, { piidPrefix: string; keywords: string[] }> = {
  "Seaport NxG": {
    piidPrefix: "N00178",
    keywords: ["seaport", "nxg", "nextgen", "navy", "seaport-nxg"],
  },
  "OASIS": {
    piidPrefix: "47QRAD",
    keywords: ["oasis", "one acquisition"],
  },
  "OASIS+": {
    piidPrefix: "47QTCB",
    keywords: ["oasis+", "oasis plus"],
  },
  "ASTRO": {
    piidPrefix: "47QTCK",
    keywords: ["astro", "alliant"],
  },
  "GSA MAS": {
    piidPrefix: "GS-",
    keywords: ["gsa", "mas", "schedule", "federal supply"],
  },
  "CIO-SP3": {
    piidPrefix: "75N98120",
    keywords: ["cio-sp3", "ciosp3", "nih", "it services"],
  },
  "SEWP V": {
    piidPrefix: "NNG15SD",
    keywords: ["sewp", "nasa", "it products"],
  },
  "8(a) STARS III": {
    piidPrefix: "47QTCB21",
    keywords: ["stars", "8a", "8(a)", "small business"],
  },
};

interface ParsedQuery {
  originalQuery: string;
  searchTerms: string[];
  contractVehicle?: string;
  piidPrefix?: string;
  vendorName?: string;
  naicsCode?: string;
  pscCode?: string;
  suggestedQueries: string[];
}

/**
 * Simple pattern matching for contract vehicles
 */
function matchContractVehicle(query: string): { name: string; piidPrefix: string } | null {
  const lowerQuery = query.toLowerCase();

  for (const [name, info] of Object.entries(CONTRACT_VEHICLES)) {
    for (const keyword of info.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        return { name, piidPrefix: info.piidPrefix };
      }
    }
  }

  return null;
}

/**
 * Use OpenAI to parse complex queries
 */
async function parseWithOpenAI(query: string): Promise<Partial<ParsedQuery>> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("OPENAI_API_KEY not configured, skipping AI parsing");
    return {};
  }

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a federal contracting expert. Parse the user's search query and extract:
1. Contract vehicle name (e.g., "Seaport NxG", "OASIS", "GSA MAS", "CIO-SP3", "SEWP")
2. Vendor/company name if mentioned
3. NAICS code if mentioned (6-digit number like 541511)
4. PSC code if mentioned (4-character code like R425)
5. Key search terms

Known contract vehicles and their PIID prefixes:
- Seaport NxG: N00178 (Navy IT services)
- OASIS/OASIS+: 47QRAD/47QTCB (professional services)
- GSA MAS: GS- (federal supply schedules)
- CIO-SP3: 75N98120 (NIH IT services)
- SEWP V: NNG15SD (NASA IT products)
- 8(a) STARS III: 47QTCB21 (small business IT)

Respond with JSON only, no markdown:
{
  "contractVehicle": "string or null",
  "piidPrefix": "string or null",
  "vendorName": "string or null",
  "naicsCode": "string or null",
  "pscCode": "string or null",
  "searchTerms": ["array", "of", "terms"],
  "suggestedQueries": ["alternative search suggestions"]
}`
        },
        {
          role: "user",
          content: query
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return {};

    try {
      return JSON.parse(content);
    } catch {
      console.error("Failed to parse OpenAI response:", content);
      return {};
    }
  } catch (error) {
    console.error("OpenAI API error:", error);
    return {};
  }
}

/**
 * Parse a search query into structured parameters
 */
export async function parseSearchQuery(query: string): Promise<ParsedQuery> {
  const result: ParsedQuery = {
    originalQuery: query,
    searchTerms: query.split(/\s+/).filter(t => t.length > 2),
    suggestedQueries: [],
  };

  // First try simple pattern matching
  const vehicleMatch = matchContractVehicle(query);
  if (vehicleMatch) {
    result.contractVehicle = vehicleMatch.name;
    result.piidPrefix = vehicleMatch.piidPrefix;
  }

  // If OpenAI is available, use it for more complex parsing
  const aiParsed = await parseWithOpenAI(query);

  if (aiParsed.contractVehicle && !result.contractVehicle) {
    result.contractVehicle = aiParsed.contractVehicle;
  }
  if (aiParsed.piidPrefix && !result.piidPrefix) {
    result.piidPrefix = aiParsed.piidPrefix;
  }
  if (aiParsed.vendorName) {
    result.vendorName = aiParsed.vendorName;
  }
  if (aiParsed.naicsCode) {
    result.naicsCode = aiParsed.naicsCode;
  }
  if (aiParsed.pscCode) {
    result.pscCode = aiParsed.pscCode;
  }
  if (aiParsed.searchTerms && aiParsed.searchTerms.length > 0) {
    result.searchTerms = aiParsed.searchTerms;
  }
  if (aiParsed.suggestedQueries && aiParsed.suggestedQueries.length > 0) {
    result.suggestedQueries = aiParsed.suggestedQueries;
  }

  return result;
}

/**
 * Generate optimized queries for external APIs based on parsed query
 */
export function generateApiQueries(parsed: ParsedQuery): {
  usaspending: string[];
  sam: { query?: string; piid?: string; naics?: string; psc?: string }[];
} {
  const usaspending: string[] = [];
  const sam: { query?: string; piid?: string; naics?: string; psc?: string }[] = [];

  // Always include original query
  usaspending.push(parsed.originalQuery);
  sam.push({ query: parsed.originalQuery });

  // If we identified a contract vehicle, add PIID-based searches
  if (parsed.piidPrefix) {
    usaspending.push(parsed.piidPrefix);
    sam.push({ piid: parsed.piidPrefix });
  }

  // If vendor name identified, add it
  if (parsed.vendorName) {
    usaspending.push(parsed.vendorName);
    sam.push({ query: parsed.vendorName });
  }

  // Add NAICS/PSC searches
  if (parsed.naicsCode) {
    sam.push({ naics: parsed.naicsCode });
  }
  if (parsed.pscCode) {
    sam.push({ psc: parsed.pscCode });
  }

  return { usaspending, sam };
}

/**
 * Get contract vehicle info by name or keyword
 */
export function getContractVehicleInfo(nameOrKeyword: string): { name: string; piidPrefix: string } | null {
  return matchContractVehicle(nameOrKeyword);
}

/**
 * Get all known contract vehicles
 */
export function getAllContractVehicles(): { name: string; piidPrefix: string; keywords: string[] }[] {
  return Object.entries(CONTRACT_VEHICLES).map(([name, info]) => ({
    name,
    ...info,
  }));
}
