"use client";

import { useState, useEffect, useCallback } from "react";
import { NavTabs } from "@/components/NavTabs";
import { Pagination } from "@/components/Pagination";
import { RiskFilterBar, RiskFilters } from "@/components/RiskFilterBar";
import { RiskContractTable } from "@/components/RiskContractTable";
import { RiskContractDetail } from "@/components/RiskContractDetail";

interface Contract {
  id: number;
  piid: string;
  vendorName: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  pscCode: string | null;
  awardingAgency: string | null;
  riskScore: number | null;
  currentRatio: number | null;
  breachProbability: number | null;
  monthsToWarning: number | null;
  lifecycleStage: number | null;
  confidenceLevel: string | null;
}

interface Stats {
  overview: {
    totalContracts: number;
    contractsWithScores: number;
    urgentWarnings: number;
  };
  scoreDistribution: Array<{ bucket: string; count: number }>;
  confidenceDistribution: Array<{ level: string; count: number }>;
}

export default function RiskPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<RiskFilters>({});
  const [sortBy, setSortBy] = useState("riskScore");
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

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });

    try {
      const res = await fetch(`/api/risk/contracts?${params}`);
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
      const res = await fetch("/api/risk/stats");
      if (!res.ok) return;
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

  const handleFilterChange = (newFilters: RiskFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-red-500 font-bold text-xl">WARWERX</div>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Cost Risk Model</span>
            </div>
            <NavTabs />
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      {stats && (
        <div className="border-b border-zinc-800 bg-zinc-950/50">
          <div className="max-w-[1800px] mx-auto px-6 py-3">
            <div className="flex items-center gap-8 text-sm">
              <div>
                <span className="text-zinc-500">Contracts:</span>
                <span className="text-white ml-2 font-mono">
                  {stats.overview.totalContracts.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Scored:</span>
                <span className="text-white ml-2 font-mono">
                  {stats.overview.contractsWithScores.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Urgent Warnings:</span>
                <span className="text-orange-400 ml-2 font-mono">
                  {stats.overview.urgentWarnings}
                </span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4">
                {stats.scoreDistribution.map((d) => (
                  <div key={d.bucket} className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        d.bucket === "critical"
                          ? "bg-red-500"
                          : d.bucket === "high"
                          ? "bg-orange-500"
                          : d.bucket === "medium"
                          ? "bg-yellow-500"
                          : d.bucket === "low"
                          ? "bg-green-500"
                          : "bg-zinc-500"
                      }`}
                    />
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
          <RiskFilterBar onFilterChange={handleFilterChange} />

          {/* Results info */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {loading ? "Loading..." : `${total.toLocaleString()} contracts with risk scores`}
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <RiskContractTable
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
      <RiskContractDetail
        contractId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelectRelated={setSelectedId}
      />
    </div>
  );
}
