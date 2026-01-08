"use client";

import { useState } from "react";

export interface RiskFilters {
  psc?: string;
  agency?: string;
  minRiskScore?: number;
  maxRiskScore?: number;
  confidence?: string;
  lifecycle?: string;
}

interface RiskFilterBarProps {
  onFilterChange: (filters: RiskFilters) => void;
}

export function RiskFilterBar({ onFilterChange }: RiskFilterBarProps) {
  const [filters, setFilters] = useState<RiskFilters>({});

  const updateFilter = (key: keyof RiskFilters, value: string | number | undefined) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  const hasFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      {/* PSC Code */}
      <input
        type="text"
        placeholder="PSC Code"
        value={filters.psc || ""}
        onChange={(e) => updateFilter("psc", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-28"
      />

      {/* Agency */}
      <input
        type="text"
        placeholder="Agency"
        value={filters.agency || ""}
        onChange={(e) => updateFilter("agency", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-40"
      />

      {/* Risk Score Range */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="Min"
          value={filters.minRiskScore || ""}
          onChange={(e) => updateFilter("minRiskScore", e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-16"
          min={0}
          max={100}
        />
        <span className="text-zinc-500">-</span>
        <input
          type="number"
          placeholder="Max"
          value={filters.maxRiskScore || ""}
          onChange={(e) => updateFilter("maxRiskScore", e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 w-16"
          min={0}
          max={100}
        />
        <span className="text-xs text-zinc-500">score</span>
      </div>

      {/* Confidence Level */}
      <select
        value={filters.confidence || ""}
        onChange={(e) => updateFilter("confidence", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white"
      >
        <option value="">All Confidence</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Lifecycle Stage */}
      <select
        value={filters.lifecycle || ""}
        onChange={(e) => updateFilter("lifecycle", e.target.value)}
        className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white"
      >
        <option value="">All Stages</option>
        <option value="early">Early (0-25%)</option>
        <option value="mid">Mid (25-75%)</option>
        <option value="late">Late (75-100%)</option>
      </select>

      {/* Clear button */}
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
