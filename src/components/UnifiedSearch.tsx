"use client";

import { useState, useCallback, useEffect } from "react";

interface SearchResult {
  id: number;
  piid: string;
  parentIdvPiid: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  vendorName: string | null;
  awardDescription: string | null;
  awardDate: string | null;
  obligatedAmount: number | null;
  potentialValue: number | null;
  naicsCode: string | null;
  pscCode: string | null;
  placeOfPerformanceState: string | null;
  rank: number;
}

interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  searchJobId?: number;
  source: "internal" | "hybrid";
}

interface ExternalResult {
  piid: string;
  parentIdvPiid?: string | null;
  vendorName?: string | null;
  vendorUei?: string | null;
  cageCode?: string | null;
  awardDescription?: string | null;
  awardDate?: string | null;
  periodOfPerformanceStart?: string | null;
  periodOfPerformanceEnd?: string | null;
  obligatedAmount?: number | null;
  naicsCode?: string | null;
  naicsDescription?: string | null;
  pscCode?: string | null;
  awardingAgency?: string | null;
  fundingAgency?: string | null;
  placeOfPerformanceState?: string | null;
  placeOfPerformanceCountry?: string | null;
}

interface JobStatus {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  internalCount: number;
  externalCount: number;
  newRecords: number;
  externalResults?: ExternalResult[];
  error?: string;
}

interface UnifiedSearchProps {
  onResults: (results: SearchResult[], pagination: SearchResponse["pagination"]) => void;
  onLoading: (loading: boolean) => void;
  onJobUpdate?: (job: JobStatus | null) => void;
  onExternalResults?: (results: ExternalResult[]) => void;
}

export function UnifiedSearch({ onResults, onLoading, onJobUpdate, onExternalResults }: UnifiedSearchProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  // Search function - defined before useEffect that depends on it
  const search = useCallback(async (searchQuery: string, page: number = 1) => {
    if (!searchQuery.trim()) {
      onResults([], { page: 1, limit: 50, total: 0, totalPages: 0 });
      return;
    }

    setIsSearching(true);
    onLoading(true);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, page, limit: 50 }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data: SearchResponse = await res.json();
      onResults(data.results, data.pagination);

      if (data.searchJobId) {
        setCurrentJobId(data.searchJobId);
        setJobStatus({
          id: data.searchJobId,
          status: "pending",
          internalCount: data.pagination.total,
          externalCount: 0,
          newRecords: 0,
        });
        onJobUpdate?.({
          id: data.searchJobId,
          status: "pending",
          internalCount: data.pagination.total,
          externalCount: 0,
          newRecords: 0,
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      onResults([], { page: 1, limit: 50, total: 0, totalPages: 0 });
    } finally {
      setIsSearching(false);
      onLoading(false);
    }
  }, [onResults, onLoading, onJobUpdate]);

  // Poll for job status and auto-refresh when new records found
  useEffect(() => {
    if (!currentJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/search/jobs/${currentJobId}`);
        if (res.ok) {
          const job: JobStatus = await res.json();
          setJobStatus(job);
          onJobUpdate?.(job);

          if (job.status === "completed" || job.status === "failed") {
            clearInterval(pollInterval);
            setCurrentJobId(null);

            // Pass external results to parent when job completes
            if (job.status === "completed" && job.externalResults && job.externalResults.length > 0) {
              onExternalResults?.(job.externalResults);
            }

            // Auto-refresh results if new records were added
            if (job.status === "completed" && job.newRecords > 0 && query.trim()) {
              // Small delay to ensure DB writes are complete
              setTimeout(() => {
                search(query);
              }, 500);
            }
          }
        }
      } catch (error) {
        console.error("Error polling job status:", error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentJobId, onJobUpdate, onExternalResults, query, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search(query);
    }
  };

  const triggerExternalSearch = async () => {
    if (!query.trim()) return;

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, fetchExternal: true }),
      });

      if (res.ok) {
        const data: SearchResponse = await res.json();
        if (data.searchJobId) {
          setCurrentJobId(data.searchJobId);
          setJobStatus({
            id: data.searchJobId,
            status: "pending",
            internalCount: data.pagination.total,
            externalCount: 0,
            newRecords: 0,
          });
        }
      }
    } catch (error) {
      console.error("External search error:", error);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg
              className="h-5 w-5 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contracts, vendors, NAICS codes, agencies..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-3 pl-10 pr-4 text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          {isSearching && (
            <div className="absolute inset-y-0 right-3 flex items-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {/* External Search Status */}
      {jobStatus && (
        <div className={`mt-3 rounded-lg border px-4 py-3 ${
          jobStatus.status === "completed"
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : jobStatus.status === "failed"
            ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
            : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(jobStatus.status === "pending" || jobStatus.status === "running") && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              )}
              {jobStatus.status === "completed" && (
                <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {jobStatus.status === "failed" && (
                <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <div>
                <p className={`text-sm font-medium ${
                  jobStatus.status === "completed"
                    ? "text-green-700 dark:text-green-300"
                    : jobStatus.status === "failed"
                    ? "text-red-700 dark:text-red-300"
                    : "text-blue-700 dark:text-blue-300"
                }`}>
                  {jobStatus.status === "pending" && "Querying SAM.gov & USAspending.gov..."}
                  {jobStatus.status === "running" && "Fetching contracts from federal databases..."}
                  {jobStatus.status === "completed" && "External search complete"}
                  {jobStatus.status === "failed" && "External search failed"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {jobStatus.status === "completed" ? (
                    <>
                      Found {jobStatus.externalCount} external records
                      {jobStatus.newRecords > 0 && ` • ${jobStatus.newRecords} new contracts added`}
                    </>
                  ) : jobStatus.status === "failed" ? (
                    jobStatus.error || "Connection error"
                  ) : (
                    `${jobStatus.internalCount} results from local database`
                  )}
                </p>
              </div>
            </div>
            {jobStatus.status === "completed" && jobStatus.newRecords > 0 && (
              <button
                onClick={() => search(query)}
                className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
              >
                Refresh Results
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual External Search Button */}
      {query.trim() && !currentJobId && !jobStatus && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Want more results? Search federal contract databases.
          </p>
          <button
            onClick={triggerExternalSearch}
            className="flex items-center gap-2 rounded-md bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Search SAM.gov & USAspending.gov
          </button>
        </div>
      )}
    </div>
  );
}
