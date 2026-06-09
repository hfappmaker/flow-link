import assert from "node:assert/strict";
import test from "node:test";

const {
  canUseInterviewThread,
  missingCompanyUserResult,
  missingFreelancerProfileRedirect,
  roleMismatchRedirect,
} = await import("../src/lib/page-guard-core.ts");

const interviewThread = {
  jobApplication: {
    freelancerProfile: { userId: "freelancer-1" },
    jobPost: {
      companyProfile: {
        users: [{ userId: "company-1" }, { userId: "company-2" }],
      },
    },
  },
};

test("missing freelancer profiles redirect protected freelancer pages to the profile editor", () => {
  assert.equal(missingFreelancerProfileRedirect("/freelancer"), "/freelancer/profile");
  assert.equal(missingFreelancerProfileRedirect("/freelancer/applications"), "/freelancer/profile");
});

test("the freelancer profile editor can render without an existing profile", () => {
  assert.equal(missingFreelancerProfileRedirect("/freelancer/profile"), null);
});

test("missing company-user records resolve to not-found instead of nullable page access", () => {
  assert.equal(missingCompanyUserResult(null), "not-found");
  assert.equal(missingCompanyUserResult(undefined), "not-found");
  assert.equal(missingCompanyUserResult({ id: "company-user-1" }), null);
});

test("role mismatches keep the existing role-scoped redirects", () => {
  assert.equal(roleMismatchRedirect("freelancer", "company_user"), "/company");
  assert.equal(roleMismatchRedirect("company_user", "freelancer"), "/freelancer");
  assert.equal(roleMismatchRedirect("freelancer", "freelancer"), null);
  assert.equal(roleMismatchRedirect("company_user", "company_user"), null);
});

test("interview access allows the owning freelancer and company users", () => {
  assert.equal(canUseInterviewThread(interviewThread, "freelancer-1"), true);
  assert.equal(canUseInterviewThread(interviewThread, "company-1"), true);
  assert.equal(canUseInterviewThread(interviewThread, "company-2"), true);
});

test("interview access denies unrelated users and missing threads", () => {
  assert.equal(canUseInterviewThread(interviewThread, "other-user"), false);
  assert.equal(canUseInterviewThread(null, "freelancer-1"), false);
  assert.equal(canUseInterviewThread(undefined, "company-1"), false);
});
