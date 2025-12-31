import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const vehicles = await prisma.contractVehicle.findMany({
      orderBy: { taskOrderCount: "desc" },
    });

    const summary = {
      totalVehicles: vehicles.length,
      totalTaskOrders: vehicles.reduce((sum, v) => sum + (v.taskOrderCount || 0), 0),
      totalObligated: vehicles.reduce((sum, v) => sum + (v.totalObligated || 0), 0),
    };

    return NextResponse.json({ vehicles, summary });
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    return NextResponse.json({ error: "Failed to fetch vehicles" }, { status: 500 });
  }
}
