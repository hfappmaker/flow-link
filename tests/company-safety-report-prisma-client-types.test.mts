import type { Prisma } from "@prisma/client";

const companySafetyReportWhereInput: Prisma.CompanySafetyReportWhereInput = {
  jobApplicationId: { in: ["application-1"] },
  interviewThreadId: "thread-1",
};

void companySafetyReportWhereInput;
