"use client";

import { useState } from "react";
import type { JobPost } from "@prisma/client";
import { directContractChecklist } from "@/lib/utils";

export function JobPostForm({ action, job }: { action: (formData: FormData) => void | Promise<void>; job?: JobPost }) {
  const [formValues, setFormValues] = useState({
    title: job?.title ?? "",
    description: job?.description ?? "",
    requiredSkills: job?.requiredSkills ?? "",
    preferredSkills: job?.preferredSkills ?? "",
    rate: job?.rate ?? "",
    workload: job?.workload ?? "",
    contractPeriod: job?.contractPeriod ?? "",
    selectionFlow: job?.selectionFlow ?? "",
    contractTerms: job?.contractTerms ?? "",
    location: job?.location ?? "",
    remotePolicy: job?.remotePolicy ?? "",
    openings: job?.openings?.toString() ?? "",
    status: job?.status ?? "draft",
    applicationStatus: job?.applicationStatus ?? "open",
  });
  const contractReadiness = directContractChecklist(formValues);
  const missingItems = contractReadiness.items.filter((item) => !item.done);
  const isPublishingIncomplete = formValues.status === "published" && missingItems.length > 0;

  function updateField(name: keyof typeof formValues, value: string) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <form action={action} className="grid gap-4 md:grid-cols-2">
        {job && <input type="hidden" name="id" value={job.id} />}
        <JobTextField name="title" label="タイトル" value={formValues.title} onChange={updateField} required />
        <JobTextField
          name="rate"
          label="単価"
          value={formValues.rate}
          onChange={updateField}
          placeholder="例: 80〜100万円/月、時給6,000円〜"
        />
        <div className="md:col-span-2">
          <JobTextArea
            name="description"
            label="業務内容"
            value={formValues.description}
            onChange={updateField}
            required
            placeholder="任せたい役割、開発対象、チーム体制、期待する成果を入力"
          />
        </div>
        <JobTextArea
          name="requiredSkills"
          label="必須スキル"
          value={formValues.requiredSkills}
          onChange={updateField}
          placeholder="例: TypeScript, React, API設計"
        />
        <JobTextArea
          name="preferredSkills"
          label="歓迎スキル"
          value={formValues.preferredSkills}
          onChange={updateField}
          placeholder="例: Next.js, Prisma, 決済機能の実装経験"
        />
        <JobTextField name="workload" label="稼働率" value={formValues.workload} onChange={updateField} placeholder="例: 週3日、月80時間" />
        <JobTextField
          name="contractPeriod"
          label="契約期間"
          value={formValues.contractPeriod}
          onChange={updateField}
          placeholder="例: 3ヶ月から、成果により延長"
        />
        <JobTextArea
          name="selectionFlow"
          label="選考フロー"
          value={formValues.selectionFlow}
          onChange={updateField}
          maxLength={800}
          placeholder="例: 書類確認後、現場担当と30分面談。必要に応じて技術確認を1回実施。"
        />
        <JobTextArea
          name="contractTerms"
          label="契約・支払い条件"
          value={formValues.contractTerms}
          onChange={updateField}
          maxLength={800}
          placeholder="例: 業務委託契約、月末締め翌月末払い、NDA締結後に詳細資料を共有。"
        />
        <JobTextField name="location" label="勤務地" value={formValues.location} onChange={updateField} placeholder="例: 東京都渋谷区、初回のみ来社" />
        <JobTextField
          name="remotePolicy"
          label="リモート可否"
          value={formValues.remotePolicy}
          onChange={updateField}
          placeholder="例: フルリモート、週1出社"
        />
        <JobTextField name="openings" label="募集人数" type="number" value={formValues.openings} onChange={updateField} />
        <JobSelectField name="status" label="案件ステータス" value={formValues.status} onChange={updateField}>
          <option value="draft">下書き</option>
          <option value="published">公開中</option>
          <option value="private">非公開</option>
          <option value="closed">クローズ</option>
        </JobSelectField>
        <JobSelectField name="applicationStatus" label="応募受付" value={formValues.applicationStatus} onChange={updateField}>
          <option value="open">受付中</option>
          <option value="paused">受付停止</option>
        </JobSelectField>
        {isPublishingIncomplete && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 md:col-span-2">
            公開できますが、{missingItems.map((item) => item.label).join("、")}が未設定です。応募者が条件確認しやすいよう、保存前の入力をおすすめします。
          </div>
        )}
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
        {missingItems.length > 0 ? (
          <div className="mt-4 rounded border border-white bg-white p-3">
            <p className="text-sm font-semibold">保存前に埋める項目</p>
            <ul className="mt-2 grid gap-2 text-sm leading-6 text-stone-600">
              {missingItems.map((item) => (
                <li key={item.key}>・{item.label}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
            条件確認に必要な情報が揃っています。応募者は業務内容、報酬、稼働条件、面談の流れを応募前に確認できます。
          </p>
        )}
      </aside>
    </div>
  );
}

type FieldName =
  | "title"
  | "description"
  | "requiredSkills"
  | "preferredSkills"
  | "rate"
  | "workload"
  | "contractPeriod"
  | "selectionFlow"
  | "contractTerms"
  | "location"
  | "remotePolicy"
  | "openings"
  | "status"
  | "applicationStatus";

function JobTextField({
  name,
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  name: FieldName;
  label: string;
  value: string;
  onChange: (name: FieldName, value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      <input
        className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );
}

function JobTextArea({
  name,
  label,
  value,
  onChange,
  required,
  maxLength,
  placeholder,
}: {
  name: FieldName;
  label: string;
  value: string;
  onChange: (name: FieldName, value: string) => void;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      <textarea
        className="min-h-28 rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );
}

function JobSelectField({
  name,
  label,
  value,
  onChange,
  children,
}: {
  name: FieldName;
  label: string;
  value: string;
  onChange: (name: FieldName, value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      <select
        className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
