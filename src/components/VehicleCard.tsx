"use client";

interface VehicleCardProps {
  id: string;
  name: string;
  description: string | null;
  agency: string | null;
  taskOrderCount: number | null;
  totalObligated: number | null;
  isSelected?: boolean;
  onSelect: (id: string) => void;
}

function formatCurrency(amount: number | null): string {
  if (!amount) return "$0";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

const agencyColors: Record<string, string> = {
  Army: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  GSA: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  NASA: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  USACE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  NGB: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export function VehicleCard({
  id,
  name,
  description,
  agency,
  taskOrderCount,
  totalObligated,
  isSelected,
  onSelect,
}: VehicleCardProps) {
  const agencyColor = agency ? agencyColors[agency] || "bg-zinc-100 text-zinc-800" : "";

  return (
    <button
      onClick={() => onSelect(id)}
      className={`w-full rounded-lg border p-4 text-left transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</h3>
          {agency && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${agencyColor}`}>
              {agency}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {formatCurrency(totalObligated)}
          </p>
          <p className="text-sm text-zinc-500">{(taskOrderCount || 0).toLocaleString()} orders</p>
        </div>
      </div>
      {description && (
        <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      )}
    </button>
  );
}
