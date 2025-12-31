import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const skip = (page - 1) * limit;

    // Filters
    const vehicleId = searchParams.get("vehicleId");
    const vendor = searchParams.get("vendor");
    const search = searchParams.get("search");
    const state = searchParams.get("state");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");

    // Sorting
    const sortBy = searchParams.get("sortBy") || "obligatedAmount";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build where clause
    const where: Prisma.TaskOrderWhereInput = {};

    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    if (vendor) {
      where.vendorName = { contains: vendor, mode: "insensitive" };
    }

    if (search) {
      where.OR = [
        { piid: { contains: search, mode: "insensitive" } },
        { vendorName: { contains: search, mode: "insensitive" } },
        { awardDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    if (state) {
      where.placeOfPerformanceState = state;
    }

    if (minAmount) {
      where.obligatedAmount = { ...where.obligatedAmount as object, gte: parseFloat(minAmount) };
    }

    if (maxAmount) {
      where.obligatedAmount = { ...where.obligatedAmount as object, lte: parseFloat(maxAmount) };
    }

    // Build orderBy
    const orderByField = ["obligatedAmount", "awardDate", "vendorName", "piid"].includes(sortBy)
      ? sortBy
      : "obligatedAmount";
    const orderBy = { [orderByField]: sortOrder as "asc" | "desc" };

    // Get total count
    const total = await prisma.taskOrder.count({ where });

    // Get paginated results
    const taskOrders = await prisma.taskOrder.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    });

    return NextResponse.json({
      taskOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching task orders:", error);
    return NextResponse.json({ error: "Failed to fetch task orders" }, { status: 500 });
  }
}
