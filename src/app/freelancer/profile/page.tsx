import { auth } from "@/lib/auth";
import { saveFreelancerProfile } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, PageHeader, Card, TextField, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FreelancerProfilePage() {
  const session = await auth();
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId: session!.user.id } });
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="プロフィール編集" />
        <Card className="mt-6">
          <form action={saveFreelancerProfile} className="grid gap-4 md:grid-cols-2">
            <TextField name="fullName" label="氏名" defaultValue={profile?.fullName} required />
            <TextField name="desiredOccupation" label="希望職種" defaultValue={profile?.desiredOccupation} />
            <TextField name="yearsOfExperience" label="経験年数" type="number" defaultValue={profile?.yearsOfExperience} />
            <TextField name="desiredRate" label="希望単価" defaultValue={profile?.desiredRate} />
            <TextField name="availability" label="稼働条件" defaultValue={profile?.availability} />
            <TextField name="availableFrom" label="稼働開始時期" defaultValue={profile?.availableFrom} />
            <TextField name="preferredLocation" label="勤務地希望" defaultValue={profile?.preferredLocation} />
            <TextField name="remotePreference" label="リモート希望" defaultValue={profile?.remotePreference} />
            <div className="md:col-span-2">
              <TextArea name="skills" label="スキル" defaultValue={profile?.skills} />
            </div>
            <button className="btn btn-primary md:col-span-2" type="submit">保存</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
