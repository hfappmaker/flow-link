import assert from "node:assert/strict";
import test from "node:test";

const {
  registrationRoleIntent,
  safeAuthCallbackUrl,
} = await import("../src/lib/registration-intent.ts");

test("safe auth callbacks keep local destinations only", () => {
  assert.equal(safeAuthCallbackUrl("/company/jobs/create"), "/company/jobs/create");
  assert.equal(safeAuthCallbackUrl("/freelancer"), "/freelancer");
  assert.equal(safeAuthCallbackUrl("https://example.com/company"), "");
  assert.equal(safeAuthCallbackUrl("//example.com/company"), "");
});

test("registration role intent follows protected destination scope", () => {
  assert.equal(registrationRoleIntent("/company/jobs/create"), "company_user");
  assert.equal(registrationRoleIntent("/company"), "company_user");
  assert.equal(registrationRoleIntent("/freelancer"), "freelancer");
  assert.equal(registrationRoleIntent("/freelancer/saved-jobs"), "freelancer");
  assert.equal(registrationRoleIntent("/jobs"), "freelancer");
  assert.equal(registrationRoleIntent(""), "freelancer");
});
