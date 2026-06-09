import assert from "node:assert/strict";
import test from "node:test";

const {
  loginHref,
  loginErrorUrl,
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

test("login errors preserve safe callback destinations", () => {
  assert.equal(
    loginErrorUrl("/company/jobs/create?draft=1"),
    "/login?error=CredentialsSignin&callbackUrl=%2Fcompany%2Fjobs%2Fcreate%3Fdraft%3D1",
  );
  assert.equal(loginErrorUrl("/"), "/login?error=CredentialsSignin");
  assert.equal(loginErrorUrl("https://example.com/company"), "/login?error=CredentialsSignin");
  assert.equal(loginErrorUrl("//example.com/company"), "/login?error=CredentialsSignin");
});

test("login links preserve safe callback destinations", () => {
  assert.equal(loginHref("/jobs/demo-job"), "/login?callbackUrl=%2Fjobs%2Fdemo-job");
  assert.equal(loginHref("/company/jobs/create?draft=1"), "/login?callbackUrl=%2Fcompany%2Fjobs%2Fcreate%3Fdraft%3D1");
  assert.equal(loginHref(""), "/login");
  assert.equal(loginHref("/"), "/login");
  assert.equal(loginHref("https://example.com/company"), "/login");
  assert.equal(loginHref("//example.com/company"), "/login");
});
