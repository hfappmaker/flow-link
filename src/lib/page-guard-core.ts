import type { UserRole } from "@prisma/client";

export function roleMismatchRedirect(expectedRole: UserRole, actualRole: UserRole | null | undefined) {
  if (actualRole === expectedRole) return null;
  if (expectedRole === "freelancer") return actualRole === "company_user" ? "/company" : "/login";
  return actualRole === "freelancer" ? "/freelancer" : "/login";
}

export function missingFreelancerProfileRedirect(currentPath: string) {
  return currentPath === "/freelancer/profile" ? null : "/freelancer/profile";
}

export function missingCompanyUserResult(companyUser: unknown) {
  return companyUser ? null : "not-found";
}

export function canUseInterviewThread(
  thread:
    | {
        jobApplication: {
          freelancerProfile: { userId: string };
          jobPost: { companyProfile: { users: Array<{ userId: string }> } };
        };
      }
    | null
    | undefined,
  userId: string,
) {
  if (!thread) return false;
  if (thread.jobApplication.freelancerProfile.userId === userId) return true;
  return thread.jobApplication.jobPost.companyProfile.users.some((user) => user.userId === userId);
}
