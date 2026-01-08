"use client";

import { useState, useEffect } from "react";

interface ContractDetail {
  contract: {
    id: number;
    piid: string;
    vendorName: string | null;
    awardDescription: string | null;
    obligatedAmount: number | null;
    awardCeiling: number | null;
    awardDate: string | null;
    periodOfPerformanceStart: string | null;
    periodOfPerformanceEnd: string | null;
    pscCode: string | null;
    pscDescription: string | null;
    naicsCode: string | null;
    awardingAgency: string | null;
  };
  riskScore: {
    riskScore: number;
    currentRatio: number;
    impliedVolatility: number;
    lifecycleStage: number;
    lifecycleMultiplier: number;
    expectedCostLow: number | null;
    expectedCostMid: number | null;
    expectedCostHigh: number | null;
    ceilingBreachProb: number;
    monthsToWarning: number | null;
    confidenceLevel: string;
    calculatedAt: string;
  } | null;
  observations: Array<{
    date: string;
    ceiling: number;
    obligation: number;
    ratio: number;
  }>;
  volatilityParameter: {
    pscCode: string;
    agencyCode: string | null;
    sigma: number;
    observationCount: number;
    confidenceLevel: string;
  } | null;
  similarContracts: Array<{
    id: number;
    piid: string;
    vendorName: string | null;
    riskScore: number | null;
    breachProbability: number | null;
  }>;
}

interface RiskContractDetailProps {
  contractId: number | null;
  onClose: () => void;
  onSelectRelated: (id: number) => void;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

function getRiskColor(score: number): string {
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  if (score >= 20) return "text-green-400";
  return "text-green-600";
}

export function RiskContractDetail({
  contractId,
  onClose,
  onSelectRelated,
}: RiskContractDetailProps) {
  const [data, setData] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "comparison">("overview");

  useEffect(() => {
    if (!contractId) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch(`/api/risk/contracts/${contractId}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [contractId]);

  if (!contractId) return null;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-[500px] bg-zinc-950 border-l border-zinc-800 transform transition-transform duration-300 ${
        contractId ? "translate-x-0" : "translate-x-full"
      } overflow-hidden flex flex-col z-50`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-white">Contract Risk Detail</h2>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-500">Loading...</div>
        </div>
      ) : data ? (
        <>
          {/* Contract Header */}
          <div className="p-4 border-b border-zinc-800">
            <div className="text-white font-medium">{data.contract.vendorName || "Unknown Vendor"}</div>
            <div className="text-sm text-zinc-500 font-mono">{data.contract.piid}</div>
            {data.contract.awardDescription && (
              <div className="text-sm text-zinc-400 mt-2 line-clamp-2">
                {data.contract.awardDescription}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            {(["overview", "history", "comparison"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 text-sm capitalize ${
                  activeTab === tab
                    ? "text-white border-b-2 border-red-500"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "overview" && data.riskScore && (
              <>
                {/* Risk Score */}
                <div className="bg-zinc-900 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Risk Score</span>
                    <span className={`text-3xl font-bold ${getRiskColor(data.riskScore.riskScore)}`}>
                      {data.riskScore.riskScore}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Confidence: {data.riskScore.confidenceLevel}
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Current Ratio</div>
                    <div className="text-lg text-white font-mono">
                      {(data.riskScore.currentRatio * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Volatility (σ)</div>
                    <div className="text-lg text-white font-mono">
                      {(data.riskScore.impliedVolatility * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Breach Probability</div>
                    <div className={`text-lg font-mono ${
                      data.riskScore.ceilingBreachProb > 50 ? "text-red-400" : "text-white"
                    }`}>
                      {data.riskScore.ceilingBreachProb.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Warning In</div>
                    <div className={`text-lg font-mono ${
                      data.riskScore.monthsToWarning !== null && data.riskScore.monthsToWarning < 12
                        ? "text-orange-400"
                        : "text-white"
                    }`}>
                      {data.riskScore.monthsToWarning !== null
                        ? `${data.riskScore.monthsToWarning} mo`
                        : "N/A"}
                    </div>
                  </div>
                </div>

                {/* Expected Cost Range */}
                {data.riskScore.expectedCostLow && data.riskScore.expectedCostHigh && (
                  <div className="bg-zinc-900 rounded-lg p-4">
                    <div className="text-xs text-zinc-500 mb-2">Expected Cost at Completion</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400">
                        {formatCurrency(data.riskScore.expectedCostLow)}
                      </span>
                      <span className="text-white font-medium">
                        {data.riskScore.expectedCostMid && formatCurrency(data.riskScore.expectedCostMid)}
                      </span>
                      <span className="text-red-400">
                        {formatCurrency(data.riskScore.expectedCostHigh)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                      <span>10th %ile</span>
                      <span>50th %ile</span>
                      <span>90th %ile</span>
                    </div>
                  </div>
                )}

                {/* Lifecycle */}
                <div className="bg-zinc-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">Lifecycle Stage</span>
                    <span className="text-sm text-white">{data.riskScore.lifecycleStage}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${data.riskScore.lifecycleStage}%` }}
                    />
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">
                    Multiplier: {data.riskScore.lifecycleMultiplier.toFixed(2)}x
                  </div>
                </div>
              </>
            )}

            {activeTab === "history" && (
              <>
                <div className="text-sm text-zinc-400 mb-2">
                  Ceiling-to-Obligation Ratio Over Time
                </div>
                {data.observations.length > 0 ? (
                  <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
                    {data.observations.map((obs, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500 font-mono">{obs.date}</span>
                        <span className="text-white font-mono">
                          {(obs.ratio * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">No observations recorded</div>
                )}

                {data.volatilityParameter && (
                  <div className="bg-zinc-900 rounded-lg p-4 mt-4">
                    <div className="text-xs text-zinc-500 mb-2">Applied Volatility Parameter</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">PSC:</span>
                        <span className="text-white font-mono">{data.volatilityParameter.pscCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">σ:</span>
                        <span className="text-white font-mono">
                          {(data.volatilityParameter.sigma * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Based on:</span>
                        <span className="text-white">{data.volatilityParameter.observationCount} contracts</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Confidence:</span>
                        <span className="text-white capitalize">{data.volatilityParameter.confidenceLevel}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "comparison" && (
              <>
                <div className="text-sm text-zinc-400 mb-2">
                  Similar Contracts (Same PSC)
                </div>
                {data.similarContracts.length > 0 ? (
                  <div className="space-y-2">
                    {data.similarContracts.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => onSelectRelated(c.id)}
                        className="bg-zinc-900 rounded-lg p-3 cursor-pointer hover:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-white">{c.vendorName || "Unknown"}</div>
                            <div className="text-xs text-zinc-500 font-mono">{c.piid}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${getRiskColor(c.riskScore || 0)}`}>
                              {c.riskScore ?? "-"}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {c.breachProbability?.toFixed(0)}% breach
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">No similar contracts found</div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-500">Failed to load contract</div>
        </div>
      )}
    </div>
  );
}
