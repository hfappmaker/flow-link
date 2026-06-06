import { auth } from "@/lib/auth";
import { saveJobPost } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, PageHeader, Card } from "@/components/ui";
import { JobPostForm } from "../parts";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyUser = await prisma.companyUser.findUnique({ where: { userId: session!.user.id } });
  const job = await prisma.jobPost.findFirst({ where: { id, companyProfileId: companyUser!.companyProfileId } });
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title="案件編集" />
        <Card className="mt-6">{job ? <JobPostForm action={saveJobPost} job={job} /> : "案件が見つかりません。"}</Card>
      </div>
    </Shell>
  );
}
