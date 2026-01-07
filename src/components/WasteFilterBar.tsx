"use client";

import { useState } from "react";

interface WasteFilterBarProps {
  onFilterChange: (filters: WasteFilters) => void;
  initialFilters?: WasteFilters;
}

export interface WasteFilters {
  naics?: string;
  psc?: string;
  agency?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  flagCostGrowth?: boolean;
  flagUnderutilized?: boolean;
  flagOldContract?: boolean;
  flagHighMods?: boolean;
  flagPassThru?: boolean;
  flagVendorConc?: boolean;
}

const FLAG_OPTIONS = [
  { key: "flagCostGrowth", label: "Cost Growth >50%" },
  { key: "flagUnderutilized", label: "Underutilized Ceiling" },
  { key: "flagOldContract", label: ">5 Years Old" },
  { key: "flagHighMods", label: ">20 Modifications" },
  { key: "flagPassThru", label: ">70% Pass-Through" },
  { key: "flagVendorConc", label: "Vendor Concentration" },
] as const;

export function WasteFilterBar({ onFilterChange, initialFilters = {} }: WasteFilterBarProps) {
  const [filters, setFilters] = useState<WasteFilters>(initialFilters);
  const [naicsInput, setNaicsInput] = useState(initialFilters.naics || "");

  const updateFilter = (key: keyof WasteFilters, value: unknown) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleNaicsSubmit = () => {
    updateFilter("naics", naicsInput);
  };

  const toggleFlag = (key: keyof WasteFilters) => {
    updateFilter(key, !filters[key]);
  };

  const clearFilters = () => {
    setFilters({});
    setNaicsInput("");
    onFilterChange({});
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      {/* Top row: NAICS, Agency, Amount */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* NAICS Input */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">NAICS Code</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={naicsInput}
              onChange={(e) => setNaicsInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNaicsSubmit()}
              placeholder="e.g., 541511"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
            />
            <button
              onClick={handleNaicsSubmit}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Agency */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Agency</label>
          <input
            type="text"
            value={filters.agency || ""}
            onChange={(e) => updateFilter("agency", e.target.value)}
            placeholder="e.g., Army"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>

        {/* Min Amount */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Min Amount ($)</label>
          <input
            type="number"
            value={filters.minAmount || ""}
            onChange={(e) => updateFilter("minAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="100,000"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>

        {/* Max Amount */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Max Amount ($)</label>
          <input
            type="number"
            value={filters.maxAmount || ""}
            onChange={(e) => updateFilter("maxAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="No limit"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Flag toggles */}
      <div>
        <label className="block text-xs text-zinc-400 mb-2">Waste Flags</label>
        <div className="flex flex-wrap gap-2">
          {FLAG_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleFlag(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filters[key]
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear button */}
      {activeFilterCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={clearFilters}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Clear all filters ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}
