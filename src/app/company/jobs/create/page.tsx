import { saveJobPost } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { Shell, TopNav, PageHeader, Card } from "@/components/ui";
import { JobPostForm } from "../parts";

export default async function CreateJobPage() {
  const { user, companyUser } = await requireCompanyUser({ include: { companyProfile: true } });
  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title="案件作成" />
        <Card className="mt-6"><JobPostForm action={saveJobPost} company={companyUser.companyProfile} /></Card>
      </div>
    </Shell>
  );
}
