import assert from "node:assert/strict";
import test from "node:test";

const {
  applicantKeywordCandidateTerms,
  applicantMatchesSearchQuery,
  filterApplicantsBySearchQuery,
} = await import("../src/lib/company-applicant-search.ts");
const {
  buildApplicationReview,
  skillMatchPercent,
} = await import("../src/lib/utils.ts");

test("company applicant search and review agree on canonical skill aliases", () => {
  const cases = [
    { query: "TS", requiredSkills: "TS", applicantSkills: "TypeScript, React" },
    { query: "Next JS", requiredSkills: "Next JS", applicantSkills: "Next.js, TypeScript" },
    { query: "NodeJS", requiredSkills: "NodeJS", applicantSkills: "Node.js, GraphQL" },
  ];

  for (const { query, requiredSkills, applicantSkills } of cases) {
    const matchingApplication = application({ id: `match-${query}`, skills: applicantSkills });
    const nonMatchingApplication = application({ id: `miss-${query}`, skills: "Go, GraphQL" });

    assert.equal(applicantMatchesSearchQuery(query, matchingApplication), true, `${query} should match applicant list search`);
    assert.equal(skillMatchPercent(requiredSkills, applicantSkills), 100, `${query} should match applicant review skills`);
    assert.deepEqual(
      filterApplicantsBySearchQuery([matchingApplication, nonMatchingApplication], query).map((item) => item.id),
      [matchingApplication.id],
      `${query} should keep only the canonical skill match`,
    );

    const review = buildApplicationReview({
      ...matchingApplication,
      jobPost: { requiredSkills },
    });
    assert.equal(review.matchPercent, 100, `${query} should preserve applicant detail/review matching`);
  }
});

test("company applicant search rejects short skill fragments", () => {
  const reactApplication = application({ skills: "React, TypeScript" });

  assert.equal(applicantMatchesSearchQuery("act", reactApplication), false);
  assert.deepEqual(filterApplicantsBySearchQuery([reactApplication], "act"), []);
});

test("company applicant keyword candidates include aliases and broad text terms", () => {
  assert.deepEqual(applicantKeywordCandidateTerms("TS"), ["TS", "TypeScript"]);
  assert.deepEqual(applicantKeywordCandidateTerms("Next JS"), ["Next JS", "Next", "JS", "Next.js", "NextJS"]);
  assert.deepEqual(applicantKeywordCandidateTerms("NodeJS"), ["NodeJS", "Node.js"]);
  assert.deepEqual(applicantKeywordCandidateTerms("frontend Tokyo"), ["frontend Tokyo", "frontend", "Tokyo"]);
});

function application(overrides = {}) {
  return {
    id: overrides.id ?? "application-1",
    status: overrides.status ?? "applied",
    proposalMessage: overrides.proposalMessage ?? "Platform delivery experience.",
    proposedStart: overrides.proposedStart ?? "2026-07-01",
    freelancerProfile: {
      fullName: overrides.fullName ?? "Aoi Tanaka",
      desiredOccupation: overrides.desiredOccupation ?? "Frontend engineer",
      skills: overrides.skills ?? "React, TypeScript",
      preferredLocation: overrides.preferredLocation ?? "Tokyo remote",
      documents: overrides.documents ?? [{ id: "doc-1" }, { id: "doc-2" }],
      careerHistory: overrides.careerHistory ?? { summary: "Frontend apps" },
    },
  };
}
