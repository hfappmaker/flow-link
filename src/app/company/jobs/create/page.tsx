import { auth } from "@/lib/auth";
import { saveJobPost } from "@/lib/actions";
import { Shell, TopNav, PageHeader, Card } from "@/components/ui";
import { JobPostForm } from "../parts";

export default async function CreateJobPage() {
  const session = await auth();
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title="案件作成" />
        <Card className="mt-6"><JobPostForm action={saveJobPost} /></Card>
      </div>
    </Shell>
  );
}
