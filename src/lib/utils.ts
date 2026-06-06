import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function toText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function toOptionalText(value: FormDataEntryValue | null) {
  const text = toText(value);
  return text.length ? text : null;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function applicationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    applied: "応募済み",
    screening_passed: "書類選考OK",
    screening_rejected: "書類選考NG",
    withdrawn: "辞退",
  };
  return labels[status] ?? status;
}

export function jobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "下書き",
    published: "公開中",
    private: "非公開",
    closed: "クローズ",
  };
  return labels[status] ?? status;
}
