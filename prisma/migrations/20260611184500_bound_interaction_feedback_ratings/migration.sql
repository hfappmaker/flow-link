ALTER TABLE "interaction_feedback"
  ADD CONSTRAINT "interaction_feedback_follow_through_rating_range_check"
  CHECK ("follow_through_rating" BETWEEN 1 AND 5) NOT VALID;

ALTER TABLE "interaction_feedback"
  ADD CONSTRAINT "interaction_feedback_collaboration_rating_range_check"
  CHECK ("collaboration_rating" BETWEEN 1 AND 5) NOT VALID;
