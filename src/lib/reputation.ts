import { InteractionFeedbackModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildReputationSummary } from "./reputation-summary.ts";
export {
  buildReputationSummary,
  reputationMinimumFeedbackCount,
  type ReputationSummary,
} from "./reputation-summary.ts";

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

  return buildReputationSummary(aggregate, completedInteractionCount);
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

  return buildReputationSummary(aggregate, completedInteractionCount);
}

function visibleFeedbackWhere(where: Prisma.InteractionFeedbackWhereInput) {
  return {
    ...where,
    moderationStatus: InteractionFeedbackModerationStatus.visible,
  } satisfies Prisma.InteractionFeedbackWhereInput;
}
