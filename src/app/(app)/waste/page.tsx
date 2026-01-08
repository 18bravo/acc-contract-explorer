"use client";

import { useState, useEffect, useCallback } from "react";
import { Pagination } from "@/components/Pagination";
import { WasteFilterBar, WasteFilters } from "@/components/WasteFilterBar";
import { WasteContractTable } from "@/components/WasteContractTable";
import { WasteContractDetail } from "@/components/WasteContractDetail";

interface Contract {
  id: number;
  piid: string;
  vendorName: string | null;
  awardDescription: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  awardDate: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  awardingAgency: string | null;
  overallScore: number | null;
  flags: {
    costGrowth: boolean;
    underutilized: boolean;
    oldContract: boolean;
    highMods: boolean;
    passThru: boolean;
    vendorConc: boolean;
    duplicate: boolean;
    highRate: boolean;
  } | null;
}

interface Stats {
  overview: {
    totalContracts: number;
    contractsWithScores: number;
    totalObligated: number;
  };
  flaggedCounts: Record<string, number>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

export default function WastePage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<WasteFilters>({});
  const [sortBy, setSortBy] = useState("overallScore");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams({
      page: page.toString(),
      limit: "50",
      sortBy,
      sortOrder,
    });

    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });

    try {
      const res = await fetch(`/api/waste/contracts?${params}`);
      const data = await res.json();
      setContracts(data.results || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch contracts:", error);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/waste/stats");
      if (!res.ok) {
        console.error("Stats API error:", res.status);
        return;
      }
      const data = await res.json();
      if (data.overview) {
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const handleFilterChange = (newFilters: WasteFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="bg-black text-white">
      {/* Stats Bar */}
      {stats && (
        <div className="border-b border-zinc-800 bg-zinc-950/50">
          <div className="max-w-[1800px] mx-auto px-6 py-3">
            <div className="flex items-center gap-8 text-sm">
              <div>
                <span className="text-zinc-500">Contracts:</span>
                <span className="text-white ml-2 font-mono">{stats.overview.totalContracts.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-zinc-500">Scored:</span>
                <span className="text-white ml-2 font-mono">{stats.overview.contractsWithScores.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-zinc-500">Total Obligated:</span>
                <span className="text-white ml-2 font-mono">{formatCurrency(stats.overview.totalObligated)}</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4">
                {stats.scoreDistribution.map((d) => (
                  <div key={d.bucket} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${
                      d.bucket === "critical" ? "bg-red-500" :
                      d.bucket === "high" ? "bg-orange-500" :
                      d.bucket === "medium" ? "bg-yellow-500" :
                      d.bucket === "low" ? "bg-green-500" : "bg-zinc-500"
                    }`} />
                    <span className="text-zinc-400 text-xs">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="space-y-4">
          {/* Filters */}
          <WasteFilterBar onFilterChange={handleFilterChange} />

          {/* Results info */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {loading ? "Loading..." : `${total.toLocaleString()} contracts found`}
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <WasteContractTable
              contracts={contracts}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              onSelect={setSelectedId}
              selectedId={selectedId || undefined}
            />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={50}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>

      {/* Detail Drawer */}
      <WasteContractDetail
        contractId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelectRelated={setSelectedId}
      />
    </div>
  );
}
