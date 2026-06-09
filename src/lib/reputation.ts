import { InteractionFeedbackModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

export async function getCompanyReputationSummary(companyProfileId: string) {
  const where = visibleFeedbackWhere({ targetCompanyProfileId: companyProfileId });
  const [aggregate, completedInteractionCount] = await Promise.all([
    prisma.interactionFeedback.aggregate({
      where,
      _avg: { followThroughRating: true, collaborationRating: true },
      _count: { _all: true },
    }),
    prisma.interactionFeedback.count({ where: { ...where, interactionCompleted: true } }),
  ]);

  return buildSummary(aggregate, completedInteractionCount);
}

export async function getFreelancerReputationSummary(freelancerProfileId: string) {
  const where = visibleFeedbackWhere({ targetFreelancerProfileId: freelancerProfileId });
  const [aggregate, completedInteractionCount] = await Promise.all([
    prisma.interactionFeedback.aggregate({
      where,
      _avg: { followThroughRating: true, collaborationRating: true },
      _count: { _all: true },
    }),
    prisma.interactionFeedback.count({ where: { ...where, interactionCompleted: true } }),
  ]);

  return buildSummary(aggregate, completedInteractionCount);
}

function visibleFeedbackWhere(where: Prisma.InteractionFeedbackWhereInput) {
  return {
    ...where,
    moderationStatus: InteractionFeedbackModerationStatus.visible,
  } satisfies Prisma.InteractionFeedbackWhereInput;
}

function buildSummary(aggregate: FeedbackAggregate, completedInteractionCount: number): ReputationSummary {
  const feedbackCount = aggregate._count._all;
  const hasEnoughHistory = feedbackCount >= reputationMinimumFeedbackCount;

  return {
    feedbackCount,
    completedInteractionCount,
    averageFollowThrough: hasEnoughHistory ? roundOneDecimal(aggregate._avg.followThroughRating) : null,
    averageCollaboration: hasEnoughHistory ? roundOneDecimal(aggregate._avg.collaborationRating) : null,
    hasEnoughHistory,
  };
}

function roundOneDecimal(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}
