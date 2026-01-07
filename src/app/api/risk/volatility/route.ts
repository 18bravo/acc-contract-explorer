import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const pscCode = searchParams.get("psc");
    const agency = searchParams.get("agency");
    const minConfidence = searchParams.get("minConfidence");

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (pscCode) {
      where.pscCode = { startsWith: pscCode };
    }
    if (agency) {
      where.agencyCode = agency;
    }
    if (minConfidence) {
      const levels: Record<string, string[]> = {
        high: ["high"],
        medium: ["high", "medium"],
        low: ["high", "medium", "low"],
      };
      if (levels[minConfidence]) {
        where.confidenceLevel = { in: levels[minConfidence] };
      }
    }

    const parameters = await prisma.volatilityParameter.findMany({
      where,
      orderBy: [
        { sigma: "desc" },
        { observationCount: "desc" },
      ],
    });

    return NextResponse.json({
      parameters: parameters.map((p) => ({
        pscCode: p.pscCode,
        agencyCode: p.agencyCode,
        sigma: Number(p.sigma),
        sigmaPercent: `${(Number(p.sigma) * 100).toFixed(1)}%`,
        observationCount: p.observationCount,
        confidenceLevel: p.confidenceLevel,
        lastCalculated: p.lastCalculated.toISOString(),
      })),
      total: parameters.length,
    });
  } catch (error) {
    console.error("Volatility API error:", error);
    return NextResponse.json({ error: "Failed to fetch parameters" }, { status: 500 });
  }
}
