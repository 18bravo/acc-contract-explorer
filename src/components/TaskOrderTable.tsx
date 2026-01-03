"use client";

import { Fragment, useState } from "react";

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

interface TaskOrderTableProps {
  taskOrders: TaskOrder[];
  isLoading?: boolean;
}

function formatCurrency(amount: number | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TaskOrderTable({ taskOrders, isLoading }: TaskOrderTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (taskOrders.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500">
        No task orders found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
          <tr>
            <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-300">PIID</th>
            <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-300">Vendor</th>
            <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-300">Vehicle</th>
            <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-300">Award Date</th>
            <th className="px-4 py-3 text-right font-semibold text-zinc-600 dark:text-zinc-300">
              Obligated
            </th>
            <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-300">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {taskOrders.map((order) => (
            <Fragment key={order.id}>
              <tr
                onClick={() => setExpandedRow(expandedRow === order.id ? null : order.id)}
                className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                    {order.piid}
                  </span>
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {order.vendorName || "-"}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{order.vehicleName}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {formatDate(order.awardDate)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(order.obligatedAmount)}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {order.placeOfPerformanceState || "-"}
                </td>
              </tr>
              {expandedRow === order.id && (
                <tr>
                  <td colSpan={6} className="bg-zinc-50 px-4 py-4 dark:bg-zinc-800/50">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
                          Award Description
                        </h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {order.awardDescription || "No description available"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Parent IDV:</span>
                          <span className="font-mono text-xs">{order.parentIdvPiid || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Potential Value:</span>
                          <span>{formatCurrency(order.potentialValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">NAICS:</span>
                          <span>{order.naicsCode || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">PSC:</span>
                          <span>{order.pscCode || "-"}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
