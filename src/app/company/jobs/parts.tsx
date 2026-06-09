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
  const nextGuide = buildConditionGuide(formValues).find((guide) => !guide.done);
  const applicantPreview = buildApplicantPreview(formValues, missingItems.map((item) => item.label));

  function updateField(name: keyof typeof formValues, value: string) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  function applyExample(name: FieldName, value: string) {
    setFormValues((current) => ({ ...current, [name]: current[name] || value }));
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
            {missingItems.map((item) => item.label).join("、")}が未設定です。このまま保存すると下書きとして保存され、応募受付は停止されます。
          </div>
        )}
        <button className="btn btn-primary md:col-span-2" type="submit">保存</button>
      </form>
      <aside className="grid h-fit gap-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">応募者に見える内容</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                公開前に、案件詳細で伝わる判断材料を確認できます。
              </p>
            </div>
            <span className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-800">
              {contractReadiness.percent}%
            </span>
          </div>
          <div className="mt-4 rounded border border-emerald-200 bg-white p-3">
            <p className="text-xs font-medium text-stone-500">案件名</p>
            <p className="mt-1 text-sm font-semibold text-stone-950">{applicantPreview.title}</p>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{applicantPreview.summary}</p>
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-1">
            {applicantPreview.highlights.map((highlight) => (
              <div className="rounded border border-emerald-200 bg-white px-3 py-2" key={highlight.label}>
                <p className="font-medium text-stone-500">{highlight.label}</p>
                <p className="mt-1 font-semibold text-stone-800">{highlight.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <ApplicantPreviewList
              empty="応募者が最初に確認したい情報はまだ不足しています。"
              items={applicantPreview.readyPoints}
              label="応募前に確認できること"
              tone="good"
            />
            <ApplicantPreviewList
              empty="現時点で大きな不足はありません。"
              items={applicantPreview.openQuestions}
              label="まだ伝わりにくいこと"
              tone="warn"
            />
          </div>
        </div>
        <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
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
        </div>
        <div className="rounded-md border border-stone-200 bg-white p-4">
          <h2 className="font-semibold">入力ガイド</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            応募者が迷いやすい条件から順に、記入例を使って案件内容を整えます。
          </p>
          {nextGuide ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-900">次に埋める項目</p>
              <p className="mt-1 text-sm font-semibold text-stone-950">{nextGuide.title}</p>
              <p className="mt-1 text-sm leading-6 text-stone-700">{nextGuide.reason}</p>
              <div className="mt-3 grid gap-2">
                {nextGuide.examples.map((example) => (
                  <button
                    className="rounded border border-amber-200 bg-white px-3 py-2 text-left text-xs font-medium leading-5 text-stone-700 transition hover:border-amber-400"
                    key={`${example.name}-${example.value}`}
                    type="button"
                    onClick={() => applyExample(example.name, example.value)}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
              応募前に必要な条件が揃っています。公開後は応募者の提案と開始条件を確認してください。
            </p>
          )}
          <div className="mt-4 grid gap-2">
            {buildConditionGuide(formValues).map((guide) => (
              <div
                className={`rounded border px-3 py-2 text-sm ${
                  guide.done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-stone-50 text-stone-700"
                }`}
                key={guide.key}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{guide.title}</span>
                  <span className="text-xs font-semibold">{guide.done ? "入力済み" : "未入力"}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-600">{guide.reason}</p>
              </div>
            ))}
          </div>
        </div>
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

type ConditionGuide = {
  key: string;
  title: string;
  reason: string;
  done: boolean;
  examples: Array<{
    name: FieldName;
    label: string;
    value: string;
  }>;
};

type ApplicantPreview = {
  title: string;
  summary: string;
  highlights: Array<{
    label: string;
    value: string;
  }>;
  readyPoints: string[];
  openQuestions: string[];
};

function ApplicantPreviewList({
  empty,
  items,
  label,
  tone,
}: {
  empty: string;
  items: string[];
  label: string;
  tone: "good" | "warn";
}) {
  const toneClasses = {
    good: "border-emerald-200 bg-white text-emerald-900",
    warn: "border-amber-200 bg-white text-amber-900",
  };

  return (
    <div className={`rounded border p-3 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold">{label}</p>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-stone-700">
          {items.map((item) => (
            <li className="break-words" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-stone-600">{empty}</p>
      )}
    </div>
  );
}

function buildApplicantPreview(values: Record<FieldName, string>, missingLabels: string[]): ApplicantPreview {
  const readyPoints = [
    values.description && values.requiredSkills ? "業務範囲と必須スキルを見て、自分の経験を提案文に書ける" : null,
    values.rate && values.contractTerms ? "単価と契約・支払い条件を応募前に確認できる" : null,
    values.workload && values.contractPeriod ? "稼働量と契約期間から、開始後の予定を判断できる" : null,
    values.selectionFlow ? "応募後の面談回数と判断までの流れを確認できる" : null,
    values.location || values.remotePolicy ? "勤務地またはリモート条件を確認できる" : null,
  ].filter((item): item is string => Boolean(item));
  const openQuestions = missingLabels.map((label) => `${label}を応募前に確認したくなります`);

  return {
    title: values.title || "案件タイトル未入力",
    summary: values.description || "業務内容を入力すると、応募者が担当範囲と期待される成果を確認できます。",
    highlights: [
      { label: "単価", value: values.rate || "未設定" },
      { label: "稼働率", value: values.workload || "未設定" },
      { label: "契約期間", value: values.contractPeriod || "未設定" },
      { label: "働き方", value: [values.location, values.remotePolicy].filter(Boolean).join(" / ") || "未設定" },
    ],
    readyPoints,
    openQuestions,
  };
}

function buildConditionGuide(values: Record<FieldName, string>): ConditionGuide[] {
  return [
    {
      key: "scope",
      title: "業務範囲と必須スキル",
      reason: "担当範囲と必要スキルが揃うと、応募者が自分の経験を提案文に落とし込みやすくなります。",
      done: Boolean(values.description && values.requiredSkills),
      examples: [
        {
          name: "description",
          label: "業務内容の例を入れる",
          value: "既存サービスの新機能開発と改善を担当します。要件整理、画面実装、API連携、リリース後の改善提案までを期待します。",
        },
        {
          name: "requiredSkills",
          label: "必須スキルの例を入れる",
          value: "TypeScript, React, API設計, チーム開発",
        },
      ],
    },
    {
      key: "compensation",
      title: "報酬と支払い条件",
      reason: "単価、精算幅、支払いタイミングが見えると、応募前の条件確認が減ります。",
      done: Boolean(values.rate && values.contractTerms),
      examples: [
        {
          name: "rate",
          label: "単価の例を入れる",
          value: "月80〜100万円、精算幅140〜180時間",
        },
        {
          name: "contractTerms",
          label: "契約・支払い条件の例を入れる",
          value: "業務委託契約。月末締め翌月末払い。NDA締結後に詳細資料を共有します。",
        },
      ],
    },
    {
      key: "workload",
      title: "稼働条件と期間",
      reason: "開始後の稼働量と契約期間が分かると、応募者がスケジュールを判断できます。",
      done: Boolean(values.workload && values.contractPeriod),
      examples: [
        {
          name: "workload",
          label: "稼働率の例を入れる",
          value: "週3〜4日、月96〜128時間を想定",
        },
        {
          name: "contractPeriod",
          label: "契約期間の例を入れる",
          value: "初回3ヶ月。成果と双方の希望により延長相談可",
        },
      ],
    },
    {
      key: "process",
      title: "選考フロー",
      reason: "面談回数と判断までの流れが明確だと、応募後の予定調整が進めやすくなります。",
      done: Boolean(values.selectionFlow),
      examples: [
        {
          name: "selectionFlow",
          label: "選考フローの例を入れる",
          value: "書類確認後、現場担当と30分のオンライン面談を1回実施します。面談後3営業日以内に結果を連絡します。",
        },
      ],
    },
    {
      key: "place",
      title: "働き方",
      reason: "リモート可否や出社条件が明確だと、応募者が無理なく稼働できるか判断できます。",
      done: Boolean(values.location || values.remotePolicy),
      examples: [
        {
          name: "remotePolicy",
          label: "リモート可否の例を入れる",
          value: "フルリモート可。初回キックオフのみオンライン参加必須",
        },
        {
          name: "location",
          label: "勤務地の例を入れる",
          value: "東京都渋谷区。必要時のみ来社相談",
        },
      ],
    },
  ];
}
