"use client";

interface BudgetMover {
  id: number;
  programElement: string | null;
  programName: string | null;
  fiscalYear: number;
  agency: string | null;
  amount: number | null;
  yoyChangeDollars: number | null;
  yoyChangePercent: number | null;
  trendDirection: string | null;
}

interface BudgetMoversCardsProps {
  gainers: BudgetMover[];
  losers: BudgetMover[];
  newPrograms: BudgetMover[];
  isLoading?: boolean;
  onViewAll?: (type: "gainers" | "losers" | "new") => void;
  onProgramClick?: (programElement: string) => void;
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  const absAmount = Math.abs(amount);
  // Amounts are in thousands
  const realAmount = absAmount * 1000;
  if (realAmount >= 1e9) return `$${(realAmount / 1e9).toFixed(1)}B`;
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

function truncateName(name: string | null, maxLength: number = 40): string {
  if (!name) return "Unnamed Program";
  // Remove common prefixes and suffixes for cleaner display
  let clean = name
    .replace(/UNCLASSIFIED.*$/, "")
    .replace(/R:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > maxLength) {
    return clean.slice(0, maxLength) + "...";
  }
  return clean || "Unnamed Program";
}

function MoverCard({
  title,
  items,
  type,
  onViewAll,
  onProgramClick,
}: {
  title: string;
  items: BudgetMover[];
  type: "gainers" | "losers" | "new";
  onViewAll?: () => void;
  onProgramClick?: (programElement: string) => void;
}) {
  const colorClass =
    type === "gainers" || type === "new"
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";

  const bgColorClass =
    type === "gainers" || type === "new"
      ? "bg-green-50 dark:bg-green-900/20"
      : "bg-red-50 dark:bg-red-900/20";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className={`flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700 ${bgColorClass}`}>
        <h3 className={`text-sm font-semibold ${colorClass}`}>{title}</h3>
        {onViewAll && items.length > 0 && (
          <button
            onClick={onViewAll}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            View All
          </button>
        )}
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No data available</p>
        ) : (
          items.slice(0, 5).map((item) => (
            <div
              key={item.id}
              onClick={() => item.programElement && onProgramClick?.(item.programElement)}
              className={`px-4 py-3 ${onProgramClick ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-zinc-500">{item.programElement}</p>
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {truncateName(item.programName)}
                  </p>
                  <p className="text-xs text-zinc-500">{item.agency || "-"}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${colorClass}`}>
                    {type === "new" ? "NEW" : formatPercent(item.yoyChangePercent)}
                  </p>
                  <p className="text-xs text-zinc-500">{formatCurrency(item.amount)}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function BudgetMoversCards({
  gainers,
  losers,
  newPrograms,
  isLoading,
  onViewAll,
  onProgramClick,
}: BudgetMoversCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-[300px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <MoverCard
        title="Top Gainers"
        items={gainers}
        type="gainers"
        onViewAll={() => onViewAll?.("gainers")}
        onProgramClick={onProgramClick}
      />
      <MoverCard
        title="Top Losers"
        items={losers}
        type="losers"
        onViewAll={() => onViewAll?.("losers")}
        onProgramClick={onProgramClick}
      />
      <MoverCard
        title="New Programs"
        items={newPrograms}
        type="new"
        onViewAll={() => onViewAll?.("new")}
        onProgramClick={onProgramClick}
      />
    </div>
  );
}
