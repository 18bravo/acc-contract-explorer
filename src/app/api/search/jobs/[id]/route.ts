import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { error: "Invalid job ID" },
        { status: 400 }
      );
    }

    const job = await prisma.searchJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      query: job.query,
      status: job.status,
      internalCount: job.internalCount,
      externalCount: job.externalCount,
      newRecords: job.newRecords,
      externalResults: job.externalResults,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job status" },
      { status: 500 }
    );
  }
}
