"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/pending-feedback";
import type { RegistrationRoleIntent } from "@/lib/registration-intent";
import { cn } from "@/lib/utils";

const roleOptions: Record<
  RegistrationRoleIntent,
  {
    label: string;
    title: string;
    description: string;
    nameLabel: string;
    submitLabel: string;
    pendingLabel: string;
    helper: string;
  }
> = {
  freelancer: {
    label: "フリーランス",
    title: "フリーランスとして始める",
    description: "案件を比較し、応募に必要なプロフィールを作成します。",
    nameLabel: "氏名",
    submitLabel: "フリーランスとして登録",
    pendingLabel: "フリーランス登録中",
    helper: "登録後はフリーランス向けのプロフィール作成へ進みます。",
  },
  company_user: {
    label: "企業ユーザー",
    title: "企業として募集を始める",
    description: "企業プロフィールを作成し、募集や応募者確認へ進みます。",
    nameLabel: "企業名",
    submitLabel: "企業ユーザーとして登録",
    pendingLabel: "企業ユーザー登録中",
    helper: "登録後は企業向けの募集管理へ進みます。",
  },
};

export function RegisterForm({
  action,
  callbackUrl,
  initialRole,
}: {
  action: (formData: FormData) => void | Promise<void>;
  callbackUrl: string;
  initialRole: RegistrationRoleIntent;
}) {
  const [role, setRole] = useState<RegistrationRoleIntent>(initialRole);
  const selected = roleOptions[role];

  return (
    <form action={action} className="mt-3 grid gap-3 sm:mt-5 sm:gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <fieldset className="grid gap-1.5 sm:gap-2">
        <legend className="text-sm font-semibold text-stone-700">登録の目的</legend>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {(Object.keys(roleOptions) as RegistrationRoleIntent[]).map((optionRole) => {
            const option = roleOptions[optionRole];
            const checked = role === optionRole;
            return (
              <label
                className={cn(
                  "grid cursor-pointer gap-1.5 rounded-md border bg-white p-2.5 text-sm transition sm:gap-2 sm:p-3",
                  checked ? "border-emerald-600 ring-2 ring-emerald-100" : "border-stone-200 hover:border-stone-300",
                )}
                key={optionRole}
              >
                <span className="flex items-center gap-2 font-semibold text-stone-950">
                  <input
                    checked={checked}
                    className="size-4 accent-emerald-700"
                    name="role"
                    onChange={() => setRole(optionRole)}
                    type="radio"
                    value={optionRole}
                  />
                  {option.title}
                </span>
                <span className="hidden text-xs leading-5 text-stone-600 sm:block">{option.description}</span>
                <span className="hidden text-xs font-medium text-stone-500 sm:block">種別: {option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="rounded border border-emerald-100 bg-emerald-50 p-2.5 text-xs leading-5 text-emerald-950 sm:p-3 sm:text-sm sm:leading-6">
        {selected.helper}
      </p>
      <TextInput name="name" label={selected.nameLabel} required />
      <TextInput name="email" label="メールアドレス" type="email" required />
      <TextInput name="password" label="パスワード" type="password" required minLength={8} />
      <SubmitButton className="btn btn-primary" pendingLabel={selected.pendingLabel}>
        {selected.submitLabel}
      </SubmitButton>
    </form>
  );
}

function TextInput({
  name,
  label,
  type = "text",
  required,
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-700 sm:gap-1.5">
      {label}
      <input
        className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-700 sm:py-2"
        name={name}
        type={type}
        required={required}
        minLength={minLength}
      />
    </label>
  );
}
