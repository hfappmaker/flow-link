import type { JobPost } from "@prisma/client";
import { SelectField, TextArea, TextField } from "@/components/ui";
import { directContractChecklist } from "@/lib/utils";

export function JobPostForm({ action, job }: { action: (formData: FormData) => void | Promise<void>; job?: JobPost }) {
  const contractReadiness = directContractChecklist(job ?? {});

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <form action={action} className="grid gap-4 md:grid-cols-2">
        {job && <input type="hidden" name="id" value={job.id} />}
        <TextField name="title" label="タイトル" defaultValue={job?.title} required />
        <TextField name="rate" label="単価" defaultValue={job?.rate} />
        <div className="md:col-span-2">
          <TextArea name="description" label="業務内容" defaultValue={job?.description} required />
        </div>
        <TextArea name="requiredSkills" label="必須スキル" defaultValue={job?.requiredSkills} />
        <TextArea name="preferredSkills" label="歓迎スキル" defaultValue={job?.preferredSkills} />
        <TextField name="workload" label="稼働率" defaultValue={job?.workload} />
        <TextField name="contractPeriod" label="契約期間" defaultValue={job?.contractPeriod} />
        <TextArea
          name="selectionFlow"
          label="選考フロー"
          defaultValue={job?.selectionFlow}
          maxLength={800}
          placeholder="例: 書類確認後、現場担当と30分面談。必要に応じて技術確認を1回実施。"
        />
        <TextArea
          name="contractTerms"
          label="契約・支払い条件"
          defaultValue={job?.contractTerms}
          maxLength={800}
          placeholder="例: 業務委託契約、月末締め翌月末払い、NDA締結後に詳細資料を共有。"
        />
        <TextField name="location" label="勤務地" defaultValue={job?.location} />
        <TextField name="remotePolicy" label="リモート可否" defaultValue={job?.remotePolicy} />
        <TextField name="openings" label="募集人数" type="number" defaultValue={job?.openings} />
        <SelectField name="status" label="案件ステータス" defaultValue={job?.status ?? "draft"}>
          <option value="draft">下書き</option>
          <option value="published">公開中</option>
          <option value="private">非公開</option>
          <option value="closed">クローズ</option>
        </SelectField>
        <SelectField name="applicationStatus" label="応募受付" defaultValue={job?.applicationStatus ?? "open"}>
          <option value="open">受付中</option>
          <option value="paused">受付停止</option>
        </SelectField>
        <button className="btn btn-primary md:col-span-2" type="submit">保存</button>
      </form>
      <aside className="h-fit rounded-md border border-stone-200 bg-stone-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">応募前に見せる条件</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">応募者が判断しやすい案件情報の充足状況です。</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">{contractReadiness.percent}%</p>
            <p className="text-xs text-stone-500">{contractReadiness.completed}/{contractReadiness.total}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {contractReadiness.items.map((item) => (
            <div
              className={`rounded border px-3 py-2 text-sm ${
                item.done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              key={item.key}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs font-semibold">{item.done ? "完了" : "未設定"}</span>
              </div>
              <p className="mt-1 leading-6 text-stone-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
