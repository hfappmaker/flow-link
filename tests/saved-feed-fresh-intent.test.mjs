import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsSource = await readFile("src/lib/actions.ts", "utf8");
const jobsPageSource = await readFile("src/app/jobs/page.tsx", "utf8");
const preferencesPageSource = await readFile("src/app/freelancer/preferences/page.tsx", "utf8");

test("saving a job feed persists active candidate=fresh intent", () => {
  assert.match(actionsSource, /freshOnly:\s*formData\.get\("candidate"\) === "fresh"/);
  assert.match(jobsPageSource, /name="candidate"\s+value=\{filters\.candidate\}/);
});

test("saved feed links restore candidate=fresh only for fresh-only feeds", () => {
  assert.match(jobsPageSource, /candidate:\s*search\.freshOnly \? "fresh" : ""/);
  assert.match(preferencesPageSource, /\.\.\.\(search\.freshOnly \? \{ candidate: "fresh" \} : \{\}\)/);
});

test("saved feed panel and management summary show the preserved fresh-candidate condition", () => {
  assert.match(jobsPageSource, /filters\.candidate === "fresh" && "未対応の候補"/);
  assert.match(preferencesPageSource, /search\.freshOnly && "未対応の候補"/);
});
