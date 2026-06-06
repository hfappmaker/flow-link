import Link from "next/link";
import { auth } from "@/lib/auth";
import { saveScreeningNote, screenApplication } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { applicationStatusLabel, formatDateTime } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, StatusBadge, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyUser = await prisma.companyUser.findUnique({ where: { userId: session!.user.id } });
  const application = await prisma.jobApplication.findFirst({
    where: { id, jobPost: { companyProfileId: companyUser!.companyProfileId } },
    include: {
      jobPost: true,
      freelancerProfile: { include: { careerHistory: true, documents: true } },
      notes: { orderBy: { createdAt: "desc" }, include: { companyUser: { include: { user: true } } } },
      interviewThread: true,
    },
  });
  if (!application) {
    return <Shell><TopNav sessionRole={session?.user?.role} /><div className="mx-auto max-w-4xl px-5 py-8"><Card>応募情報が見つかりません。</Card></div></Shell>;
  }
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title={application.freelancerProfile.fullName} description={application.jobPost.title} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-5">
            <Card>
              <StatusBadge tone={application.status === "screening_passed" ? "good" : application.status === "screening_rejected" ? "bad" : "neutral"}>
                {applicationStatusLabel(application.status)}
              </StatusBadge>
              <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                <Info label="希望職種" value={application.freelancerProfile.desiredOccupation} />
                <Info label="スキル" value={application.freelancerProfile.skills} />
                <Info label="経験年数" value={application.freelancerProfile.yearsOfExperience?.toString()} />
                <Info label="希望単価" value={application.freelancerProfile.desiredRate} />
                <Info label="稼働条件" value={application.freelancerProfile.availability} />
                <Info label="リモート希望" value={application.freelancerProfile.remotePreference} />
              </dl>
            </Card>
            <Card>
              <h2 className="font-semibold">職務経歴フォーム</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{application.freelancerProfile.careerHistory?.summary ?? "未登録"}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{application.freelancerProfile.careerHistory?.workExperiences}</p>
            </Card>
            <Card>
              <h2 className="font-semibold">PDF書類</h2>
              <div className="mt-3 grid gap-2">
                {application.freelancerProfile.documents.map((doc) => (
                  <a className="text-sm font-semibold text-emerald-700" href={`/api/documents/${doc.id}`} target="_blank" key={doc.id}>
                    {doc.documentType === "resume" ? "履歴書" : "職務経歴書"}: {doc.originalFilename}
                  </a>
                ))}
                {application.freelancerProfile.documents.length === 0 && <p className="text-sm text-stone-600">PDFは未登録です。</p>}
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">企業内メモ</h2>
              <form action={saveScreeningNote} className="mt-4 grid gap-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <TextArea name="note" label="メモ" />
                <button className="btn btn-secondary" type="submit">メモを追加</button>
              </form>
              <div className="mt-5 grid gap-3">
                {application.notes.map((note) => (
                  <div className="rounded border border-stone-200 p-3 text-sm" key={note.id}>
                    <p className="whitespace-pre-wrap">{note.note}</p>
                    <p className="mt-2 text-xs text-stone-500">{formatDateTime(note.createdAt)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Card className="h-fit">
            <h2 className="font-semibold">書類選考</h2>
            <div className="mt-4 grid gap-3">
              <form action={screenApplication}>
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="status" value="screening_passed" />
                <button className="btn btn-primary w-full" type="submit">書類選考OK</button>
              </form>
              <form action={screenApplication}>
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="status" value="screening_rejected" />
                <button className="btn btn-danger w-full" type="submit">書類選考NG</button>
              </form>
              {application.interviewThread && <Link className="btn btn-secondary" href={`/interviews/${application.interviewThread.id}`}>面談チャット</Link>}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 font-medium">{value || "未設定"}</dd>
    </div>
  );
}
