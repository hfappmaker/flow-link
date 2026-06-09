import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getResumeDocumentReadAccess } from "@/lib/document-access";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const access = await getResumeDocumentReadAccess(prisma, {
    documentId: id,
    userId: session?.user?.id,
  });
  switch (access.status) {
    case "unauthenticated":
      return new NextResponse("Unauthorized", { status: 401 });
    case "not_found":
      return new NextResponse("Not found", { status: 404 });
    case "forbidden":
      return new NextResponse("Forbidden", { status: 403 });
  }

  const blob = await get(access.document.fileUrl, { access: "private" });
  if (!blob) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(blob.stream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${encodeURIComponent(access.document.originalFilename)}"`,
    },
  });
}
