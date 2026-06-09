import { submitCompanySafetyReport } from "@/lib/actions";
import {
  companySafetyReportStatusLabels,
  companySafetyReportTypeLabels,
  safetyReportReasonOptions,
  safetyReportStatusTone,
} from "@/lib/safety-reports";
import { formatDateTime } from "@/lib/utils";
import { SelectField, StatusBadge, TextArea } from "@/components/ui";
import type { CompanySafetyReport, CompanySafetyReportStatus, CompanySafetyReportType } from "@prisma/client";

type ReporterSafetyReport = Pick<
  CompanySafetyReport,
  "id" | "reportType" | "status" | "affectedUserNote" | "createdAt" | "resolvedAt"
>;

export function SafetyReportPanel({
  acknowledgement,
  compact,
  context,
  reports,
  returnTo,
}: {
  acknowledgement?: boolean;
  compact?: boolean;
  context: {
    jobPostId?: string | null;
    jobApplicationId?: string | null;
    interviewThreadId?: string | null;
  };
  reports?: ReporterSafetyReport[];
  returnTo: string;
}) {
  return (
    <div className={`rounded border border-red-100 bg-red-50/50 p-4 ${compact ? "text-sm" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-stone-900">安全性をFlow Linkへ報告</h2>
          <p className="mt-1 text-sm leading-6 text-stone-700">
            外部支払い依頼、不自然な会社情報、面談中の不安な行動は応募判断や連絡継続の前に共有できます。
          </p>
        </div>
        <StatusBadge tone="bad">非公開レポート</StatusBadge>
      </div>

      {acknowledgement && (
        <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
          レポートを受け付けました。Flow Linkは画面上の募集内容、提出済みの会社確認情報、面談・応募に紐づく記録を確認します。支払い保証、法的判断、外部で発生した損失の回収は保証できません。確認中は外部決済、個人口座への送金、認証情報の共有、疑わしいリンクへのアクセスを避けてください。
        </div>
      )}

      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
        外部決済、個人口座、認証情報、怪しいURL、フリーランス側への送金要求がある場合は、応募やメッセージを進める前に一度停止してください。必要最小限の事実だけを書き、マイナンバー、銀行口座、住所、認証コードなど不要な個人情報は入れないでください。
      </div>

      <form action={submitCompanySafetyReport} className="mt-4 grid gap-3">
        <input type="hidden" name="returnTo" value={returnTo} />
        {context.jobPostId && <input type="hidden" name="jobPostId" value={context.jobPostId} />}
        {context.jobApplicationId && <input type="hidden" name="jobApplicationId" value={context.jobApplicationId} />}
        {context.interviewThreadId && <input type="hidden" name="interviewThreadId" value={context.interviewThreadId} />}
        <SelectField name="reportType" label="報告理由">
          {safetyReportReasonOptions.map((reason) => (
            <option key={reason} value={reason}>
              {companySafetyReportTypeLabels[reason]}
            </option>
          ))}
        </SelectField>
        <TextArea
          name="detail"
          label="確認してほしい内容"
          required
          minLength={20}
          maxLength={1200}
          placeholder="例: 面談後にFlow Link外の個人口座へ先払いするよう依頼された。応募した案件名と契約主体の説明も食い違っていた。"
        />
        <button className="btn btn-primary" type="submit">安全性レポートを送信</button>
      </form>

      {reports && reports.length > 0 && (
        <div className="mt-5 border-t border-red-100 pt-4">
          <p className="text-sm font-semibold text-stone-900">あなたの報告状況</p>
          <div className="mt-3 grid gap-2">
            {reports.map((report) => (
              <SafetyReportStatusItem key={report.id} report={report} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SafetyReportStatusItem({ report }: { report: ReporterSafetyReport }) {
  return (
    <div className="rounded border border-stone-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-stone-800">{companySafetyReportTypeLabels[report.reportType as CompanySafetyReportType]}</p>
        <StatusBadge tone={safetyReportStatusTone(report.status as CompanySafetyReportStatus)}>
          {companySafetyReportStatusLabels[report.status as CompanySafetyReportStatus]}
        </StatusBadge>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        受付: {formatDateTime(report.createdAt)}
        {report.resolvedAt ? ` / 確認完了: ${formatDateTime(report.resolvedAt)}` : ""}
      </p>
      {report.affectedUserNote && (
        <p className="mt-2 whitespace-pre-wrap rounded border border-emerald-100 bg-emerald-50 p-2 leading-6 text-emerald-900">
          {report.affectedUserNote}
        </p>
      )}
    </div>
  );
}
