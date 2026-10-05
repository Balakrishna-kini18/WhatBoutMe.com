# WhatBoutMe LMS — Technical Requirements Document (TRD)

> **Version:** 1.2 (Enterprise Best Practice Update)  
> **Date:** September 29, 2026  
> **Source Documents:** [PRD.md](file:///c:/Users/lenovo/Desktop/whataboutme/PRD.md), [ARCHITECTURE.md](file:///c:/Users/lenovo/Desktop/whataboutme/ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](file:///c:/Users/lenovo/Desktop/whataboutme/IMPLEMENTATION_PLAN.md)

---

## 1. Purpose & Scope

The Technical Requirements Document (TRD) serves as the definitive technical blueprint. It translates the business rules (PRD) and system structure (Architecture) into strict logical constraints, API contracts, database behaviors, and security protocols required for implementation.

---

## 2. Core Engine Logic & State Machines

### 2.1 Enrolment & Onboarding State Machine
**Requirement:** Strict progression from payment to active learning.
**Technical Flow:**
1. `PENDING_PAYMENT`: User created, Stripe Session generated.
2. `PENDING_AGREEMENT`: Stripe Webhook (`checkout.session.completed`) triggers update.
3. `ACTIVE`: User posts base64 signature canvas. Backend converts to PDF, uploads to AWS S3, updates state to ACTIVE.

*Constraint:* Any `GET /api/steps` or `GET /api/lessons` request while `status !== 'ACTIVE'` must throw `403 Forbidden` with a standardized payload:
```json
{ "error": "Agreement Required", "code": "E_AGREEMENT_PENDING", "redirect": "/agreement" }
```

### 2.2 The Progression Engine (Step Unlock Logic)
**Requirement:** Step N+1 unlocks only when Step N's content is viewed and quiz passed.
**Logic Rules:**
The `StepsService.checkUnlockStatus(userId, stepId)` must evaluate the following boolean tree:
1. **Manual Override:** If `BatchStepOverride` table has `isUnlocked = true` for `(batchId, stepId)` -> `RETURN TRUE`.
2. **Date Lock:** If `Batch.releaseSchedule == 'DRIP'` and `current_time < releaseDate(stepId)` -> `RETURN FALSE`.
3. **Previous Step Check:** 
   - Get `Step N-1`. If null (is Step 1), `RETURN TRUE`.
   - `LessonsCheck:` Are all lessons in `Step N-1` marked `viewed = true` in `UserLessonProgress`?
   - `QuizCheck:` Does `Attempt` table have `status = 'PASSED'` for `quizId` of `Step N-1`?
   - `RETURN (LessonsCheck && QuizCheck)`.

### 2.3 Media Delivery & Content Protection (DRM)
**Requirement:** Content cannot be downloaded; video must have a moving watermark.
**Technical Flow:**
1. **Frontend:** Requests `GET /api/lessons/:id/signed-url`
2. **Backend (NestJS):** Validates JWT and `checkUnlockStatus()`.
3. **Mux (Video):** Generates a 15-minute expiring JWT for the Mux Video Player. The JWT payload must include `watermark: { text: user.email, opacity: 0.3 }`.
4. **AWS S3 (PDF/Audio):** Generates an AWS S3 `GetObject` presigned URL expiring in 15 minutes.
*Constraint:* File endpoints must never return a permanent `.mp4` or `.pdf` link.

---

## 3. Asynchronous Processes & Background Jobs

All async tasks are managed by **BullMQ** running on AWS ElastiCache (Redis).

### 3.1 Zoom Attendance Cron Logic
**Schedule:** `*/10 * * * *` (Every 10 mins).
**Worker Logic:**
1. Query DB: `SELECT id, zoomMeetingId FROM Session WHERE endTime < NOW() - INTERVAL '10 minutes' AND attendancePulled = FALSE`.
2. For each meeting, call Zoom API: `GET /metrics/meetings/{zoomMeetingId}/participants`.
3. Map Zoom emails to LMS `User.email`.
4. Bulk insert into `Attendance` table.
5. Update `Session.attendancePulled = TRUE`.
*Constraint:* Must handle Zoom pagination if participants > 300.

---

## 4. API & Data Contracts (Contract-First Approach)

### 4.1 Strict API Payload: Quiz Submission
To ensure frontend and backend are aligned, the Quiz submission payload must strictly follow this DTO (Data Transfer Object):
**POST** `/api/quizzes/:quizId/submit`
*Request:*
```json
{
  "attemptId": "uuid-v4",
  "answers": [
    { "questionId": "uuid-v4", "selectedOptionId": "uuid-v4" }
  ]
}
```
*Response (200 OK):*
```json
{
  "score": 85,
  "passed": true,
  "unlockedStepId": "uuid-v4-next-step",
  "certificateGenerated": false
}
```

### 4.2 Global Error Handling
The NestJS `HttpExceptionFilter` must intercept all errors to prevent stack trace leaks.
*Contract format:*
```json
{
  "statusCode": 400,
  "timestamp": "2026-09-29T12:00:00Z",
  "path": "/api/quizzes/submit",
  "message": "Validation failed",
  "code": "E_VALIDATION",
  "details": { "answers": "Array is required" }
}
```

---

## 5. Security, Privacy & Infrastructure Protocols

### 5.1 Data Privacy (GDPR Compliance)
- **Soft Deletes:** `DELETE /api/users/:id` must NOT drop the row. It must set `deletedAt = NOW()`, scramble the `email` to a hashed string (e.g., `deleted_user_8f72a@domain.com`), and nullify the `name` to satisfy "Right to be Forgotten" without breaking relational data (like aggregate revenue).
- **Encryption:** All Stripe customer IDs and Zoom OAuth refresh tokens must be encrypted at rest using AES-256-GCM before saving to PostgreSQL.

### 5.2 API Security Headers (Helmet & CORS)
- **CORS:** Must strictly whitelist `https://whatboutme.com` and `https://admin.whatboutme.com`. Wildcards (`*`) are prohibited in production.
- **Helmet:** Must enforce `Content-Security-Policy` (CSP) allowing only scripts from the LMS domain, Mux, and Stripe.

### 5.3 Observability & Logging Standards
All backend logs must use Winston and be structured as JSON for ingestion into Sentry/Datadog.
*Required Log Format:*
```json
{
  "level": "error",
  "message": "Stripe webhook signature verification failed",
  "context": "StripeWebhookController",
  "traceId": "x-request-id-uuid",
  "userId": "uuid-if-known",
  "timestamp": "2026-09-29T12:00:00Z"
}
```

### 5.4 Concurrency & Transaction Safety
- **Quiz Submissions:** To prevent double-grading, the submission logic must use PostgreSQL row-level locks and run inside a Prisma `$transaction`.
- **Waitlist Seats:** `SELECT * FROM Batch WHERE id = X FOR UPDATE` is required when allocating a waitlist seat to prevent capacity overrides.

### 5.5 CI/CD Quality Gates
The GitHub Actions pipeline will enforce:
1. `npm run type-check` (Zero TS errors allowed).
2. `npm run lint` (ESLint strict mode).
3. `npm run test:e2e` (Playwright tests must pass for Checkout, Login, and Step 1).
4. `npm run test:cov` (Minimum 80% coverage on `StepsModule`).
