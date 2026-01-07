"use client";

import { useEffect, useState } from "react";

interface ContractDetail {
  contract: {
    id: number;
    piid: string;
    parentIdvPiid: string | null;
    awardDescription: string | null;
    awardType: string | null;
    awardDate: string | null;
    periodOfPerformanceStart: string | null;
    periodOfPerformanceEnd: string | null;
    baseValue: number | null;
    currentValue: number | null;
    obligatedAmount: number | null;
    awardCeiling: number | null;
    naicsCode: string | null;
    naicsDescription: string | null;
    pscCode: string | null;
    pscDescription: string | null;
    vendorName: string | null;
    vendorUei: string | null;
    awardingAgency: string | null;
    awardingSubAgency: string | null;
    fundingAgency: string | null;
    contractingOfficeName: string | null;
    placeOfPerformanceState: string | null;
  };
  wasteScore: {
    costGrowthPct: number | null;
    ceilingUtilization: number | null;
    contractAgeDays: number | null;
    modificationCount: number | null;
    passThruRatio: number | null;
    vendorConcentration: number | null;
    duplicateRisk: number | null;
    impliedHourlyRate: number | null;
    overallScore: number | null;
    flags: Record<string, boolean>;
  } | null;
  modifications: Array<{
    id: number;
    modificationNumber: string | null;
    actionDate: string | null;
    actionType: string | null;
    description: string | null;
    obligatedChange: number | null;
    obligatedTotal: number | null;
  }>;
  subawards: {
    total: number;
    passThruPercent: number | null;
    items: Array<{
      id: number;
      subawardNumber: string | null;
      subawardAmount: number | null;
      subcontractorName: string | null;
      description: string | null;
      actionDate: string | null;
    }>;
  };
  relatedContracts: Array<{
    id: number;
    piid: string;
    vendorName: string | null;
    obligatedAmount: number | null;
    overallScore: number | null;
    relationshipType: string;
  }>;
}

interface WasteContractDetailProps {
  contractId: number | null;
  onClose: () => void;
  onSelectRelated: (id: number) => void;
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ScoreIndicator({ value, threshold, inverted = false, label }: {
  value: number | null;
  threshold: number;
  inverted?: boolean;
  label: string;
}) {
  if (value === null) return null;

  const isFlagged = inverted ? value < threshold : value > threshold;
  const color = isFlagged ? "text-red-500" : "text-green-500";
  const bgColor = isFlagged ? "bg-red-900/30" : "bg-green-900/30";

  return (
    <div className={`p-3 rounded-lg ${bgColor}`}>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>
        {typeof value === "number" ? value.toFixed(1) : value}
        {label.includes("%") ? "%" : ""}
      </div>
    </div>
  );
}

export function WasteContractDetail({ contractId, onClose, onSelectRelated }: WasteContractDetailProps) {
  const [data, setData] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"scores" | "mods" | "subs" | "related">("scores");

  useEffect(() => {
    if (!contractId) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch(`/api/waste/contracts/${contractId}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [contractId]);

  if (!contractId) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-zinc-950 border-l border-zinc-800 shadow-xl overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Contract Detail</h2>
          {data && (
            <p className="text-sm text-zinc-400 font-mono">{data.contract.piid}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-zinc-800 rounded-lg"
        >
          <span className="text-zinc-400 text-xl">×</span>
        </button>
      </div>

      {loading && (
        <div className="p-8 text-center text-zinc-500">Loading...</div>
      )}

      {data && !loading && (
        <div className="p-4 space-y-6">
          {/* Overview */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-400">Overview</h3>
            <p className="text-sm text-white">{data.contract.awardDescription || "No description"}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Vendor:</span>
                <span className="text-white ml-2">{data.contract.vendorName || "Unknown"}</span>
              </div>
              <div>
                <span className="text-zinc-500">Agency:</span>
                <span className="text-white ml-2">{data.contract.awardingAgency || "Unknown"}</span>
              </div>
              <div>
                <span className="text-zinc-500">Obligated:</span>
                <span className="text-white ml-2">{formatCurrency(data.contract.obligatedAmount)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Ceiling:</span>
                <span className="text-white ml-2">{formatCurrency(data.contract.awardCeiling)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Award Date:</span>
                <span className="text-white ml-2">{data.contract.awardDate || "—"}</span>
              </div>
              <div>
                <span className="text-zinc-500">NAICS:</span>
                <span className="text-white ml-2">{data.contract.naicsCode || "—"}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-zinc-800">
            <div className="flex gap-4">
              {(["scores", "mods", "subs", "related"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-red-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-white"
                  }`}
                >
                  {tab === "scores" && "Waste Scores"}
                  {tab === "mods" && `Mods (${data.modifications.length})`}
                  {tab === "subs" && `Subs (${data.subawards.items.length})`}
                  {tab === "related" && `Related (${data.relatedContracts.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "scores" && data.wasteScore && (
            <div className="grid grid-cols-2 gap-3">
              <ScoreIndicator
                value={data.wasteScore.costGrowthPct}
                threshold={50}
                label="Cost Growth %"
              />
              <ScoreIndicator
                value={data.wasteScore.ceilingUtilization}
                threshold={20}
                inverted
                label="Ceiling Used %"
              />
              <ScoreIndicator
                value={data.wasteScore.contractAgeDays ? data.wasteScore.contractAgeDays / 365 : null}
                threshold={5}
                label="Age (Years)"
              />
              <ScoreIndicator
                value={data.wasteScore.modificationCount}
                threshold={20}
                label="Modifications"
              />
              <ScoreIndicator
                value={data.wasteScore.passThruRatio}
                threshold={70}
                label="Pass-Through %"
              />
              <ScoreIndicator
                value={data.wasteScore.vendorConcentration}
                threshold={5}
                label="Vendor Contracts"
              />
            </div>
          )}

          {activeTab === "mods" && (
            <div className="space-y-2">
              {data.modifications.length === 0 ? (
                <p className="text-zinc-500 text-sm">No modifications recorded</p>
              ) : (
                data.modifications.map((mod) => (
                  <div key={mod.id} className="p-3 bg-zinc-900 rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">{mod.actionDate || "Unknown date"}</span>
                      <span className={mod.obligatedChange && mod.obligatedChange > 0 ? "text-red-400" : "text-green-400"}>
                        {mod.obligatedChange ? formatCurrency(mod.obligatedChange) : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 truncate">{mod.description || "No description"}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "subs" && (
            <div className="space-y-2">
              <div className="p-3 bg-zinc-900 rounded-lg">
                <div className="text-xs text-zinc-400">Total Subawarded</div>
                <div className="text-lg font-bold text-white">{formatCurrency(data.subawards.total)}</div>
                {data.subawards.passThruPercent !== null && (
                  <div className="text-xs text-zinc-500">
                    {data.subawards.passThruPercent.toFixed(1)}% of obligated amount
                  </div>
                )}
              </div>
              {data.subawards.items.map((sub) => (
                <div key={sub.id} className="p-3 bg-zinc-900 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-white">{sub.subcontractorName || "Unknown"}</span>
                    <span className="text-zinc-400">{formatCurrency(sub.subawardAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "related" && (
            <div className="space-y-2">
              {data.relatedContracts.length === 0 ? (
                <p className="text-zinc-500 text-sm">No related contracts found</p>
              ) : (
                data.relatedContracts.map((rel) => (
                  <div
                    key={rel.id}
                    onClick={() => onSelectRelated(rel.id)}
                    className="p-3 bg-zinc-900 rounded-lg cursor-pointer hover:bg-zinc-800"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-white">{rel.vendorName || "Unknown"}</span>
                      <span className="text-zinc-400">{formatCurrency(rel.obligatedAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-zinc-500 font-mono">{rel.piid}</span>
                      <span className={rel.relationshipType === "same_vendor" ? "text-blue-400" : "text-purple-400"}>
                        {rel.relationshipType === "same_vendor" ? "Same Vendor" : "Same Office"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
