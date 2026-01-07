"use client";

interface WasteContract {
  id: number;
  piid: string;
  vendorName: string | null;
  awardDescription: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  awardDate: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  awardingAgency: string | null;
  overallScore: number | null;
  flags: {
    costGrowth: boolean;
    underutilized: boolean;
    oldContract: boolean;
    highMods: boolean;
    passThru: boolean;
    vendorConc: boolean;
    duplicate: boolean;
    highRate: boolean;
  } | null;
}

interface WasteContractTableProps {
  contracts: WasteContract[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onSelect: (id: number) => void;
  selectedId?: number;
}

const FLAG_LABELS: Record<string, string> = {
  costGrowth: "Growth",
  underutilized: "Unused",
  oldContract: "Old",
  highMods: "Mods",
  passThru: "Pass-Thru",
  vendorConc: "Vendor",
  duplicate: "Dupe",
  highRate: "Rate",
};

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-zinc-500";
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  return "text-green-500";
}

export function WasteContractTable({
  contracts,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
  selectedId,
}: WasteContractTableProps) {
  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-white"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortBy === column && (
          <span className="text-red-500">{sortOrder === "asc" ? "↑" : "↓"}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-zinc-900 border-b border-zinc-800">
          <tr>
            <SortHeader column="overallScore" label="Score" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Flags
            </th>
            <SortHeader column="vendorName" label="Vendor" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Description
            </th>
            <SortHeader column="obligatedAmount" label="Obligated" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Ceiling
            </th>
            <SortHeader column="awardDate" label="Award Date" />
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Agency
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {contracts.map((contract) => (
            <tr
              key={contract.id}
              onClick={() => onSelect(contract.id)}
              className={`cursor-pointer transition-colors ${
                selectedId === contract.id
                  ? "bg-zinc-800"
                  : "hover:bg-zinc-900"
              }`}
            >
              <td className="px-4 py-3">
                <span className={`font-mono font-bold ${getScoreColor(contract.overallScore)}`}>
                  {contract.overallScore !== null ? contract.overallScore.toFixed(0) : "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {contract.flags &&
                    Object.entries(contract.flags)
                      .filter(([, value]) => value)
                      .slice(0, 3)
                      .map(([key]) => (
                        <span
                          key={key}
                          className="px-1.5 py-0.5 text-xs bg-red-900/50 text-red-400 rounded"
                        >
                          {FLAG_LABELS[key] || key}
                        </span>
                      ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-white max-w-[200px] truncate">
                {contract.vendorName || "Unknown"}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 max-w-[300px] truncate">
                {contract.awardDescription || "—"}
              </td>
              <td className="px-4 py-3 text-sm text-white font-mono">
                {formatCurrency(contract.obligatedAmount)}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
                {formatCurrency(contract.awardCeiling)}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400">
                {contract.awardDate || "—"}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 max-w-[150px] truncate">
                {contract.awardingAgency || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {contracts.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No contracts found matching your filters
        </div>
      )}
    </div>
  );
}
