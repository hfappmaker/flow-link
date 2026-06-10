import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, FileText, MessageSquare, Users } from "lucide-react";
import { PendingLinkHint, SubmitButton } from "@/components/pending-feedback";
import { cn } from "@/lib/utils";
import { loginHref } from "@/lib/registration-intent";

export function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f6f7f3] text-stone-950">{children}</main>;
}

type TopNavSection = "jobs" | "freelancer" | "company" | "login" | "register";

export function TopNav({
  activeSection,
  loginCallbackUrl,
  registerCallbackUrl,
  sessionRole,
}: {
  activeSection?: TopNavSection;
  loginCallbackUrl?: string;
  registerCallbackUrl?: string;
  sessionRole?: string;
}) {
  const currentSection =
    activeSection ??
    (sessionRole === "freelancer" ? "freelancer" : sessionRole === "company_user" ? "company" : undefined);
  const registerHref = registerCallbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(registerCallbackUrl)}`
    : "/register";
  const loginLinkHref = loginHref(loginCallbackUrl ?? "");

  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="top-nav-inner mx-auto flex max-w-7xl items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
        <Link href="/" className="top-nav-brand flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-8 place-items-center rounded bg-emerald-700 text-sm text-white">FL</span>
          <span>Flow Link</span>
          <PendingLinkHint />
        </Link>
        <nav className="top-nav-menu flex items-center gap-2 text-sm">
          <NavLink href="/jobs" active={currentSection === "jobs"}>
            案件
          </NavLink>
          {sessionRole === "freelancer" && (
            <NavLink href="/freelancer" active={currentSection === "freelancer"}>
              フリーランス
            </NavLink>
          )}
          {sessionRole === "company_user" && (
            <NavLink href="/company" active={currentSection === "company"}>
              企業
            </NavLink>
          )}
          {!sessionRole && (
            <NavLink href={loginLinkHref} active={currentSection === "login"}>
              ログイン
            </NavLink>
          )}
          {!sessionRole && (
            <Link
              aria-current={currentSection === "register" ? "page" : undefined}
              className={cn("btn btn-primary", currentSection === "register" && "nav-primary-active")}
              href={registerHref}
            >
              登録
              <PendingLinkHint />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ active, children, href }: { active?: boolean; children: React.ReactNode; href: string }) {
  return (
    <Link aria-current={active ? "page" : undefined} className={cn("nav-link", active && "nav-link-active")} href={href}>
      {children}
      <PendingLinkHint />
    </Link>
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

export { SubmitButton };
