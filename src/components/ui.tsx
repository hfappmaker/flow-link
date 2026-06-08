import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, FileText, MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f6f7f3] text-stone-950">{children}</main>;
}

export function TopNav({ sessionRole }: { sessionRole?: string }) {
  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-8 place-items-center rounded bg-emerald-700 text-sm text-white">FL</span>
          Flow Link
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link className="nav-link" href="/jobs">案件</Link>
          {sessionRole === "freelancer" && <Link className="nav-link" href="/freelancer">フリーランス</Link>}
          {sessionRole === "company_user" && <Link className="nav-link" href="/company">企業</Link>}
          {!sessionRole && <Link className="nav-link" href="/login">ログイン</Link>}
          {!sessionRole && <Link className="btn btn-primary" href="/register">登録</Link>}
        </nav>
      </div>
    </header>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-stone-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-md border border-stone-200 bg-white p-5 shadow-sm", className)}>{children}</section>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed bg-stone-50/60 text-center">
      <div className="mx-auto max-w-md">
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </Card>
  );
}

export function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{label}</p>
        <span className="text-emerald-700">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </Card>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-red-200 bg-red-50 text-red-800",
  };
  return <span className={cn("inline-flex items-center rounded border px-2 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function TextField({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  minLength,
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      <input
        className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </label>
  );
}

export function TextArea({
  name,
  label,
  defaultValue,
  required,
  minLength,
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const fieldId = `${name}-${label.replace(/\s+/g, "-")}`;

  return (
    <div className="grid gap-1.5 text-sm font-medium text-stone-700">
      <label htmlFor={fieldId}>{label}</label>
      <textarea
        id={fieldId}
        className="min-h-28 rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      <select className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700" name={name} defaultValue={defaultValue ?? undefined}>
        {children}
      </select>
    </label>
  );
}

export const icons = {
  jobs: <Briefcase size={18} />,
  users: <Users size={18} />,
  files: <FileText size={18} />,
  ok: <CheckCircle2 size={18} />,
  chat: <MessageSquare size={18} />,
  arrow: <ArrowRight size={16} />,
};
