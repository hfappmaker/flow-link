import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { chromium } from "playwright";

const shouldRun = process.env.RUN_PUBLIC_SHELL_BROWSER_TEST === "1" || Boolean(process.env.PUBLIC_SHELL_BASE_URL);
const baseUrl = process.env.PUBLIC_SHELL_BASE_URL ?? `http://127.0.0.1:${process.env.PUBLIC_SHELL_TEST_PORT ?? "3020"}`;

test(
  "public shell has no horizontal overflow on mobile acquisition routes",
  { skip: shouldRun ? false : "set RUN_PUBLIC_SHELL_BROWSER_TEST=1 or PUBLIC_SHELL_BASE_URL to run browser coverage" },
  async () => {
    const server = process.env.PUBLIC_SHELL_BASE_URL ? null : await startServer(baseUrl);
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const consoleErrors = [];
      const routes = ["/", "/jobs", "/register", "/login"];

      for (const width of [375, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 812 } });
        page.on("console", (message) => {
          if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) {
            consoleErrors.push(message.text());
          }
        });

        for (const route of routes) {
          await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });

          const overflow = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
          }));
          assert.ok(
            overflow.scrollWidth <= overflow.clientWidth,
            `${route} should not overflow horizontally at ${width}px: ${JSON.stringify(overflow)}`,
          );
          assert.ok(
            overflow.bodyScrollWidth <= overflow.clientWidth,
            `${route} body should not overflow horizontally at ${width}px: ${JSON.stringify(overflow)}`,
          );

          const header = page.locator("header");
          for (const label of ["Flow Link", "案件", "ログイン", "登録"]) {
            const target = header.getByRole("link", {
              name: label === "Flow Link" ? new RegExp(label) : label,
              exact: label !== "Flow Link",
            });
            const box = await target.boundingBox();
            assert.ok(box, `${route} should render visible ${label} link at ${width}px`);
            assert.ok(box.width >= 32, `${route} ${label} link should remain tappable at ${width}px: ${JSON.stringify(box)}`);
            assert.ok(box.height >= 32, `${route} ${label} link should remain tappable at ${width}px: ${JSON.stringify(box)}`);
            assert.ok(box.x >= 0, `${route} ${label} link should not clip left at ${width}px: ${JSON.stringify(box)}`);
            assert.ok(
              box.x + box.width <= overflow.clientWidth,
              `${route} ${label} link should not clip right at ${width}px: ${JSON.stringify(box)}`,
            );
          }
        }

        await page.close();
      }

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
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}
