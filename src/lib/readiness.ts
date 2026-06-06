import type { ResumeDocumentType } from "@prisma/client";

export type FreelancerReadinessProfile = {
  fullName?: string | null;
  desiredOccupation?: string | null;
  skills?: string | null;
  careerHistory?: {
    summary?: string | null;
    workExperiences?: string | null;
  } | null;
  documents?: Array<{
    documentType: ResumeDocumentType | string;
  }>;
};

export function getFreelancerReadiness(profile: FreelancerReadinessProfile | null | undefined) {
  const documentTypes = new Set(profile?.documents?.map((document) => document.documentType) ?? []);
  const items = [
    {
      key: "profile-name",
      label: "氏名",
      href: "/freelancer/profile",
      done: Boolean(profile?.fullName?.trim()),
    },
    {
      key: "profile-role",
      label: "希望職種",
      href: "/freelancer/profile",
      done: Boolean(profile?.desiredOccupation?.trim()),
    },
    {
      key: "profile-skills",
      label: "スキル",
      href: "/freelancer/profile",
      done: Boolean(profile?.skills?.trim()),
    },
    {
      key: "career-history",
      label: "職務経歴フォーム",
      href: "/freelancer/career",
      done: Boolean(profile?.careerHistory?.summary?.trim() || profile?.careerHistory?.workExperiences?.trim()),
    },
    {
      key: "resume-pdf",
      label: "履歴書PDF",
      href: "/freelancer/documents",
      done: documentTypes.has("resume"),
    },
    {
      key: "career-pdf",
      label: "職務経歴書PDF",
      href: "/freelancer/documents",
      done: documentTypes.has("career_history"),
    },
  ];
  const completed = items.filter((item) => item.done).length;

  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    isReady: completed === items.length,
  };
}
