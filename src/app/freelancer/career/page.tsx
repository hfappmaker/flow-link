import { saveCareerHistory } from "@/lib/actions";
import { requireFreelancerProfile } from "@/lib/page-guards";
import { Shell, TopNav, PageHeader, Card, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CareerPage() {
  const { user, profile } = await requireFreelancerProfile({
    currentPath: "/freelancer/career",
    include: { careerHistory: true },
  });
  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="職務経歴フォーム" />
        <Card className="mt-6">
          <form action={saveCareerHistory} className="grid gap-4">
            <TextArea name="summary" label="要約" defaultValue={profile?.careerHistory?.summary} />
            <TextArea name="workExperiences" label="職務経験" defaultValue={profile?.careerHistory?.workExperiences} />
            <TextArea name="projects" label="プロジェクト" defaultValue={profile?.careerHistory?.projects} />
            <TextArea name="certifications" label="資格" defaultValue={profile?.careerHistory?.certifications} />
            <TextArea name="education" label="学歴" defaultValue={profile?.careerHistory?.education} />
            <button className="btn btn-primary" type="submit">保存</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
