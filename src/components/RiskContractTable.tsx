"use client";

interface Contract {
  id: number;
  piid: string;
  vendorName: string | null;
  obligatedAmount: number | null;
  awardCeiling: number | null;
  pscCode: string | null;
  awardingAgency: string | null;
  riskScore: number | null;
  currentRatio: number | null;
  breachProbability: number | null;
  monthsToWarning: number | null;
  lifecycleStage: number | null;
  confidenceLevel: string | null;
}

interface RiskContractTableProps {
  contracts: Contract[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onSelect: (id: number) => void;
  selectedId?: number;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

function getRiskColor(score: number | null): string {
  if (score === null) return "text-zinc-500";
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  if (score >= 20) return "text-green-400";
  return "text-green-600";
}

function getConfidenceStyle(level: string | null): string {
  switch (level) {
    case "high":
      return "opacity-100";
    case "medium":
      return "opacity-75";
    default:
      return "opacity-50";
  }
}

export function RiskContractTable({
  contracts,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
  selectedId,
}: RiskContractTableProps) {
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
    <table className="w-full">
      <thead className="bg-zinc-900/50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Vendor / Contract
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            PSC
          </th>
          <SortHeader column="obligatedAmount" label="Obligated" />
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Ratio
          </th>
          <SortHeader column="riskScore" label="Risk Score" />
          <SortHeader column="breachProbability" label="Breach %" />
          <SortHeader column="monthsToWarning" label="Warning" />
          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Stage
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800">
        {contracts.map((contract) => (
          <tr
            key={contract.id}
            onClick={() => onSelect(contract.id)}
            className={`cursor-pointer hover:bg-zinc-900/50 transition-colors ${
              selectedId === contract.id ? "bg-zinc-900" : ""
            }`}
          >
            <td className="px-4 py-3">
              <div className="text-sm font-medium text-white truncate max-w-[200px]">
                {contract.vendorName || "Unknown"}
              </div>
              <div className="text-xs text-zinc-500 font-mono">{contract.piid}</div>
            </td>
            <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
              {contract.pscCode || "-"}
            </td>
            <td className="px-4 py-3 text-sm text-white font-mono">
              {contract.obligatedAmount ? formatCurrency(contract.obligatedAmount) : "-"}
            </td>
            <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
              {contract.currentRatio !== null
                ? `${(contract.currentRatio * 100).toFixed(0)}%`
                : "-"}
            </td>
            <td className={`px-4 py-3 text-sm font-mono font-bold ${getRiskColor(contract.riskScore)} ${getConfidenceStyle(contract.confidenceLevel)}`}>
              {contract.riskScore ?? "-"}
            </td>
            <td className={`px-4 py-3 text-sm font-mono ${
              contract.breachProbability !== null && contract.breachProbability > 50
                ? "text-red-400"
                : "text-zinc-400"
            }`}>
              {contract.breachProbability !== null
                ? `${contract.breachProbability.toFixed(0)}%`
                : "-"}
            </td>
            <td className={`px-4 py-3 text-sm font-mono ${
              contract.monthsToWarning !== null && contract.monthsToWarning < 12
                ? "text-orange-400"
                : "text-zinc-400"
            }`}>
              {contract.monthsToWarning !== null
                ? `${contract.monthsToWarning}mo`
                : "-"}
            </td>
            <td className="px-4 py-3">
              <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${contract.lifecycleStage || 0}%` }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
