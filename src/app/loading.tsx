import { Shell } from "@/components/ui";

export default function Loading() {
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-5 py-8" aria-busy="true">
        <div className="inline-flex items-center gap-2 rounded border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
          <span className="size-3 animate-pulse rounded-full bg-emerald-700" />
          画面を読み込んでいます
        </div>
        <div className="mt-6 grid gap-4">
          <div className="h-8 w-56 animate-pulse rounded bg-stone-200" />
          <div className="h-24 animate-pulse rounded-md border border-stone-200 bg-white" />
          <div className="h-24 animate-pulse rounded-md border border-stone-200 bg-white" />
        </div>
      </div>
    </Shell>
  );
}
