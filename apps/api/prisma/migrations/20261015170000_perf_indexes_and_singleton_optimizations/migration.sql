-- Migration: 20261015170000_perf_indexes_and_singleton_optimizations
-- Principal Database & Backend Performance Optimization for Free-Tier DB

-- 1. Users Indexes
CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx" ON "User"("role", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");

-- 2. Programs Indexes
CREATE INDEX IF NOT EXISTS "Program_status_isActive_createdAt_idx" ON "Program"("status", "isActive", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Program_status_createdAt_idx" ON "Program"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Program_createdAt_idx" ON "Program"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Program_isActive_idx" ON "Program"("isActive");

-- 3. Steps & Lessons Indexes
CREATE INDEX IF NOT EXISTS "Step_programId_status_idx" ON "Step"("programId", "status");
CREATE INDEX IF NOT EXISTS "Lesson_stepId_status_idx" ON "Lesson"("stepId", "status");

-- 4. Batches Indexes
CREATE INDEX IF NOT EXISTS "Batch_status_startDate_idx" ON "Batch"("status", "startDate" DESC);
CREATE INDEX IF NOT EXISTS "Batch_startDate_idx" ON "Batch"("startDate" DESC);
CREATE INDEX IF NOT EXISTS "Batch_programId_idx" ON "Batch"("programId");
CREATE INDEX IF NOT EXISTS "Batch_managerId_idx" ON "Batch"("managerId");

-- 5. Enrolments Indexes
CREATE INDEX IF NOT EXISTS "Enrolment_createdAt_idx" ON "Enrolment"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Enrolment_batchId_createdAt_idx" ON "Enrolment"("batchId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Enrolment_programId_status_idx" ON "Enrolment"("programId", "status");
CREATE INDEX IF NOT EXISTS "Enrolment_userId_idx" ON "Enrolment"("userId");
CREATE INDEX IF NOT EXISTS "Enrolment_batchId_idx" ON "Enrolment"("batchId");
CREATE INDEX IF NOT EXISTS "Enrolment_programId_idx" ON "Enrolment"("programId");

-- 6. Progression & Resources Indexes
CREATE INDEX IF NOT EXISTS "StepProgress_overriddenById_idx" ON "StepProgress"("overriddenById");
CREATE INDEX IF NOT EXISTS "ResourceItem_createdById_idx" ON "ResourceItem"("createdById");

-- 7. Sessions & Bookings Indexes
CREATE INDEX IF NOT EXISTS "Session_learnerId_startTime_idx" ON "Session"("learnerId", "startTime" DESC);
CREATE INDEX IF NOT EXISTS "Session_hostTrainerId_startTime_idx" ON "Session"("hostTrainerId", "startTime" DESC);
CREATE INDEX IF NOT EXISTS "Session_batchId_sessionType_startTime_idx" ON "Session"("batchId", "sessionType", "startTime");
CREATE INDEX IF NOT EXISTS "Session_zoomMeetingId_idx" ON "Session"("zoomMeetingId");
CREATE INDEX IF NOT EXISTS "Session_providerMeetingId_idx" ON "Session"("providerMeetingId");
CREATE INDEX IF NOT EXISTS "Session_externalMeetingId_idx" ON "Session"("externalMeetingId");

CREATE INDEX IF NOT EXISTS "SessionBooking_userId_status_idx" ON "SessionBooking"("userId", "status");
CREATE INDEX IF NOT EXISTS "SessionBooking_sessionId_status_idx" ON "SessionBooking"("sessionId", "status");
CREATE INDEX IF NOT EXISTS "SessionBooking_createdAt_idx" ON "SessionBooking"("createdAt" DESC);

-- 8. Attendance & Daily Attendance Indexes
CREATE INDEX IF NOT EXISTS "Attendance_enrolmentId_status_idx" ON "Attendance"("enrolmentId", "status");
CREATE INDEX IF NOT EXISTS "Attendance_userId_status_idx" ON "Attendance"("userId", "status");
CREATE INDEX IF NOT EXISTS "Attendance_correctedById_idx" ON "Attendance"("correctedById");
CREATE INDEX IF NOT EXISTS "DailyAttendance_date_idx" ON "DailyAttendance"("date");

-- 9. Attendance Reconciliation Indexes
CREATE INDEX IF NOT EXISTS "UnmatchedAttendance_sessionId_joinTime_idx" ON "UnmatchedAttendance"("sessionId", "joinTime" ASC);
CREATE INDEX IF NOT EXISTS "UnmatchedAttendance_status_createdAt_idx" ON "UnmatchedAttendance"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "UnmatchedAttendance_linkedEnrolmentId_idx" ON "UnmatchedAttendance"("linkedEnrolmentId");
CREATE INDEX IF NOT EXISTS "UnmatchedAttendance_linkedUserId_idx" ON "UnmatchedAttendance"("linkedUserId");
CREATE INDEX IF NOT EXISTS "UnmatchedAttendance_resolvedById_idx" ON "UnmatchedAttendance"("resolvedById");

-- 10. Payments & Invoices Indexes
CREATE INDEX IF NOT EXISTS "Payment_enrolmentId_idx" ON "Payment"("enrolmentId");
CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Payment_couponId_idx" ON "Payment"("couponId");

CREATE INDEX IF NOT EXISTS "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Invoice_createdAt_idx" ON "Invoice"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Invoice_creditNoteId_idx" ON "Invoice"("creditNoteId");

-- 11. Coupons & Redemptions Indexes
CREATE INDEX IF NOT EXISTS "Coupon_isActive_expiresAt_idx" ON "Coupon"("isActive", "expiresAt");
CREATE INDEX IF NOT EXISTS "Coupon_createdAt_idx" ON "Coupon"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Coupon_discountType_idx" ON "Coupon"("discountType");

CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_redeemedAt_idx" ON "CouponRedemption"("couponId", "redeemedAt" DESC);
CREATE INDEX IF NOT EXISTS "CouponRedemption_enrolmentId_idx" ON "CouponRedemption"("enrolmentId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_paymentId_idx" ON "CouponRedemption"("paymentId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_redeemedAt_idx" ON "CouponRedemption"("redeemedAt" DESC);

-- 12. Certificates Indexes
CREATE INDEX IF NOT EXISTS "Certificate_approvedById_idx" ON "Certificate"("approvedById");
CREATE INDEX IF NOT EXISTS "Certificate_createdAt_idx" ON "Certificate"("createdAt" DESC);

-- 13. Messages & Conversations Indexes
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_conversationId_read_idx" ON "Message"("conversationId", "read");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Conversation_updatedAt_idx" ON "Conversation"("updatedAt" DESC);

-- 14. Notifications & Leads Indexes
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_deliveryStatus_schedule_idx" ON "Notification"("deliveryStatus", "schedule");

CREATE INDEX IF NOT EXISTS "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");

-- 15. Agreements & Templates Indexes
CREATE INDEX IF NOT EXISTS "SignedAgreement_templateId_signedAt_idx" ON "SignedAgreement"("templateId", "signedAt" DESC);
CREATE INDEX IF NOT EXISTS "SignedAgreement_userId_status_idx" ON "SignedAgreement"("userId", "status");
CREATE INDEX IF NOT EXISTS "AgreementTemplateVersion_templateId_createdAt_idx" ON "AgreementTemplateVersion"("templateId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AgreementTemplateVersion_createdById_idx" ON "AgreementTemplateVersion"("createdById");
