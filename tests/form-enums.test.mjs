import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationStatus,
  InterviewMessageType,
  JobApplicationStatus,
  JobPostStatus,
  ResumeDocumentType,
  UserRole,
} from "@prisma/client";

const {
  applicationStatusValues,
  interviewMessageTypeValues,
  jobApplicationStatusValues,
  jobPostStatusValues,
  parseApplicationStatus,
  parseInterviewMessageType,
  parseJobApplicationStatusFilter,
  parseJobPostStatus,
  parseResumeDocumentType,
  parseScreeningResultStatus,
  parseUserRole,
  resumeDocumentTypeValues,
  userRoleValues,
} = await import("../src/lib/form-enums.ts");

function sorted(values) {
  return [...values].sort();
}

test("form enum value lists stay aligned with Prisma enums", () => {
  assert.deepEqual(sorted(userRoleValues), sorted(Object.values(UserRole)));
  assert.deepEqual(sorted(resumeDocumentTypeValues), sorted(Object.values(ResumeDocumentType)));
  assert.deepEqual(sorted(jobPostStatusValues), sorted(Object.values(JobPostStatus)));
  assert.deepEqual(sorted(applicationStatusValues), sorted(Object.values(ApplicationStatus)));
  assert.deepEqual(sorted(jobApplicationStatusValues), sorted(Object.values(JobApplicationStatus)));
  assert.deepEqual(sorted(interviewMessageTypeValues), sorted(Object.values(InterviewMessageType)));
});

test("job post form statuses parse only valid Prisma enum values", () => {
  assert.equal(parseJobPostStatus(" published "), JobPostStatus.published);
  assert.equal(parseJobPostStatus("draft"), JobPostStatus.draft);
  assert.throws(() => parseJobPostStatus("archived"), /公開状態を確認してください。/);
  assert.throws(() => parseJobPostStatus(null), /公開状態を確認してください。/);

  assert.equal(parseApplicationStatus("open"), ApplicationStatus.open);
  assert.equal(parseApplicationStatus("paused"), ApplicationStatus.paused);
  assert.throws(() => parseApplicationStatus("closed"), /応募受付状態を確認してください。/);
  assert.throws(() => parseApplicationStatus(null), /応募受付状態を確認してください。/);
});

test("existing action enum parsers keep rejecting unsupported values", () => {
  assert.equal(parseUserRole("company_user"), UserRole.company_user);
  assert.throws(() => parseUserRole("admin"), /登録内容を確認してください。/);

  assert.equal(parseResumeDocumentType("resume"), ResumeDocumentType.resume);
  assert.throws(() => parseResumeDocumentType("portfolio"), /PDFファイルを選択してください。/);

  assert.equal(parseScreeningResultStatus("screening_passed"), JobApplicationStatus.screening_passed);
  assert.throws(() => parseScreeningResultStatus("applied"), /選考結果が不正です。/);

  assert.equal(parseInterviewMessageType("meeting_url"), InterviewMessageType.meeting_url);
  assert.throws(() => parseInterviewMessageType("file"), /メッセージ種別が不正です。/);
});

test("application status filters return typed values or all", () => {
  const allowedValues = [
    JobApplicationStatus.applied,
    JobApplicationStatus.screening_passed,
    JobApplicationStatus.screening_rejected,
  ];

  assert.equal(parseJobApplicationStatusFilter("screening_rejected", allowedValues), JobApplicationStatus.screening_rejected);
  assert.equal(parseJobApplicationStatusFilter("withdrawn", allowedValues), "all");
  assert.equal(parseJobApplicationStatusFilter(undefined, allowedValues), "all");
});
