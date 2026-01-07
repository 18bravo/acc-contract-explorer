"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface FilterOptions {
  fiscalYears: number[];
  agencies: string[];
  appropriationTypes: string[];
}

interface BudgetFilterBarProps {
  options: FilterOptions;
}

export function BudgetFilterBar({ options }: BudgetFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse current filter state from URL
  const selectedFY = searchParams.get("fy")?.split(",").map(Number).filter(Boolean) || [];
  const selectedAgency = searchParams.get("agency") || "";
  const selectedApprop = searchParams.get("approp")?.split(",").filter(Boolean) || [];
  const searchQuery = searchParams.get("q") || "";

  // Local state for debounced search
  const [localQuery, setLocalQuery] = useState(searchQuery);

  // Update URL with new filters
  const updateFilters = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset to page 1 when filters change
      params.delete("page");

      router.push(`/budget?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        updateFilters({ q: localQuery || null });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localQuery, searchQuery, updateFilters]);

  // Toggle fiscal year selection
  const toggleFY = (year: number) => {
    const newFY = selectedFY.includes(year)
      ? selectedFY.filter((y) => y !== year)
      : [...selectedFY, year];
    updateFilters({ fy: newFY.length > 0 ? newFY.join(",") : null });
  };

  // Toggle appropriation type
  const toggleApprop = (type: string) => {
    const newApprop = selectedApprop.includes(type)
      ? selectedApprop.filter((t) => t !== type)
      : [...selectedApprop, type];
    updateFilters({ approp: newApprop.length > 0 ? newApprop.join(",") : null });
  };

  // Check if any filters are active
  const hasActiveFilters =
    selectedFY.length > 0 ||
    selectedAgency !== "" ||
    selectedApprop.length > 0 ||
    searchQuery !== "";

  // Clear all filters
  const clearFilters = () => {
    setLocalQuery("");
    router.push("/budget", { scroll: false });
  };

  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-4">
        {/* Fiscal Year chips */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-500">FY:</span>
          <div className="flex gap-1">
            {options.fiscalYears.map((year) => (
              <button
                key={year}
                onClick={() => toggleFY(year)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  selectedFY.includes(year) || (selectedFY.length === 0 && year === options.fiscalYears[0])
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                FY{year.toString().slice(-2)}
              </button>
            ))}
          </div>
        </div>

        {/* Agency dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="agency" className="text-sm font-medium text-zinc-500">
            Agency:
          </label>
          <select
            id="agency"
            value={selectedAgency}
            onChange={(e) => updateFilters({ agency: e.target.value || null })}
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All Agencies</option>
            {options.agencies.map((agency) => (
              <option key={agency} value={agency}>
                {agency}
              </option>
            ))}
          </select>
        </div>

        {/* Appropriation Type chips */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-500">Type:</span>
          <div className="flex gap-1">
            {options.appropriationTypes.map((type) => (
              <button
                key={type}
                onClick={() => toggleApprop(type)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  selectedApprop.includes(type)
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="flex flex-1 items-center gap-2">
          <label htmlFor="search" className="text-sm font-medium text-zinc-500">
            Search:
          </label>
          <input
            id="search"
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Program element or name..."
            className="w-full max-w-xs rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
