"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface AgencyDataPoint {
  agency: string;
  totalAmount: number;
  programCount: number;
}

interface AgencyBarChartProps {
  data: AgencyDataPoint[];
  isLoading?: boolean;
  onAgencyClick?: (agency: string) => void;
}

function formatBillions(value: number): string {
  // Data is in thousands, convert to billions for display
  const billions = (value * 1000) / 1e9;
  if (billions >= 1) return `$${billions.toFixed(1)}B`;
  const millions = (value * 1000) / 1e6;
  return `$${millions.toFixed(0)}M`;
}

function formatTooltipValue(value: number): string {
  const realValue = value * 1000;
  if (realValue >= 1e9) return `$${(realValue / 1e9).toFixed(2)}B`;
  if (realValue >= 1e6) return `$${(realValue / 1e6).toFixed(1)}M`;
  return `$${realValue.toLocaleString()}`;
}

const COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#14B8A6", // teal
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#6B7280", // gray
  "#78716C", // stone
];

export function AgencyBarChart({ data, isLoading, onAgencyClick }: AgencyBarChartProps) {
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
        <p className="text-zinc-500">No agency data available</p>
      </div>
    );
  }

  // Format and sort data
  const chartData = data
    .map((d) => ({
      name: d.agency.length > 20 ? d.agency.slice(0, 20) + "..." : d.agency,
      fullName: d.agency,
      amount: d.totalAmount,
      programs: d.programCount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Budget by Agency
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value) => formatBillions(value)}
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            axisLine={{ stroke: "#4B5563" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#9CA3AF", fontSize: 11 }}
            axisLine={{ stroke: "#4B5563" }}
            width={75}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#F9FAFB",
            }}
            formatter={(value) => [formatTooltipValue(value as number), "Total Budget"]}
            labelFormatter={(label, payload) => {
              const item = payload?.[0]?.payload;
              return item?.fullName || label;
            }}
          />
          <Bar
            dataKey="amount"
            cursor={onAgencyClick ? "pointer" : "default"}
            onClick={(data) => onAgencyClick?.((data as unknown as { fullName: string }).fullName)}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {onAgencyClick && (
        <p className="mt-2 text-center text-xs text-zinc-500">
          Click a bar to filter by agency
        </p>
      )}
    </div>
  );
}
