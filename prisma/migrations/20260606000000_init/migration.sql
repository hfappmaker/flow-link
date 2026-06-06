-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('freelancer', 'company_user');

-- CreateEnum
CREATE TYPE "CompanyMemberRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "ResumeDocumentType" AS ENUM ('resume', 'career_history');

-- CreateEnum
CREATE TYPE "JobPostStatus" AS ENUM ('draft', 'published', 'private', 'closed');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('open', 'paused');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('applied', 'screening_passed', 'screening_rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('screening_passed', 'screening_rejected');

-- CreateEnum
CREATE TYPE "InterviewThreadStatus" AS ENUM ('open', 'scheduled', 'closed');

-- CreateEnum
CREATE TYPE "InterviewMessageType" AS ENUM ('text', 'proposed_time', 'accepted_time', 'meeting_url');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freelancer_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "desired_occupation" TEXT,
    "skills" TEXT,
    "years_of_experience" INTEGER,
    "desired_rate" TEXT,
    "availability" TEXT,
    "available_from" TEXT,
    "preferred_location" TEXT,
    "remote_preference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freelancer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_documents" (
    "id" TEXT NOT NULL,
    "freelancer_profile_id" TEXT NOT NULL,
    "document_type" "ResumeDocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_histories" (
    "id" TEXT NOT NULL,
    "freelancer_profile_id" TEXT NOT NULL,
    "summary" TEXT,
    "work_experiences" TEXT,
    "projects" TEXT,
    "certifications" TEXT,
    "education" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_profile_id" TEXT NOT NULL,
    "role" "CompanyMemberRole" NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_posts" (
    "id" TEXT NOT NULL,
    "company_profile_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required_skills" TEXT,
    "preferred_skills" TEXT,
    "rate" TEXT,
    "workload" TEXT,
    "contract_period" TEXT,
    "location" TEXT,
    "remote_policy" TEXT,
    "openings" INTEGER,
    "status" "JobPostStatus" NOT NULL DEFAULT 'draft',
    "application_status" "ApplicationStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "job_post_id" TEXT NOT NULL,
    "freelancer_profile_id" TEXT NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'applied',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "screened_at" TIMESTAMP(3),
    "screened_by_company_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_notes" (
    "id" TEXT NOT NULL,
    "job_application_id" TEXT NOT NULL,
    "company_user_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_threads" (
    "id" TEXT NOT NULL,
    "job_application_id" TEXT NOT NULL,
    "status" "InterviewThreadStatus" NOT NULL DEFAULT 'open',
    "scheduled_at" TIMESTAMP(3),
    "meeting_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_messages" (
    "id" TEXT NOT NULL,
    "interview_thread_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "message_type" "InterviewMessageType" NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "proposed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_profiles_user_id_key" ON "freelancer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "resume_documents_freelancer_profile_id_document_type_key" ON "resume_documents"("freelancer_profile_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "career_histories_freelancer_profile_id_key" ON "career_histories"("freelancer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_user_id_key" ON "company_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_job_post_id_freelancer_profile_id_key" ON "job_applications"("job_post_id", "freelancer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_threads_job_application_id_key" ON "interview_threads"("job_application_id");

-- AddForeignKey
ALTER TABLE "freelancer_profiles" ADD CONSTRAINT "freelancer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_freelancer_profile_id_fkey" FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_histories" ADD CONSTRAINT "career_histories_freelancer_profile_id_fkey" FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_freelancer_profile_id_fkey" FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_screened_by_company_user_id_fkey" FOREIGN KEY ("screened_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_notes" ADD CONSTRAINT "screening_notes_job_application_id_fkey" FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_notes" ADD CONSTRAINT "screening_notes_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_threads" ADD CONSTRAINT "interview_threads_job_application_id_fkey" FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_interview_thread_id_fkey" FOREIGN KEY ("interview_thread_id") REFERENCES "interview_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

