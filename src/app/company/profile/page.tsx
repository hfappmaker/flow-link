import { saveCompanyProfile } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { Shell, TopNav, PageHeader, Card, TextField, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyProfilePage() {
  const { user, companyUser } = await requireCompanyUser({ include: { companyProfile: true } });
  const company = companyUser.companyProfile;
  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="企業プロフィール" />
        <Card className="mt-6">
          <form action={saveCompanyProfile} className="grid gap-4">
            <TextField name="name" label="企業名" defaultValue={company.name} required />
            <TextArea name="description" label="概要" defaultValue={company.description} />
            <TextField name="websiteUrl" label="Webサイト" defaultValue={company.websiteUrl} />
            <button className="btn btn-primary" type="submit">保存</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
