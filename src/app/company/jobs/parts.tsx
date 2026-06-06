import type { JobPost } from "@prisma/client";
import { SelectField, TextArea, TextField } from "@/components/ui";

export function JobPostForm({ action, job }: { action: (formData: FormData) => void | Promise<void>; job?: JobPost }) {
  return (
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
  );
}
