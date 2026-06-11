export const reputationMinimumFeedbackCount = 3;

type FeedbackAggregate = {
  _avg: {
    followThroughRating: number | null;
    collaborationRating: number | null;
  };
  _count: {
    _all: number;
  };
};

export type ReputationSummary = {
  feedbackCount: number;
  completedInteractionCount: number;
  averageFollowThrough: number | null;
  averageCollaboration: number | null;
  hasEnoughHistory: boolean;
};

export function buildReputationSummary(aggregate: FeedbackAggregate, completedInteractionCount: number): ReputationSummary {
  const feedbackCount = aggregate._count._all;
  const hasEnoughHistory = feedbackCount >= reputationMinimumFeedbackCount;
  const averageFollowThrough = hasEnoughHistory ? roundOneDecimal(aggregate._avg.followThroughRating) : null;
  const averageCollaboration = hasEnoughHistory ? roundOneDecimal(aggregate._avg.collaborationRating) : null;

  assertReputationAverageInDomain(averageFollowThrough);
  assertReputationAverageInDomain(averageCollaboration);

  return {
    feedbackCount,
    completedInteractionCount,
    averageFollowThrough,
    averageCollaboration,
    hasEnoughHistory,
  };
}

function roundOneDecimal(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}

function assertReputationAverageInDomain(value: number | null) {
  if (value !== null && (value < 1 || value > 5)) {
    throw new Error("公開評価データに1〜5の範囲外の値が含まれています。");
  }
}
