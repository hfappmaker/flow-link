import type {
  CompanyUser,
  FreelancerProfile,
  Prisma,
  UserRole,
} from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canUseInterviewThread, missingFreelancerProfileRedirect, roleMismatchRedirect } from "@/lib/page-guard-core";
import { prisma } from "@/lib/prisma";

export type PageUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: UserRole;
};

type FreelancerProfileForInclude<TInclude extends Prisma.FreelancerProfileInclude | undefined> =
  TInclude extends Prisma.FreelancerProfileInclude
    ? Prisma.FreelancerProfileGetPayload<{ include: TInclude }>
    : FreelancerProfile;

type CompanyUserForInclude<TInclude extends Prisma.CompanyUserInclude | undefined> =
  TInclude extends Prisma.CompanyUserInclude
    ? Prisma.CompanyUserGetPayload<{ include: TInclude }>
    : CompanyUser;

export async function requirePageUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user as PageUser;
}

export async function requireFreelancerPage() {
  const user = await requirePageUser();
  const roleRedirect = roleMismatchRedirect("freelancer", user.role);
  if (roleRedirect) redirect(roleRedirect);
  return user;
}

export async function requireCompanyPage() {
  const user = await requirePageUser();
  const roleRedirect = roleMismatchRedirect("company_user", user.role);
  if (roleRedirect) redirect(roleRedirect);
  return user;
}

export async function requireFreelancerProfile<TInclude extends Prisma.FreelancerProfileInclude | undefined = undefined>({
  currentPath,
  include,
}: {
  currentPath: string;
  include?: TInclude;
}) {
  const user = await requireFreelancerPage();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: user.id },
    ...(include ? { include } : {}),
  }) as FreelancerProfileForInclude<TInclude> | null;
  if (!profile) {
    const profileRedirect = missingFreelancerProfileRedirect(currentPath);
    if (profileRedirect) redirect(profileRedirect);
    notFound();
  }
  return { user, profile };
}

export async function optionalFreelancerProfile<TInclude extends Prisma.FreelancerProfileInclude | undefined = undefined>({
  include,
}: {
  include?: TInclude;
} = {}) {
  const user = await requireFreelancerPage();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: user.id },
    ...(include ? { include } : {}),
  }) as FreelancerProfileForInclude<TInclude> | null;
  return { user, profile };
}

export async function requireCompanyUser<TInclude extends Prisma.CompanyUserInclude | undefined = undefined>({
  include,
}: {
  include?: TInclude;
} = {}) {
  const user = await requireCompanyPage();
  const companyUser = await prisma.companyUser.findUnique({
    where: { userId: user.id },
    ...(include ? { include } : {}),
  }) as CompanyUserForInclude<TInclude> | null;
  if (!companyUser) notFound();
  return { user, companyUser };
}

export type InterviewThreadForPage = Prisma.InterviewThreadGetPayload<{
  include: {
    messages: { include: { sender: true } };
    jobApplication: {
      include: {
        freelancerProfile: { include: { careerHistory: true; documents: true } };
        jobPost: { include: { companyProfile: { include: { users: true } } } };
      };
    };
  };
}>;

export async function getInterviewThreadForPage(threadId: string) {
  const user = await requirePageUser();
  const thread = await prisma.interviewThread.findUnique({
    where: { id: threadId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { sender: true } },
      jobApplication: {
        include: {
          freelancerProfile: { include: { careerHistory: true, documents: true } },
          jobPost: { include: { companyProfile: { include: { users: true } } } },
        },
      },
    },
  });
  if (!canUseInterviewThread(thread, user.id)) return { user, thread: null };
  return { user, thread };
}
