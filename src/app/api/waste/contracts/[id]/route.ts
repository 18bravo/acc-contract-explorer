import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contractId = parseInt(id);

    if (isNaN(contractId)) {
      return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
    }

    const contract = await prisma.serviceContract.findUnique({
      where: { id: contractId },
      include: {
        wasteScore: true,
        modifications: {
          orderBy: { actionDate: "desc" },
        },
        subawards: {
          orderBy: { subawardAmount: "desc" },
        },
        contractingOffice: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Fetch related contracts (same vendor in same org)
    const relatedContracts = await prisma.serviceContract.findMany({
      where: {
        OR: [
          // Same vendor
          contract.vendorUei
            ? { vendorUei: contract.vendorUei, id: { not: contractId } }
            : { id: -1 }, // no match
          // Same org, similar description
          contract.contractingOfficeId
            ? { contractingOfficeId: contract.contractingOfficeId, id: { not: contractId } }
            : { id: -1 },
        ],
      },
      include: { wasteScore: true },
      take: 10,
      orderBy: { obligatedAmount: "desc" },
    });

    // Calculate subaward totals
    const subawardTotal = contract.subawards.reduce(
      (sum, sub) => sum + (sub.subawardAmount ? Number(sub.subawardAmount) : 0),
      0
    );

    return NextResponse.json({
      contract: {
        id: contract.id,
        piid: contract.piid,
        parentIdvPiid: contract.parentIdvPiid,
        awardDescription: contract.awardDescription,
        awardType: contract.awardType,
        contractType: contract.contractType,
        awardDate: contract.awardDate?.toISOString().split("T")[0] || null,
        periodOfPerformanceStart: contract.periodOfPerformanceStart?.toISOString().split("T")[0] || null,
        periodOfPerformanceEnd: contract.periodOfPerformanceEnd?.toISOString().split("T")[0] || null,
        baseValue: contract.baseValue ? Number(contract.baseValue) : null,
        currentValue: contract.currentValue ? Number(contract.currentValue) : null,
        obligatedAmount: contract.obligatedAmount ? Number(contract.obligatedAmount) : null,
        awardCeiling: contract.awardCeiling ? Number(contract.awardCeiling) : null,
        naicsCode: contract.naicsCode,
        naicsDescription: contract.naicsDescription,
        pscCode: contract.pscCode,
        pscDescription: contract.pscDescription,
        vendorName: contract.vendorName,
        vendorUei: contract.vendorUei,
        vendorCageCode: contract.vendorCageCode,
        awardingAgency: contract.awardingAgency,
        awardingSubAgency: contract.awardingSubAgency,
        fundingAgency: contract.fundingAgency,
        contractingOfficeName: contract.contractingOfficeName,
        placeOfPerformanceState: contract.placeOfPerformanceState,
      },
      wasteScore: contract.wasteScore
        ? {
            costGrowthPct: contract.wasteScore.costGrowthPct ? Number(contract.wasteScore.costGrowthPct) : null,
            ceilingUtilization: contract.wasteScore.ceilingUtilization ? Number(contract.wasteScore.ceilingUtilization) : null,
            contractAgeDays: contract.wasteScore.contractAgeDays,
            modificationCount: contract.wasteScore.modificationCount,
            passThruRatio: contract.wasteScore.passThruRatio ? Number(contract.wasteScore.passThruRatio) : null,
            vendorConcentration: contract.wasteScore.vendorConcentration,
            duplicateRisk: contract.wasteScore.duplicateRisk ? Number(contract.wasteScore.duplicateRisk) : null,
            impliedHourlyRate: contract.wasteScore.impliedHourlyRate ? Number(contract.wasteScore.impliedHourlyRate) : null,
            overallScore: contract.wasteScore.overallScore ? Number(contract.wasteScore.overallScore) : null,
            flags: {
              costGrowth: contract.wasteScore.flagCostGrowth,
              underutilized: contract.wasteScore.flagUnderutilized,
              oldContract: contract.wasteScore.flagOldContract,
              highMods: contract.wasteScore.flagHighMods,
              passThru: contract.wasteScore.flagPassThru,
              vendorConc: contract.wasteScore.flagVendorConc,
              duplicate: contract.wasteScore.flagDuplicate,
              highRate: contract.wasteScore.flagHighRate,
            },
            calculatedAt: contract.wasteScore.calculatedAt?.toISOString() || null,
          }
        : null,
      modifications: contract.modifications.map((mod) => ({
        id: mod.id,
        modificationNumber: mod.modificationNumber,
        actionDate: mod.actionDate?.toISOString().split("T")[0] || null,
        actionType: mod.actionType,
        description: mod.description,
        obligatedChange: mod.obligatedChange ? Number(mod.obligatedChange) : null,
        obligatedTotal: mod.obligatedTotal ? Number(mod.obligatedTotal) : null,
      })),
      subawards: {
        total: subawardTotal,
        passThruPercent: contract.obligatedAmount && Number(contract.obligatedAmount) > 0
          ? (subawardTotal / Number(contract.obligatedAmount)) * 100
          : null,
        items: contract.subawards.map((sub) => ({
          id: sub.id,
          subawardNumber: sub.subawardNumber,
          subawardAmount: sub.subawardAmount ? Number(sub.subawardAmount) : null,
          subcontractorName: sub.subcontractorName,
          subcontractorUei: sub.subcontractorUei,
          description: sub.description,
          actionDate: sub.actionDate?.toISOString().split("T")[0] || null,
        })),
      },
      organization: contract.contractingOffice
        ? {
            id: contract.contractingOffice.id,
            name: contract.contractingOffice.name,
            code: contract.contractingOffice.code,
            level: contract.contractingOffice.level,
            parent: contract.contractingOffice.parent
              ? {
                  id: contract.contractingOffice.parent.id,
                  name: contract.contractingOffice.parent.name,
                  code: contract.contractingOffice.parent.code,
                }
              : null,
          }
        : null,
      relatedContracts: relatedContracts.map((c) => ({
        id: c.id,
        piid: c.piid,
        vendorName: c.vendorName,
        awardDescription: c.awardDescription,
        obligatedAmount: c.obligatedAmount ? Number(c.obligatedAmount) : null,
        overallScore: c.wasteScore?.overallScore ? Number(c.wasteScore.overallScore) : null,
        relationshipType: c.vendorUei === contract.vendorUei ? "same_vendor" : "same_org",
      })),
    });
  } catch (error) {
    console.error("Contract detail error:", error);
    return NextResponse.json({ error: "Failed to fetch contract details" }, { status: 500 });
  }
}
