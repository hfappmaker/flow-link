"use client";

import type { ButtonHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type PendingKind = "route" | "submit";

const HIDE_AFTER_MS = 12000;

export function GlobalPendingFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const [pendingKind, setPendingKind] = useState<PendingKind | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resetTimer = setTimeout(() => setPendingKind(null), 0);
    return () => clearTimeout(resetTimer);
  }, [locationKey]);

  useEffect(() => {
    function clearHideTimer() {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }

    function show(kind: PendingKind) {
      clearHideTimer();
      setPendingKind(kind);
      hideTimer.current = setTimeout(() => {
        setPendingKind(null);
        hideTimer.current = null;
      }, HIDE_AFTER_MS);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;

      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.origin !== window.location.origin || nextUrl.href === window.location.href || nextUrl.hash) return;

      show("route");
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;

      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !form.checkValidity()) return;

      show("submit");

      const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const pendingLabel = submitter?.dataset.pendingLabel;
      if (submitter && pendingLabel) {
        const originalLabel = submitter.textContent ?? "";
        submitter.textContent = pendingLabel;
        submitter.setAttribute("aria-disabled", "true");
        setTimeout(() => {
          submitter.textContent = originalLabel;
          submitter.setAttribute("aria-disabled", "false");
        }, HIDE_AFTER_MS);
      }
    }

    function handlePageShow() {
      setPendingKind(null);
      clearHideTimer();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageShow);
      clearHideTimer();
    };
  }, []);

  const message = pendingKind === "submit" ? "送信内容を処理しています" : "画面を読み込んでいます";

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn("global-pending-feedback", pendingKind && "global-pending-feedback-visible")}
      data-testid="global-pending-feedback"
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      <span>{message}</span>
    </div>
  );
}

export function PendingLinkHint() {
  const { pending } = useLinkStatus();

  return (
    <span aria-hidden className={cn("link-pending-hint", pending && "link-pending-hint-visible")}>
      <LoaderCircle className="size-3 animate-spin" />
    </span>
  );
}

export function SubmitButton({
  children,
  className,
  onClick,
  pendingLabel = "処理中",
  type = "submit",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending: formPending } = useFormStatus();
  const [optimisticPending, setOptimisticPending] = useState(false);
  const optimisticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = formPending || optimisticPending;
  const label = useMemo(() => (pending ? pendingLabel : children), [children, pending, pendingLabel]);

  useEffect(() => {
    return () => {
      if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    };
  }, []);

  return (
    <button
      {...props}
      aria-disabled={pending}
      className={className}
      data-pending-label={pendingLabel}
      disabled={formPending || props.disabled}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || type !== "submit") return;

        const form = event.currentTarget.form;
        if (!form || !form.checkValidity()) return;

        setOptimisticPending(true);
        if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
        optimisticTimer.current = setTimeout(() => {
          setOptimisticPending(false);
          optimisticTimer.current = null;
        }, HIDE_AFTER_MS);
      }}
      type={type}
    >
      {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      <span>{label}</span>
    </button>
  );
}
