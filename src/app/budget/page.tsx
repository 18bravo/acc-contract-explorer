"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NavTabs } from "@/components/NavTabs";
import { StatsCard } from "@/components/StatsCard";
import { BudgetFilterBar } from "@/components/BudgetFilterBar";
import { BudgetTrendChart } from "@/components/BudgetTrendChart";
import { AgencyBarChart } from "@/components/AgencyBarChart";
import { BudgetMoversCards } from "@/components/BudgetMoversCards";
import { BudgetProgramTable } from "@/components/BudgetProgramTable";

interface BudgetMover {
  id: number;
  programElement: string | null;
  programName: string | null;
  fiscalYear: number;
  agency: string | null;
  amount: number | null;
  yoyChangeDollars: number | null;
  yoyChangePercent: number | null;
  trendDirection: string | null;
}

interface BudgetProgram extends BudgetMover {
  appropriationType: string | null;
  fiveYearCagr: number | null;
}

interface SummaryData {
  totalPrograms: number;
  totalBudget: number;
  avgYoyChangePercent: number | null;
  netChangeDollars: number;
  displayFiscalYear: number;
}

interface FilterOptions {
  fiscalYears: number[];
  agencies: string[];
  appropriationTypes: string[];
}

interface ChartData {
  trend: { fiscalYear: number; totalAmount: number; programCount: number }[];
  byAgency: { agency: string; totalAmount: number; programCount: number }[];
  byAppropriation: { appropriationType: string; totalAmount: number; programCount: number }[];
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  // Amount is in thousands
  const realAmount = amount * 1000;
  if (realAmount >= 1e12) return `$${(realAmount / 1e12).toFixed(2)}T`;
  if (realAmount >= 1e9) return `$${(realAmount / 1e9).toFixed(2)}B`;
  if (realAmount >= 1e6) return `$${(realAmount / 1e6).toFixed(1)}M`;
  return `$${realAmount.toLocaleString()}`;
}

function formatPercent(percent: number | null): string {
  if (percent === null || percent === undefined) return "-";
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

function BudgetPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    fiscalYears: [],
    agencies: [],
    appropriationTypes: [],
  });
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [movers, setMovers] = useState<{
    gainers: BudgetMover[];
    losers: BudgetMover[];
    newPrograms: BudgetMover[];
  }>({ gainers: [], losers: [], newPrograms: [] });
  const [programs, setPrograms] = useState<BudgetProgram[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Loading states
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [isLoadingMovers, setIsLoadingMovers] = useState(true);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);

  // Sorting state
  const [sortBy, setSortBy] = useState("yoyChangePercent");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Build query string from current params
  const buildQueryString = useCallback(
    (overrides: Record<string, string | number | null> = {}) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(overrides).forEach(([key, value]) => {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });
      return params.toString();
    },
    [searchParams]
  );

  // Fetch summary and filter options
  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoadingSummary(true);
      try {
        const queryString = buildQueryString();
        const res = await fetch(`/api/budget/summary?${queryString}`);
        const data = await res.json();
        setSummary(data.summary);
        setFilterOptions(data.filters);
      } catch (err) {
        console.error("Failed to fetch summary:", err);
      } finally {
        setIsLoadingSummary(false);
      }
    };
    fetchSummary();
  }, [buildQueryString]);

  // Fetch chart data
  useEffect(() => {
    const fetchCharts = async () => {
      setIsLoadingCharts(true);
      try {
        const queryString = buildQueryString();
        const res = await fetch(`/api/budget/chart-data?${queryString}`);
        const data = await res.json();
        setChartData(data);
      } catch (err) {
        console.error("Failed to fetch chart data:", err);
      } finally {
        setIsLoadingCharts(false);
      }
    };
    fetchCharts();
  }, [buildQueryString]);

  // Fetch movers
  useEffect(() => {
    const fetchMovers = async () => {
      setIsLoadingMovers(true);
      try {
        const fy = searchParams.get("fy") || filterOptions.fiscalYears[0]?.toString();
        const queryString = buildQueryString({ fy: fy || null });
        const res = await fetch(`/api/budget/movers?${queryString}&limit=5`);
        const data = await res.json();
        setMovers({
          gainers: data.gainers || [],
          losers: data.losers || [],
          newPrograms: data.newPrograms || [],
        });
      } catch (err) {
        console.error("Failed to fetch movers:", err);
      } finally {
        setIsLoadingMovers(false);
      }
    };
    fetchMovers();
  }, [buildQueryString, searchParams, filterOptions.fiscalYears]);

  // Fetch programs
  useEffect(() => {
    const fetchPrograms = async () => {
      setIsLoadingPrograms(true);
      try {
        const page = searchParams.get("page") || "1";
        const queryString = buildQueryString({
          page,
          sortBy,
          sortOrder,
        });
        const res = await fetch(`/api/budget/programs?${queryString}`);
        const data = await res.json();
        setPrograms(data.programs || []);
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      } catch (err) {
        console.error("Failed to fetch programs:", err);
      } finally {
        setIsLoadingPrograms(false);
      }
    };
    fetchPrograms();
  }, [buildQueryString, searchParams, sortBy, sortOrder]);

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/budget?${params.toString()}`, { scroll: false });
  };

  // Handle agency click from bar chart
  const handleAgencyClick = (agency: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("agency", agency);
    params.delete("page");
    router.push(`/budget?${params.toString()}`, { scroll: false });
  };

  // Handle program search from movers
  const handleProgramClick = (programElement: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("q", programElement);
    params.delete("page");
    router.push(`/budget?${params.toString()}`, { scroll: false });
  };

  // Export to CSV
  const handleExport = async () => {
    try {
      const queryString = buildQueryString({ limit: "10000" });
      const res = await fetch(`/api/budget/programs?${queryString}`);
      const data = await res.json();

      // Convert to CSV
      const headers = [
        "Program Element",
        "Program Name",
        "Fiscal Year",
        "Agency",
        "Appropriation Type",
        "Amount ($K)",
        "YoY Change ($K)",
        "YoY Change (%)",
        "Trend",
      ];

      const rows = data.programs.map((p: BudgetProgram) => [
        p.programElement || "",
        (p.programName || "").replace(/,/g, ";"),
        p.fiscalYear,
        p.agency || "",
        p.appropriationType || "",
        p.amount || "",
        p.yoyChangeDollars || "",
        p.yoyChangePercent || "",
        p.trendDirection || "",
      ]);

      const csv = [headers.join(","), ...rows.map((r: (string | number)[]) => r.join(","))].join("\n");

      // Download
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-programs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src="/warwerx-logo.png" alt="WARWERX" className="h-20 w-auto py-2" />
              <div>
                <h1 className="text-2xl font-bold text-white">Contract Explorer</h1>
              </div>
            </div>
            <NavTabs />
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <BudgetFilterBar options={filterOptions} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Summary Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Programs"
            value={isLoadingSummary ? "..." : (summary?.totalPrograms || 0).toLocaleString()}
            subtitle="Programs in view"
          />
          <StatsCard
            title="Total Budget"
            value={isLoadingSummary ? "..." : formatCurrency(summary?.totalBudget || 0)}
            subtitle={`FY${summary?.displayFiscalYear || new Date().getFullYear()} Request`}
          />
          <StatsCard
            title="Avg YoY Change"
            value={isLoadingSummary ? "..." : formatPercent(summary?.avgYoyChangePercent || null)}
            subtitle="Year-over-year"
          />
          <StatsCard
            title="Net Change"
            value={isLoadingSummary ? "..." : formatCurrency(summary?.netChangeDollars || 0)}
            subtitle="vs. prior year"
          />
        </div>

        {/* Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <BudgetTrendChart data={chartData?.trend || []} isLoading={isLoadingCharts} />
          <AgencyBarChart
            data={chartData?.byAgency || []}
            isLoading={isLoadingCharts}
            onAgencyClick={handleAgencyClick}
          />
        </div>

        {/* Movers */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Budget Movers
          </h2>
          <BudgetMoversCards
            gainers={movers.gainers}
            losers={movers.losers}
            newPrograms={movers.newPrograms}
            isLoading={isLoadingMovers}
            onProgramClick={handleProgramClick}
          />
        </div>

        {/* Program Table */}
        <BudgetProgramTable
          programs={programs}
          pagination={pagination}
          isLoading={isLoadingPrograms}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onPageChange={handlePageChange}
          onExport={handleExport}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-zinc-500 sm:px-6 lg:px-8">
          Budget data sourced from DoD R-2/R-1 Justification Books. Last updated: January 2026
        </div>
      </footer>
    </div>
  );
}

export default function BudgetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
        </div>
      }
    >
      <BudgetPageContent />
    </Suspense>
  );
}
