import assert from "node:assert/strict";
import test from "node:test";

const { buildReputationSummary } = await import("../src/lib/reputation-summary.ts");

test("reputation summary rounds valid averages inside the 1-5 rating domain", () => {
  assert.deepEqual(
    buildReputationSummary(
      {
        _avg: {
          followThroughRating: 4.666,
          collaborationRating: 1.333,
        },
        _count: { _all: 3 },
      },
      2,
    ),
    {
      feedbackCount: 3,
      completedInteractionCount: 2,
      averageFollowThrough: 4.7,
      averageCollaboration: 1.3,
      hasEnoughHistory: true,
    },
  );
});

test("reputation summary surfaces out-of-domain stored ratings instead of clamping them", () => {
  assert.throws(
    () =>
      buildReputationSummary(
        {
          _avg: {
            followThroughRating: 5.2,
            collaborationRating: 4,
          },
          _count: { _all: 3 },
        },
        3,
      ),
    /1〜5の範囲外/,
  );

  assert.throws(
    () =>
      buildReputationSummary(
        {
          _avg: {
            followThroughRating: 4,
            collaborationRating: 0.8,
          },
          _count: { _all: 3 },
        },
        3,
      ),
    /1〜5の範囲外/,
  );
});
