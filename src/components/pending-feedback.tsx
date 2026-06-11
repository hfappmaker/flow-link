"use client";

import type { ButtonHTMLAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type PendingKind = "route" | "submit";

const HIDE_AFTER_MS = 12000;
const ROUTE_MIN_VISIBLE_MS = 500;
const ROUTE_PENDING_STORAGE_KEY = "flow-link-route-pending-until";

function takeStoredRoutePendingUntil() {
  if (typeof window === "undefined") return 0;

  try {
    const pendingUntil = Number(window.sessionStorage.getItem(ROUTE_PENDING_STORAGE_KEY) ?? 0);
    window.sessionStorage.removeItem(ROUTE_PENDING_STORAGE_KEY);
    return pendingUntil;
  } catch {
    return 0;
  }
}

export function GlobalPendingFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const [pendingKind, setPendingKind] = useState<PendingKind | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKindRef = useRef<PendingKind | null>(null);
  const shownAtRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const hidePending = useCallback(() => {
    clearHideTimer();
    pendingKindRef.current = null;
    setPendingKind(null);
  }, [clearHideTimer]);

  const showPending = useCallback(
    (kind: PendingKind) => {
      clearHideTimer();
      pendingKindRef.current = kind;
      shownAtRef.current = Date.now();
      setPendingKind(kind);
      if (kind === "route") {
        try {
          window.sessionStorage.setItem(ROUTE_PENDING_STORAGE_KEY, String(shownAtRef.current + ROUTE_MIN_VISIBLE_MS));
        } catch {
          // Ignore storage failures; in-memory route feedback still works for client transitions.
        }
      }
      hideTimer.current = setTimeout(hidePending, HIDE_AFTER_MS);
    },
    [clearHideTimer, hidePending],
  );

  useEffect(() => {
    const pendingUntil = takeStoredRoutePendingUntil();
    const remaining = pendingUntil - Date.now();
    if (remaining <= 0) return;

    const restoreTimer = setTimeout(() => {
      clearHideTimer();
      pendingKindRef.current = "route";
      shownAtRef.current = pendingUntil - ROUTE_MIN_VISIBLE_MS;
      setPendingKind("route");
      hideTimer.current = setTimeout(hidePending, Math.max(pendingUntil - Date.now(), 0));
    }, 0);

    return () => clearTimeout(restoreTimer);
  }, [clearHideTimer, hidePending]);

  useEffect(() => {
    if (pendingKindRef.current !== "route") return;

    const elapsed = Date.now() - shownAtRef.current;
    const resetTimer = setTimeout(hidePending, Math.max(ROUTE_MIN_VISIBLE_MS - elapsed, 0));
    return () => clearTimeout(resetTimer);
  }, [hidePending, locationKey]);

  useEffect(() => {

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;

      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.origin !== window.location.origin || nextUrl.href === window.location.href || nextUrl.hash) return;

      showPending("route");
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;

      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !form.checkValidity()) return;

      showPending("submit");

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
      try {
        window.sessionStorage.removeItem(ROUTE_PENDING_STORAGE_KEY);
      } catch {
        // Ignore storage failures; the visible state is still controlled in memory.
      }
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
  }, [clearHideTimer, hidePending, showPending]);

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
