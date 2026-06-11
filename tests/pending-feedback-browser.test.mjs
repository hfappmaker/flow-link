import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { chromium } from "playwright";

const shouldRun = process.env.RUN_PENDING_FEEDBACK_BROWSER_TEST === "1" || Boolean(process.env.PENDING_FEEDBACK_BASE_URL);
const baseUrl = process.env.PENDING_FEEDBACK_BASE_URL ?? `http://127.0.0.1:${process.env.PENDING_FEEDBACK_TEST_PORT ?? "3020"}`;

test(
  "pending feedback hydrates and appears during route transitions",
  { skip: shouldRun ? false : "set RUN_PENDING_FEEDBACK_BROWSER_TEST=1 or PENDING_FEEDBACK_BASE_URL to run browser coverage" },
  async () => {
    const server = process.env.PENDING_FEEDBACK_BASE_URL ? null : await startServer(baseUrl);
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) {
          consoleErrors.push(message.text());
        }
      });

      for (const route of ["/jobs", "/register", "/login"]) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        const feedback = page.locator('[data-testid="global-pending-feedback"]');
        assert.equal(await feedback.count(), 1, `${route} should hydrate global pending feedback`);
        assert.equal(await feedback.getAttribute("aria-hidden"), "true", `${route} should hide inactive global pending feedback from assistive tech`);
        assert.equal(await feedback.textContent(), "", `${route} should not keep inactive pending feedback text in the DOM`);
        assert.doesNotMatch(await page.locator("body").ariaSnapshot(), /画面を読み込んでいます|送信内容を処理しています/, `${route} should not expose inactive pending feedback in the accessibility tree`);
        assert.ok((await page.locator(".link-pending-hint").count()) > 0, `${route} should render inline link pending hints`);
      }

      await page.goto(`${baseUrl}/jobs`, { waitUntil: "networkidle" });
      await page.locator('form[action="/jobs"] input[name="q"]').fill("react");
      const submitFeedback = page.waitForFunction(() => {
        const feedback = document.querySelector('[data-testid="global-pending-feedback"]');
        return (
          feedback?.classList.contains("global-pending-feedback-visible") &&
          feedback.getAttribute("aria-live") === "polite" &&
          feedback.textContent?.includes("送信内容を処理しています")
        );
      });
      await page.locator('form[action="/jobs"] button[type="submit"]').click();
      await submitFeedback;

      await page.goto(`${baseUrl}/jobs`, { waitUntil: "networkidle" });
      const visibleFeedback = page.waitForFunction(() =>
        document.querySelector('[data-testid="global-pending-feedback"]')?.classList.contains("global-pending-feedback-visible"),
      );
      await page.locator('header a[href="/register"]').click();
      await visibleFeedback;
      const activeFeedback = page.locator('[data-testid="global-pending-feedback"]');
      assert.equal(await activeFeedback.getAttribute("aria-live"), "polite", "active route pending feedback should use a polite live region");
      assert.match(await activeFeedback.textContent(), /画面を読み込んでいます/, "active route pending feedback should announce route loading");

      assert.equal(consoleErrors.length, 0, `unexpected browser console errors:\n${consoleErrors.join("\n")}`);
    } finally {
      await browser.close();
      if (server) await stopServer(server);
    }
  },
);

async function startServer(base) {
  const url = new URL(base);
  const child = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      HOSTNAME: url.hostname,
      PORT: url.port,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited before becoming ready:\n${output}`);
    }

    try {
      const response = await fetch(base);
      if (response.ok) return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  await stopServer(child);
  throw new Error(`dev server did not become ready:\n${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}
