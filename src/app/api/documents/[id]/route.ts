import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const document = await prisma.resumeDocument.findUnique({
    where: { id },
    include: {
      freelancerProfile: {
        include: {
          applications: {
            include: {
              jobPost: {
                include: { companyProfile: { include: { users: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!document) return new NextResponse("Not found", { status: 404 });

  const isOwner = document.freelancerProfile.userId === session.user.id;
  const isAppliedCompany = document.freelancerProfile.applications.some((application) =>
    application.jobPost.companyProfile.users.some((user) => user.userId === session.user.id),
  );
  if (!isOwner && !isAppliedCompany) return new NextResponse("Forbidden", { status: 403 });

  const blob = await get(document.fileUrl, { access: "private" });
  if (!blob) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(blob.stream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${encodeURIComponent(document.originalFilename)}"`,
    },
  });
}
