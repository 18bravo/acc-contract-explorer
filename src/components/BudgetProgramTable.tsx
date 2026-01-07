"use client";

import { useState } from "react";

interface BudgetProgram {
  id: number;
  programElement: string | null;
  programName: string | null;
  fiscalYear: number;
  agency: string | null;
  appropriationType: string | null;
  amount: number | null;
  yoyChangeDollars: number | null;
  yoyChangePercent: number | null;
  fiveYearCagr: number | null;
  trendDirection: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface BudgetProgramTableProps {
  programs: BudgetProgram[];
  pagination: PaginationData;
  isLoading?: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onPageChange: (page: number) => void;
  onExport?: () => void;
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  const realAmount = amount * 1000; // Data is in thousands
  if (realAmount >= 1e9) return `$${(realAmount / 1e9).toFixed(2)}B`;
  if (realAmount >= 1e6) return `$${(realAmount / 1e6).toFixed(1)}M`;
  if (realAmount >= 1e3) return `$${(realAmount / 1e3).toFixed(0)}K`;
  return `$${realAmount.toLocaleString()}`;
}

function formatPercent(percent: number | null): string {
  if (percent === null || percent === undefined) return "-";
  const sign = percent >= 0 ? "+" : "";
  if (Math.abs(percent) >= 1000) return `${sign}${(percent / 100).toFixed(0)}x`;
  return `${sign}${percent.toFixed(1)}%`;
}

function formatChangeDollars(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  const sign = amount >= 0 ? "+" : "";
  const realAmount = amount * 1000;
  if (Math.abs(realAmount) >= 1e9) return `${sign}$${(realAmount / 1e9).toFixed(2)}B`;
  if (Math.abs(realAmount) >= 1e6) return `${sign}$${(realAmount / 1e6).toFixed(1)}M`;
  if (Math.abs(realAmount) >= 1e3) return `${sign}$${(realAmount / 1e3).toFixed(0)}K`;
  return `${sign}$${realAmount.toLocaleString()}`;
}

function TrendIcon({ direction }: { direction: string | null }) {
  switch (direction) {
    case "up":
      return <span className="text-green-600 dark:text-green-400">&#9650;</span>;
    case "down":
      return <span className="text-red-600 dark:text-red-400">&#9660;</span>;
    case "flat":
      return <span className="text-zinc-400">&#9644;</span>;
    case "new":
      return <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">NEW</span>;
    case "terminated":
      return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">END</span>;
    default:
      return <span className="text-zinc-400">-</span>;
  }
}

function SortHeader({
  label,
  column,
  currentSort,
  currentOrder,
  onSort,
  align = "left",
}: {
  label: string;
  column: string;
  currentSort: string;
  currentOrder: "asc" | "desc";
  onSort: (column: string) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort === column;

  return (
    <th
      className={`cursor-pointer px-4 py-3 text-xs font-semibold uppercase text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {label}
        {isActive && (
          <span className="text-red-500">
            {currentOrder === "asc" ? "▲" : "▼"}
          </span>
        )}
      </div>
    </th>
  );
}

function truncateName(name: string | null, maxLength: number = 50): string {
  if (!name) return "-";
  let clean = name
    .replace(/UNCLASSIFIED.*$/, "")
    .replace(/R:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > maxLength) {
    return clean.slice(0, maxLength) + "...";
  }
  return clean || "-";
}

export function BudgetProgramTable({
  programs,
  pagination,
  isLoading,
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
  onExport,
}: BudgetProgramTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          All Programs
          <span className="ml-2 text-xs font-normal text-zinc-500">
            ({pagination.total.toLocaleString()} total)
          </span>
        </h3>
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
            <tr>
              <SortHeader label="PE" column="programElement" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
              <SortHeader label="Program Name" column="programName" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
              <SortHeader label="Agency" column="agency" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
              <SortHeader label="Type" column="appropriationType" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
              <SortHeader label="Amount" column="amount" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} align="right" />
              <SortHeader label="Change ($)" column="yoyChangeDollars" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} align="right" />
              <SortHeader label="Change (%)" column="yoyChangePercent" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} align="right" />
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-zinc-500">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {programs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  No programs found matching your filters
                </td>
              </tr>
            ) : (
              programs.map((program) => (
                <tr
                  key={program.id}
                  onClick={() => setExpandedRow(expandedRow === program.id ? null : program.id)}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {program.programElement || "-"}
                  </td>
                  <td className="max-w-[250px] px-4 py-3">
                    <span className="block truncate text-zinc-900 dark:text-zinc-100" title={program.programName || ""}>
                      {truncateName(program.programName)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {program.agency || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {program.appropriationType || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(program.amount)}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                    (program.yoyChangeDollars || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {formatChangeDollars(program.yoyChangeDollars)}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                    (program.yoyChangePercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {formatPercent(program.yoyChangePercent)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <TrendIcon direction={program.trendDirection} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="text-sm text-zinc-500">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total.toLocaleString()} programs
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
