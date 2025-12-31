"use client";

import { useState, useEffect, useCallback } from "react";
import { StatsCard } from "@/components/StatsCard";
import { VehicleCard } from "@/components/VehicleCard";
import { TaskOrderTable } from "@/components/TaskOrderTable";
import { SearchFilters } from "@/components/SearchFilters";
import { Pagination } from "@/components/Pagination";

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

function formatCurrency(amount: number | null): string {
  if (!amount) return "$0";
  if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  return `$${amount.toLocaleString()}`;
}

export default function Home() {
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
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [state, setState] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

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

  // Load task orders
  const loadTaskOrders = useCallback(
    async (page: number = 1) => {
      setIsLoadingOrders(true);

      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "50");

      if (selectedVehicle) params.set("vehicleId", selectedVehicle);
      if (search) params.set("search", search);
      if (vendor) params.set("vendor", vendor);
      if (state) params.set("state", state);
      if (minAmount) params.set("minAmount", minAmount);
      if (maxAmount) params.set("maxAmount", maxAmount);

      try {
        const res = await fetch(`/api/task-orders?${params}`);
        const data = await res.json();
        setTaskOrders(data.taskOrders || []);
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      } catch (err) {
        console.error("Failed to load task orders:", err);
      } finally {
        setIsLoadingOrders(false);
      }
    },
    [selectedVehicle, search, vendor, state, minAmount, maxAmount]
  );

  // Load task orders when filters change
  useEffect(() => {
    const debounce = setTimeout(() => {
      loadTaskOrders(1);
    }, 300);

    return () => clearTimeout(debounce);
  }, [loadTaskOrders]);

  const clearFilters = () => {
    setSearch("");
    setVendor("");
    setState("");
    setMinAmount("");
    setMaxAmount("");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            ACC Contract Explorer
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Explore Army Contracting Command contract vehicles and task orders
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
                {selectedVehicle && (
                  <button
                    onClick={() => setSelectedVehicle(null)}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
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
                    onSelect={(id) => setSelectedVehicle(id === selectedVehicle ? null : id)}
                  />
                ))}
              </div>
            </div>
          </aside>

          {/* Task Orders */}
          <section className="lg:col-span-8">
            <SearchFilters
              search={search}
              onSearchChange={setSearch}
              vendor={vendor}
              onVendorChange={setVendor}
              state={state}
              onStateChange={setState}
              minAmount={minAmount}
              onMinAmountChange={setMinAmount}
              maxAmount={maxAmount}
              onMaxAmountChange={setMaxAmount}
              onClear={clearFilters}
            />

            <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Task Orders
                  {selectedVehicle && (
                    <span className="ml-2 text-sm font-normal text-zinc-500">
                      ({vehicles.find((v) => v.id === selectedVehicle)?.name})
                    </span>
                  )}
                </h2>
              </div>

              <TaskOrderTable taskOrders={taskOrders} isLoading={isLoadingOrders} />

              {pagination.totalPages > 0 && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  total={pagination.total}
                  limit={pagination.limit}
                  onPageChange={(page) => loadTaskOrders(page)}
                />
              )}
            </div>
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
