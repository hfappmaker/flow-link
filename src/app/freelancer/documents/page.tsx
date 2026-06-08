import { auth } from "@/lib/auth";
import { uploadResumeDocument } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, PageHeader, Card, SelectField } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await auth();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: session!.user.id },
    include: { documents: true },
  });
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="履歴書・職務経歴書PDF" description="PDFは応募先企業だけが確認できます。" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {profile?.documents.map((doc) => (
            <Card key={doc.id}>
              <p className="text-sm text-stone-500">{doc.documentType === "resume" ? "履歴書" : "職務経歴書"}</p>
              <p className="mt-2 font-semibold">{doc.originalFilename}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-6">
          <form action={uploadResumeDocument} className="grid gap-4">
            <SelectField name="documentType" label="書類種別" defaultValue="resume">
              <option value="resume">履歴書PDF</option>
              <option value="career_history">職務経歴書PDF</option>
            </SelectField>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              PDFファイル
              <input className="rounded border border-stone-300 bg-white px-3 py-2 text-sm" name="file" type="file" accept="application/pdf" required />
            </label>
            <button className="btn btn-primary" type="submit">アップロード</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
