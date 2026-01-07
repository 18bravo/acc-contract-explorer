"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TrendDataPoint {
  fiscalYear: number;
  totalAmount: number;
  programCount: number;
}

interface BudgetTrendChartProps {
  data: TrendDataPoint[];
  isLoading?: boolean;
}

function formatBillions(value: number): string {
  // Data is in thousands, convert to billions for display
  const billions = (value * 1000) / 1e9;
  return `$${billions.toFixed(1)}B`;
}

function formatTooltipValue(value: number): string {
  // Data is in thousands
  const realValue = value * 1000;
  if (realValue >= 1e9) return `$${(realValue / 1e9).toFixed(2)}B`;
  if (realValue >= 1e6) return `$${(realValue / 1e6).toFixed(1)}M`;
  return `$${realValue.toLocaleString()}`;
}

export function BudgetTrendChart({ data, isLoading }: BudgetTrendChartProps) {
  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-zinc-500">No trend data available</p>
      </div>
    );
  }

  // Format data for the chart
  const chartData = data.map((d) => ({
    name: `FY${d.fiscalYear.toString().slice(-2)}`,
    fiscalYear: d.fiscalYear,
    amount: d.totalAmount,
    programs: d.programCount,
  }));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Budget Trend Over Time
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            axisLine={{ stroke: "#4B5563" }}
          />
          <YAxis
            tickFormatter={(value) => formatBillions(value)}
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            axisLine={{ stroke: "#4B5563" }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#F9FAFB",
            }}
            formatter={(value, name) => {
              if (name === "amount") {
                return [formatTooltipValue(value as number), "Total Budget"];
              }
              return [value as number, "Programs"];
            }}
            labelFormatter={(label) => `Fiscal Year ${label}`}
          />
          <Legend
            wrapperStyle={{ paddingTop: "10px" }}
            formatter={(value) => (value === "amount" ? "Total Budget" : "Programs")}
          />
          <Line
            type="monotone"
            dataKey="amount"
            stroke="#EF4444"
            strokeWidth={2}
            dot={{ fill: "#EF4444", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: "#EF4444", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
