import {
  recommendationFeedbackAdjustment,
  type RecommendationFeedbackSignal,
} from "./recommendation-feedback.ts";
import {
  buildTrustConfidence,
  directContractChecklist,
  matchedSkills,
  parseSkills,
  preferenceAwareMatchScore,
  skillMatchPercent,
  trustRecommendationAdjustment,
  visiblePreferenceReasons,
  type CompanyTrustInput,
  type JobTrustInput,
  type WorkPreferenceInput,
} from "./utils.ts";

export const READY_TO_APPLY_SCORE_THRESHOLD = 70;
export const READY_TO_APPLY_CONTRACT_THRESHOLD = 80;

export type JobRecommendationJob = JobTrustInput & {
  id: string;
  applicationStatus?: string | null;
  createdAt: Date | string;
  description?: string | null;
  preferredSkills?: string | null;
  requiredSkills?: string | null;
  title?: string | null;
  companyProfile?: CompanyTrustInput | null;
};

export type JobRecommendationContext = {
  appliedJobIds?: Iterable<string>;
  freelancerReadinessPercent?: number | null;
  freelancerSkills?: string | null;
  recommendationFeedback?: RecommendationFeedbackSignal[];
  savedJobIds?: Iterable<string>;
  workPreference?: WorkPreferenceInput;
};

export type JobRecommendation<J extends JobRecommendationJob> = {
  job: J;
  contractReadiness: ReturnType<typeof directContractChecklist>;
  contractReadinessPercent: number;
  directScore: number;
  isFreshCandidate: boolean;
  isOpen: boolean;
  isReadyToApply: boolean;
  isSkillMatched: boolean;
  matchPercent: number | null;
  matched: string[];
  preferenceReasons: ReturnType<typeof visiblePreferenceReasons>;
  requiredSkills: string[];
  skillGaps: string[];
  trustConfidence: ReturnType<typeof buildTrustConfidence> | null;
};

export type RecommendationFitFilter = "" | "skill" | "ready";
export type RecommendationSort = "direct" | "new";

export function buildJobRecommendation<J extends JobRecommendationJob>(
  job: J,
  context: JobRecommendationContext = {},
  options: { preferenceReasonLimit?: number; trustAdjusted?: boolean } = {},
): JobRecommendation<J> {
  const appliedJobIds = new Set(context.appliedJobIds ?? []);
  const savedJobIds = new Set(context.savedJobIds ?? []);
  const requiredSkills = parseSkills(job.requiredSkills);
  const matched = matchedSkills(job.requiredSkills, context.freelancerSkills);
  const matchedSkillSet = new Set(matched.map((skill) => skill.toLowerCase()));
  const skillGaps = requiredSkills.filter((skill) => !matchedSkillSet.has(skill.toLowerCase()));
  const matchPercent = skillMatchPercent(job.requiredSkills, context.freelancerSkills);
  const contractReadiness = directContractChecklist(job);
  const trustConfidence = job.companyProfile ? buildTrustConfidence({ company: job.companyProfile, job }) : null;
  const baseDirectScore = preferenceAwareMatchScore({
    ...job,
    freelancerReadinessPercent: context.freelancerReadinessPercent,
    freelancerSkills: context.freelancerSkills,
    workPreference: context.workPreference,
  });
  const trustAdjustment = options.trustAdjusted === false || !trustConfidence ? 0 : trustRecommendationAdjustment(trustConfidence);
  const isOpen = job.applicationStatus === "open";
  const isFreshCandidate = !appliedJobIds.has(job.id) && !savedJobIds.has(job.id);
  const feedbackAdjustment = recommendationFeedbackAdjustment({
    applied: appliedJobIds.has(job.id),
    feedback: context.recommendationFeedback,
    job: {
      ...job,
      companyProfileId:
        "companyProfileId" in job && job.companyProfileId
          ? String(job.companyProfileId)
          : job.companyProfile && "id" in job.companyProfile
            ? String(job.companyProfile.id)
            : null,
    },
    saved: savedJobIds.has(job.id),
    workPreference: context.workPreference,
  });
  const directScore = Math.max(0, Math.min(100, baseDirectScore + trustAdjustment + feedbackAdjustment.adjustment));

  return {
    job,
    contractReadiness,
    contractReadinessPercent: contractReadiness.percent,
    directScore,
    isFreshCandidate,
    isOpen,
    isReadyToApply: isOpen && directScore >= READY_TO_APPLY_SCORE_THRESHOLD && contractReadiness.percent >= READY_TO_APPLY_CONTRACT_THRESHOLD,
    isSkillMatched: isOpen && (matchPercent ?? 0) > 0,
    matchPercent,
    matched,
    preferenceReasons: [
      ...feedbackAdjustment.reasons,
      ...visiblePreferenceReasons(
        {
          ...job,
          freelancerReadinessPercent: context.freelancerReadinessPercent,
          freelancerSkills: context.freelancerSkills,
          workPreference: context.workPreference,
        },
        options.preferenceReasonLimit ?? 4,
      ),
    ].slice(0, options.preferenceReasonLimit ?? 4),
    requiredSkills,
    skillGaps,
    trustConfidence,
  };
}

export function buildJobRecommendations<J extends JobRecommendationJob>(
  jobs: J[],
  context: JobRecommendationContext = {},
  options: { preferenceReasonLimit?: number; trustAdjusted?: boolean } = {},
) {
  return jobs.map((job) => buildJobRecommendation(job, context, options));
}

export function filterJobRecommendations<J extends JobRecommendationJob>(
  recommendations: JobRecommendation<J>[],
  filters: { candidate?: "fresh" | ""; fit?: RecommendationFitFilter } = {},
) {
  return recommendations.filter((recommendation) => {
    const matchesCandidate = filters.candidate !== "fresh" || recommendation.isFreshCandidate;
    if (filters.fit === "skill") return matchesCandidate && recommendation.isSkillMatched;
    if (filters.fit === "ready") return matchesCandidate && recommendation.isReadyToApply;
    return matchesCandidate;
  });
}

export function sortJobRecommendations<J extends JobRecommendationJob>(
  recommendations: JobRecommendation<J>[],
  sort: RecommendationSort = "direct",
) {
  return [...recommendations].sort((a, b) => {
    if (sort === "direct") {
      return b.directScore - a.directScore || b.contractReadinessPercent - a.contractReadinessPercent || jobTime(b.job) - jobTime(a.job);
    }
    return jobTime(b.job) - jobTime(a.job);
  });
}

export function rankJobRecommendations<J extends JobRecommendationJob>(
  jobs: J[],
  context: JobRecommendationContext = {},
  options: {
    candidate?: "fresh" | "";
    fit?: RecommendationFitFilter;
    preferenceReasonLimit?: number;
    sort?: RecommendationSort;
    trustAdjusted?: boolean;
  } = {},
) {
  return sortJobRecommendations(
    filterJobRecommendations(buildJobRecommendations(jobs, context, options), { candidate: options.candidate, fit: options.fit }),
    options.sort ?? "direct",
  );
}

export type DiscoveryIntentCounts = {
  conditionReady: number;
  fresh: number;
  preparation: number;
  readyToApply: number;
  skillMatched: number;
};

export function buildDiscoveryIntentCounts<J extends JobRecommendationJob>({
  jobs,
  readinessComplete,
}: {
  jobs: JobRecommendation<J>[];
  readinessComplete: boolean;
}): DiscoveryIntentCounts {
  return jobs.reduce<DiscoveryIntentCounts>(
    (counts, recommendation) => {
      if (recommendation.isReadyToApply && recommendation.isFreshCandidate && readinessComplete) {
        counts.readyToApply += 1;
      }
      if (recommendation.isSkillMatched && recommendation.isFreshCandidate) {
        counts.skillMatched += 1;
      }
      if (recommendation.isOpen && recommendation.contractReadinessPercent === 100) {
        counts.conditionReady += 1;
      }
      if (recommendation.isFreshCandidate) {
        counts.fresh += 1;
      }
      if (recommendation.isOpen && recommendation.isFreshCandidate && !readinessComplete) {
        counts.preparation += 1;
      }

      return counts;
    },
    { conditionReady: 0, fresh: 0, preparation: 0, readyToApply: 0, skillMatched: 0 },
  );
}

export function countReadySavedJobs<J extends JobRecommendationJob>(
  savedJobs: JobRecommendation<J>[],
  appliedByJobId: Map<string, string>,
) {
  return savedJobs.filter((recommendation) => !appliedByJobId.has(recommendation.job.id) && recommendation.isReadyToApply).length;
}

function jobTime(job: Pick<JobRecommendationJob, "createdAt">) {
  const time = new Date(job.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}
