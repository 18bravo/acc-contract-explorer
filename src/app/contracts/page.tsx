"use client";

import { useState, useEffect, useCallback } from "react";
import { StatsCard } from "@/components/StatsCard";
import { VehicleCard } from "@/components/VehicleCard";
import { TaskOrderTable } from "@/components/TaskOrderTable";
import { Pagination } from "@/components/Pagination";
import { UnifiedSearch } from "@/components/UnifiedSearch";
import { NavTabs } from "@/components/NavTabs";

interface Vehicle {
  id: string;
  name: string;
  description: string | null;
  agency: string | null;
  taskOrderCount: number | null;
  totalObligated: number | null;
}

interface TaskOrder {
  id: number;
  piid: string;
  parentIdvPiid: string | null;
  vehicleName: string | null;
  vendorName: string | null;
  awardDescription: string | null;
  awardDate: string | null;
  obligatedAmount: number | null;
  potentialValue: number | null;
  placeOfPerformanceState: string | null;
  naicsCode: string | null;
  pscCode: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface JobStatus {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  internalCount: number;
  externalCount: number;
  newRecords: number;
  error?: string;
}

interface ExternalResult {
  piid: string;
  parentIdvPiid?: string | null;
  vendorName?: string | null;
  awardDescription?: string | null;
  awardDate?: string | null;
  obligatedAmount?: number | null;
  naicsCode?: string | null;
  pscCode?: string | null;
  awardingAgency?: string | null;
  placeOfPerformanceState?: string | null;
}

function formatCurrency(amount: number | null): string {
  if (!amount) return "$0";
  if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  return `$${amount.toLocaleString()}`;
}

export default function ContractsPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [taskOrders, setTaskOrders] = useState<TaskOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [externalResults, setExternalResults] = useState<ExternalResult[]>([]);

  // Summary stats
  const totalOrders = vehicles.reduce((sum, v) => sum + (v.taskOrderCount || 0), 0);
  const totalObligated = vehicles.reduce((sum, v) => sum + (v.totalObligated || 0), 0);

  // Load vehicles
  useEffect(() => {
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then((data) => {
        setVehicles(data.vehicles || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load vehicles:", err);
        setIsLoading(false);
      });
  }, []);

  // Load task orders by vehicle (browse mode)
  const loadTaskOrdersByVehicle = useCallback(
    async (vehicleId: string | null, page: number = 1) => {
      setIsSearching(true);

      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "50");
      if (vehicleId) params.set("vehicleId", vehicleId);

      try {
        const res = await fetch(`/api/task-orders?${params}`);
        const data = await res.json();
        setTaskOrders(data.taskOrders || []);
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      } catch (err) {
        console.error("Failed to load task orders:", err);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Load task orders when vehicle changes (browse mode only)
  useEffect(() => {
    if (!searchMode) {
      loadTaskOrdersByVehicle(selectedVehicle);
    }
  }, [selectedVehicle, searchMode, loadTaskOrdersByVehicle]);

  // Handle search results
  const handleSearchResults = useCallback((results: TaskOrder[], paginationData: PaginationData) => {
    setTaskOrders(results);
    setPagination(paginationData);
    setSearchMode(results.length > 0 || paginationData.total > 0);
  }, []);

  // Handle external results from search
  const handleExternalResults = useCallback((results: ExternalResult[]) => {
    setExternalResults(results);
  }, []);

  // Clear search and return to browse mode
  const clearSearch = () => {
    setSearchMode(false);
    setSelectedVehicle(null);
    setCurrentJob(null);
    setExternalResults([]);
    loadTaskOrdersByVehicle(null);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src="/warwerx-logo.png" alt="WARWERX" className="h-20 w-auto py-2" />
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Contract Explorer
                </h1>
              </div>
            </div>
            <NavTabs />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Unified Search Bar */}
        <div className="mb-8">
          <UnifiedSearch
            onResults={handleSearchResults}
            onLoading={setIsSearching}
            onJobUpdate={setCurrentJob}
            onExternalResults={handleExternalResults}
          />
          {searchMode && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                Found {pagination.total.toLocaleString()} results
              </span>
              <button
                onClick={clearSearch}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Stats Overview */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Contract Vehicles"
            value={vehicles.filter((v) => (v.taskOrderCount || 0) > 0).length}
            subtitle="Active vehicles with data"
          />
          <StatsCard
            title="Total Task Orders"
            value={totalOrders.toLocaleString()}
            subtitle="Across all vehicles"
          />
          <StatsCard
            title="Total Obligated"
            value={formatCurrency(totalObligated)}
            subtitle="Federal contract obligations"
          />
          <StatsCard
            title="Unique Vendors"
            value="10K+"
            subtitle="Contractors in dataset"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Vehicle Sidebar */}
          <aside className="lg:col-span-4">
            <div className="sticky top-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Contract Vehicles
                </h2>
                {(selectedVehicle || searchMode) && (
                  <button
                    onClick={clearSearch}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    Show All
                  </button>
                )}
              </div>

              <div className="max-h-[calc(100vh-200px)] space-y-2 overflow-y-auto pr-2">
                {vehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    id={vehicle.id}
                    name={vehicle.name}
                    description={vehicle.description}
                    agency={vehicle.agency}
                    taskOrderCount={vehicle.taskOrderCount}
                    totalObligated={vehicle.totalObligated}
                    isSelected={selectedVehicle === vehicle.id}
                    onSelect={(id) => {
                      setSearchMode(false);
                      setSelectedVehicle(id === selectedVehicle ? null : id);
                    }}
                  />
                ))}
              </div>
            </div>
          </aside>

          {/* Task Orders */}
          <section className="lg:col-span-8">
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {searchMode ? (
                    "Search Results"
                  ) : selectedVehicle ? (
                    <>
                      Task Orders
                      <span className="ml-2 text-sm font-normal text-zinc-500">
                        ({vehicles.find((v) => v.id === selectedVehicle)?.name})
                      </span>
                    </>
                  ) : (
                    "All Task Orders"
                  )}
                </h2>
              </div>

              <TaskOrderTable taskOrders={taskOrders} isLoading={isSearching} />

              {pagination.totalPages > 0 && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  total={pagination.total}
                  limit={pagination.limit}
                  onPageChange={(page) => {
                    if (searchMode) {
                      // For search mode, need to re-search with page
                      // This is handled by the search component
                    } else {
                      loadTaskOrdersByVehicle(selectedVehicle, page);
                    }
                  }}
                />
              )}
            </div>

            {/* External Results Section */}
            {externalResults.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="border-b border-blue-200 px-4 py-3 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <h2 className="font-semibold text-blue-800 dark:text-blue-200">
                      External Results from SAM.gov & USAspending.gov
                      <span className="ml-2 text-sm font-normal">
                        ({externalResults.length} contracts)
                      </span>
                    </h2>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-blue-200 bg-blue-100/50 dark:border-blue-800 dark:bg-blue-900/30">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-blue-700 dark:text-blue-300">PIID</th>
                        <th className="px-4 py-3 font-semibold text-blue-700 dark:text-blue-300">Vendor</th>
                        <th className="px-4 py-3 font-semibold text-blue-700 dark:text-blue-300">Agency</th>
                        <th className="px-4 py-3 font-semibold text-blue-700 dark:text-blue-300">Award Date</th>
                        <th className="px-4 py-3 text-right font-semibold text-blue-700 dark:text-blue-300">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-200 dark:divide-blue-800">
                      {externalResults.slice(0, 50).map((result, index) => (
                        <tr key={`ext-${index}-${result.piid}`} className="bg-white dark:bg-zinc-900">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                              {result.piid}
                            </span>
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {result.vendorName || "-"}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {result.awardingAgency || "-"}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {result.awardDate ? new Date(result.awardDate).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-100">
                            {result.obligatedAmount ? formatCurrency(result.obligatedAmount) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {externalResults.length > 50 && (
                  <div className="border-t border-blue-200 px-4 py-2 text-center text-sm text-blue-600 dark:border-blue-800 dark:text-blue-400">
                    Showing 50 of {externalResults.length} external results
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-zinc-500 sm:px-6 lg:px-8">
          Data sourced from USAspending.gov and SAM.gov. Last updated: December 2024
        </div>
      </footer>
    </div>
  );
}
