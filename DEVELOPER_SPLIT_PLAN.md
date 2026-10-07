# WhatBoutMe LMS — Complete Two-Developer Implementation Plan
**Document Version:** 2.3.0
**Date:** October 2, 2026
**Sources of Truth:**
- Client PDF: *"WhatBoutMe LMS: Development Plan"* (Sep 28, 2026) — Business Source of Truth
- Architecture Baseline v3 & Final Review — Technical Baseline
- Current Repository (`apps/api/`) — Implementation Evidence Only

---

## 1. Project-Wide Rules

### 1.1 Team Division of Labour
- **Developer 1 (Lead / User):** Sole owner of the canonical database schema, all Prisma migrations, core LMS domain logic, authentication, authorization, agreement gates, session/booking business rules, attendance scoring rules, certificate eligibility rules, payment domain rules, and data reporting.
- **Developer 2 (Infrastructure & Integration Partner):** Sole owner of Cloudinary media engineering, private object storage integration (Cloudinary for development), BullMQ worker infrastructure, Redis TCP connection, Resend email infrastructure, Zoom provider, Google Meet provider, Microsoft Graph / Outlook integration, Sentry observability, Docker DevOps, Socket.IO realtime transport, and Stripe webhook infrastructure.

### 1.2 Absolute Boundary Constraints
1. **Prisma & Database Isolation:** Developer 1 is the **ONLY** developer permitted to run `prisma migrate dev`, `prisma migrate deploy`, or edit `schema.prisma`. Developer 2 must never generate or commit database migrations.
2. **Cloudinary Isolation:** Developer 2 possesses the Cloudinary credentials and owns 100% of Cloudinary configuration, SDK setup, signed URL generation, authenticated uploads, and webhook processing. Developer 1 must **NOT** need, configure, or possess Cloudinary credentials.
3. **Database Environment Neutrality:** Development uses Neon PostgreSQL Free Tier (`DATABASE_URL` pooled, `DIRECT_URL` unpooled). The Prisma schema retains `directUrl = env("DIRECT_URL")`. Application logic must remain 100% vanilla PostgreSQL and Prisma client code so it can migrate to AWS RDS in production without code edits.
4. **BullMQ Protocol:** BullMQ queues and workers **MUST** connect to Redis via TCP/RESP (using local Docker Redis 7 on `localhost:6379` in development). Upstash Redis REST API is strictly prohibited for BullMQ.
5. **Contract-First Development:** Developers must agree on all TypeScript interfaces (Shared Contracts) before starting parallel tasks. Developer 1 codes against interfaces; Developer 2 implements providers.
6. **No Prototype Preservation:** Existing prototype code in `apps/api` is treated as evidence of what is missing or broken. Legacy artifacts (`packages/database/`, `modules/mux/`, order mock tables, auto-enrolment hacks) will be purged.
7. **Development Object Storage Strategy:** Development uses Cloudinary (`CloudinaryObjectStorageProvider`) for all private files (PDFs, audio, agreements, certificates) to eliminate cloud storage provisioning costs during development. All domain logic and worker services interact exclusively with the provider-neutral `IObjectStorageProvider` abstraction. Developer 1 writes code against `IObjectStorageProvider` with zero provider coupling, while Developer 2 owns the storage provider implementation and Cloudinary credentials. No AWS/R2 credentials or cloud storage accounts are required for local development.

### 1.3 Role Terminology & Batch Scoping
- The canonical Prisma schema enforces four roles: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `USER`.
- **`Role.MANAGER` encompasses both "Manager" and "Trainer"** from the client PDF (§1.3, lines 69–79):
  - *Cohort Trainers:* Assigned to specific batches via the `BatchTrainer` relation to conduct live sessions, grade oral assessments, and view batch-specific learner progress.
  - *Corporate Managers:* Assigned to corporate batches/companies to monitor employee progression and attendance.
- Both use `Role.MANAGER` and are strictly scoped by `BatchAccessGuard`. Neither can access unassigned batches or cross-batch data. No separate `TRAINER` role is introduced into the database enum, preserving data model simplicity while enforcing domain-level batch isolation.

---

## 2. Master Architecture & Integration Allocation Matrix

| Area / Technology | Developer 1 (ME / Domain & Lead) | Developer 2 (Other Developer / Infra & Integrations) | Shared Contract / Interface |
|:---|:---|:---|:---|
| **Resend** | Defines business events triggering email; passes typed template data to queue | Integrates Resend SDK, API keys, delivery logging, retry logic, bounce tracking | `IEmailService`, `EmailJobPayload<T>` |
| **React Email** | Defines required content fields and variables for each template | Implements and compiles React Email JSX templates into responsive HTML | `EmailTemplate` enum, template props schemas |
| **Cloudinary** | Consumes signed playback URLs; authorizes learner access to video steps | **100% Owner:** Account setup, SDK, credentials, authenticated delivery, signed URLs (5m TTL), domain restrictions, static text watermark overlay, webhooks | `IMediaProvider`, `PlaybackOptions`, `UploadSignatureOptions` |
| **Private Object Storage (Cloudinary in Dev)** | Authorizes learner access to private files (PDFs, audio, agreements, certs) via `IObjectStorageProvider` | Implements `CloudinaryObjectStorageProvider` for development; handles authenticated uploads, short-lived signed URLs, and worker buffer persistence | `IObjectStorageProvider`, pre-signed URL & upload generator |
| **Zoom** | Owns session/booking business rules, capacity, attendance compliance logic | Owns Zoom S2S OAuth, meeting CRUD, cloud recording fetch, participant report ingestion, webhook HMAC verification | `IMeetingProvider`, `ParticipantAttendanceRecord` |
| **Google Meet** | Consumes generic meeting interface; provider-neutral session records | Full provider implementation: Google Workspace service account, Calendar/Meet API space create/update/cancel, Google Drive recording fetch (with manual URL fallback), Admin Reports API attendance ingestion (with manual trainer marking fallback) | `IMeetingProvider`, `MeetingProviderFactory` |
| **Microsoft Graph / Outlook** | Defines booking scheduling windows, cancellation rules, trainer timezones, calls `getBusySlots()` for clash prevention | Azure AD app auth, MS Graph client, free/busy lookup (`getSchedule`), calendar event CRUD with Meet/Zoom links | `ICalendarProvider`, `CalendarEventDto`, `TimeSlot` |
| **BullMQ** | Enqueues jobs with typed payloads from business services | Sets up `@nestjs/bullmq`, queue configs, retries/backoff, idempotency, dead-letter monitoring | Typed job payloads (`apps/api/src/common/contracts/jobs.ts`) |
| **Redis** | None | Configures Docker Redis 7 on TCP port 6379, persistent volume, worker TCP connection (No Upstash REST for BullMQ) | Redis TCP connection URI (`REDIS_URL`) |
| **Socket.IO** | Conversation models, participant routing, message persistence, chat authorization | Gateway, `@socket.io/redis-adapter` for multi-instance scaling, WebSocket JWT handshake auth guard | `REALTIME_EVENTS`, socket payload schemas |
| **Stripe (DEFERRED)** | Payment state machine, enrolment activation, coupons, refund rules, invoice numbering | Stripe SDK, Checkout sessions, Customer portal, webhook endpoint, signature verification, idempotency | `PaymentEventPayload`, `StripeWebhookEvent` schema |
| **Neon PostgreSQL** | Owns connection strategy: pooled `DATABASE_URL` + unpooled `DIRECT_URL` in Prisma datasource | Verifies worker DB connection string | `DATABASE_URL`, `DIRECT_URL` |
| **Prisma** | **Sole Owner:** Canonical `schema.prisma`, all migration files, seed script, constraints, indexes | Pulls Git changes, executes `npx prisma generate` locally. Never creates migrations | Generated Prisma Client types |
| **Authentication / JWT** | Custom NestJS auth, JWT access/refresh tokens, session tracking, 2-device limit lock, revoked-session check | Consumes JWT in WebSocket guard; delivers auth emails via worker | `JwtPayload`, `AuthenticatedUser` |
| **OAuth 2.0 (Integrations)**| None (OAuth2 is for external provider APIs, not learner login) | Manages OAuth credentials and token refresh cycles for Zoom S2S, Google Workspace, Azure AD | Provider credentials and token managers |
| **Permissions / RBAC** | `permissions.config.ts`, `ROLE_PERMISSIONS` matrix, `PermissionsGuard`, `@RequirePermission()`, `BatchAccessGuard` (for `Role.MANAGER` / Trainers) | Adheres to guards on all infrastructure and ingestion routes | Permission keys enum, `BatchAccessGuard` |
| **Session / Booking Business** | Booking quotas, lead time rules (configurable default: 12h), reschedule/cancellation cutoffs (configurable default: 24h), timezone conversion, Outlook clash prevention via `getBusySlots()` | Injects external join links (Zoom/Meet) and creates Outlook calendar events | `CreateMeetingDto`, `CalendarEventDto` |
| **Attendance** | Attendance state machine, configurable threshold rule (default: 80%, client example: 75%), participant email reconciliation, duration aggregation across reconnects, unmatched attendee review queue, manual overrides with mandatory `correctionReason` | Ingests Zoom/Meet participant attendance reports via BullMQ worker | `AttendanceImportJobPayload`, `ParticipantAttendanceRecord` |
| **Certificates** | Eligibility rules (11 steps + 11 quizzes + 50-question exam + oral pass + closing call + attendance threshold), corporate participation certificate track, approval workflow, public verification endpoint with LinkedIn "Add to Profile" parameters | Background worker rendering PDF (`pdf-lib`), stores via `IObjectStorageProvider`, returns signed download link | `CertificateGenJobPayload` |
| **Chat** | Conversation state machine (`OPEN` -> `ASSIGNED` -> `RESOLVED`), batch-scoped routing, message validation | Realtime transport, typing indicators, read receipts, WebSocket room joins | `REALTIME_EVENTS`, `SendMessageDto` |
| **Notifications** | Determines notification triggers, recipient targeting, in-app notification records | Dispatches emails via Resend and real-time alerts via Socket.IO | `NotificationJobPayload` |
| **Reporting** | Complex analytics queries: attendance compliance, step funnel drop-offs, assessment scores, CSV export | Offloads large export generation to worker (if async) | `ReportQueryDto`, CSV stream contracts |

---

## 3. Developer 1 — Complete Task List (ME / Domain & Lead)

### A. Database / Prisma & Infrastructure Cleanup
- [ ] **D1-001:** Retain `directUrl = env("DIRECT_URL")` in `schema.prisma`. Verify connectivity against Neon PostgreSQL pooled and unpooled endpoints.
- [ ] **D1-002:** Delete obsolete `packages/database/` directory and remove all references in root `package.json` and workspaces.
- [ ] **D1-003:** Purge legacy `Order`, `OrderStatus`, and `OrderProvider` models from `schema.prisma`.
- [ ] **D1-004:** Define canonical authentication models: `User` (with `country`, `timezone`, `emailVerifiedAt`, `twoFactorSecret`, `twoFactorEnabled`, `twoFactorBackupCodes`), `DeviceSession`, `EmailVerificationToken`, `PasswordResetToken`, `OtpCode`, and `LoginAudit`.
- [ ] **D1-005:** Define LMS core models: `Program`, `ProgramStep`, `Lesson`, `Resource`, `Batch`, `BatchTrainer`, `Enrolment` (status: `PENDING_PAYMENT`, `PENDING_AGREEMENT`, `ACTIVE`, `WAITLIST`, `COMPLETED`, `REVOKED`), and `StepProgress`.
  - Add Content Studio lifecycle `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`) to `Program`, `ProgramStep`, and `Lesson` to support admin authoring, reordering, and preview mode without affecting live batches.
  - Add `releaseSchedule` (`IMMEDIATE`, `BATCH_SCHEDULED`) and optional `unlockDelayDays` to `ProgramStep` for cohort drip schedules.
  - Add scoping (`STEP_SPECIFIC`, `PROGRAM_LIBRARY`) and access classification (`VIEW_ONLY_PDF`, `DOWNLOADABLE_WORKSHEET`, `STREAMABLE_AUDIO`) to `Resource` to enforce in-app view-only versus downloadable permissions.
- [ ] **D1-006:** Define assessment models: `QuestionBank`, `Question` (MULTIPLE_CHOICE, MULTI_SELECT, SHORT_ANSWER), `Quiz`, `QuizAttempt`, `QuizAnswer`, `Exam`, `ExamAttempt`, `OralAssessment`, and `OralAssessmentScore`. Include fields for retry limits, cooldown timers, pass marks, rubric scores, qualitative trainer notes, and retry guidance.
- [ ] **D1-007:** Define agreement models: `AgreementTemplate` and `SignedAgreement` (recording user ID, version, typed signature text, IP address, user agent, signed timestamp).
- [ ] **D1-008:** Define session & attendance models: `Session` (status: `SCHEDULED`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`), `SessionBooking`, `Attendance` (status: `ABSENT`, `PRESENT_AUTO`, `PRESENT_MANUAL`, `CORRECTED`; `correctionReason`, `correctedById`), and meeting provider metadata.
- [ ] **D1-009:** Define certificate models: `Certificate` (status: `ELIGIBLE`, `PENDING`, `APPROVED`, `ISSUED`, `REJECTED`; `certificateCode`, `verificationHash`, `issueDate`, `approvedById`, `revokedAt`, `cpdHours`, `certificateType: PROFESSIONAL | CORPORATE_PARTICIPATION`).
- [ ] **D1-010:** Add composite indexes: `[userId, status]` on Enrolments, `[batchId, date]` on Sessions, `[sessionId, userId]` on Attendance, `[programId, stepNumber]` on ProgramSteps, and unique constraint on `Certificate.certificateCode`.
- [ ] **D1-011:** Execute `prisma migrate dev --name sprint-0-baseline` on Neon PostgreSQL. Verify migration table generation.
- [ ] **D1-012:** Author canonical seed script `apps/api/prisma/seed.ts` (Super Admin, Admins, Managers/Trainers, sample program "11 Steps to U", 11 steps, active batch, test learners).

### B. Authentication & Session Management
- [ ] **D1-013:** Build `class-validator` DTOs: `SignupDto`, `LoginDto`, `EmailVerificationDto`, `PasswordResetRequestDto`, `PasswordResetConfirmDto`, `OtpSendDto`, `OtpVerifyDto`, `TotpSetupDto`, `TotpVerifyDto`.
- [ ] **D1-014:** Implement signup business flow capturing `country` and `timezone`. Remove auto-enrolment hacks. Generate verification token and enqueue verification email job.
- [ ] **D1-015:** Implement email verification endpoint (`GET /auth/verify-email?token=...`) with 24-hour expiry check and token invalidation.
- [ ] **D1-016:** Implement credential login validating email/password, active status, and email verification.
- [ ] **D1-017:** Fix the 2-device limit bug in `createDeviceSession()`: enforce `maxSessions = 2` for `USER` role. Execute session count and oldest-session eviction inside PostgreSQL transaction using `pg_advisory_xact_lock(userId)` to prevent concurrency race conditions.
- [ ] **D1-018:** Implement JWT access token (15m) and refresh token (7d) issuance. Implement `POST /auth/refresh` with secure refresh token rotation.
- [ ] **D1-019:** Fix critical JWT strategy revocation bug in `apps/api/src/modules/auth/jwt.strategy.ts`: explicitly verify `session.revokedAt === null` and `session.expiresAt > new Date()`.
- [ ] **D1-020:** Implement one-time email OTP login (`POST /auth/otp/send` and `POST /auth/otp/verify`). Generate 6-digit cryptographic code with 10-minute expiry and 5-attempt rate limit. Enqueue OTP email job.
- [ ] **D1-021:** Implement password reset flow (`POST /auth/password-reset/request` and `POST /auth/password-reset/confirm`). Revoke all active user sessions on successful password reset.
- [ ] **D1-022:** Implement RFC 6238 TOTP 2FA for `SUPER_ADMIN` and `ADMIN` roles (`/auth/2fa/generate`, `/auth/2fa/enable`, `/auth/2fa/verify`). Store encrypted secret and backup codes.
- [ ] **D1-023:** Implement logout (`POST /auth/logout`), multi-device revocation (`POST /auth/sessions/revoke-others`), and session list endpoint (`GET /auth/sessions`).
- [ ] **D1-024:** Implement security audit logging in `LoginAudit`: track IP, User-Agent, country, device fingerprint, and flag suspicious country-hopping.

### C. Authorization & Permissions
- [ ] **D1-025:** Create `permissions.config.ts` defining granular named permissions (`programs:create`, `content:unlock`, `attendance:correct`, `certificates:approve`, etc.).
- [ ] **D1-026:** Create `ROLE_PERMISSIONS` dictionary mapping `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `USER` to named permissions.
- [ ] **D1-027:** Implement `@RequirePermission(...permissions: string[])` decorator and `PermissionsGuard` (with universal Super Admin bypass).
- [ ] **D1-028: Manager / Trainer Batch Scoping Guard**
  Implement `BatchAccessGuard`. Restrict `Role.MANAGER` (which encompasses corporate batch managers and external trainers per client PDF §1.3) so they can only view or mutate batches, enrolments, attendance, and reports for batches explicitly assigned to them in `BatchTrainer` / manager assignment tables.
- [ ] **D1-029:** Write Vitest security tests validating RBAC boundaries, permission denial, manager batch isolation, and session revocation.

### D. Core LMS & Progression Engine
- [ ] **D1-030: Content Studio Authoring & Hierarchy Management**
  Implement CRUD services and controllers for Programs, Steps, and Lessons. Enforce ordering constraints (`stepNumber`, `lessonOrder`). Support draft, publish, reorder, and preview states.
- [ ] **D1-031:** Build Batch management endpoints (lifecycle: `UPCOMING`, `ACTIVE`, `COMPLETED`, `ARCHIVED`; trainer assignment, capacity).
- [ ] **D1-032:** Implement Enrolment state machine (`PENDING_PAYMENT` -> `PENDING_AGREEMENT` -> `ACTIVE` -> `COMPLETED` / `REVOKED` / `WAITLIST`). Enforce prerequisite: enrolment cannot become `ACTIVE` until agreement is signed.
- [ ] **D1-033: Hybrid Step Progression Engine (Sequential + Cohort Release Schedule)**
  Implement progression rules: Step $N$ unlocks automatically when Step $N-1$ mandatory lessons and quiz are passed AND the batch's scheduled release date (batch start date + step schedule) has been reached. Admins/Managers retain manual override (unlock/re-lock) capability with audit logging.
- [ ] **D1-034:** Implement manual step override endpoints (`POST /enrolments/:id/steps/:stepId/unlock` and `re-lock`) for Admins/Managers with mandatory audit logging.
- [ ] **D1-035:** Implement lesson progress tracking (`POST /progress/lessons/:id`). Track video watch percent ($progressPercent \ge 90\%$), audio listening, or text confirmation.
- [ ] **D1-036:** Build Question Bank and Quiz engine (`POST /quizzes/:id/start`, `POST /quizzes/:id/submit`). Evaluate scores against pass threshold (10 questions per step quiz).
- [ ] **D1-037:** Implement quiz retry throttling (max 3 attempts), cooldown period (24 hours between failures), and question pool randomization.
- [ ] **D1-038: Comprehensive 50-Question Final Exam & Oral Assessment Rubrics**
  Implement formal final written exam: exactly 50 questions randomly pooled and shuffled from step question banks, timed execution (configurable default: 90 minutes), distinct pass mark, and retry cooldown timers. Implement oral assessment scoring rubrics with qualitative trainer feedback notes, retry instructions, and pass/fail status.

### E. Agreements Domain
- [ ] **D1-039:** Implement Agreement Template versioning (`v1.0`, `v2.0`). Ensure historical signed agreements remain immutable.
- [ ] **D1-040:** Implement agreement signing endpoint (`POST /agreements/sign`). Validate enrolment, record typed name, IP, User-Agent, and timestamp.
- [ ] **D1-041:** Implement Agreement Gate interceptor: block learner access to Step 1 content until signed agreement exists.
- [ ] **D1-042:** Log immutable audit record on agreement signing.

### F. Session & Booking Business Logic
- [ ] **D1-043:** Implement Session scheduling service for 1-on-1 coaching and group cohorts (stored in UTC with host trainer ID and capacity).
- [ ] **D1-044: Learner Booking Engine & Outlook Clash Prevention**
  Implement `POST /sessions/:id/book`. Validate enrolment eligibility, batch membership, booking quotas, and advance booking notice (configurable policy default: 12 hours). Invoke `ICalendarProvider.getBusySlots()` to verify Roweena has no calendar clash in Outlook before confirming the booking.
- [ ] **D1-045:** Implement timezone transformation utility: convert between database UTC, trainer timezone, and learner local timezone.
- [ ] **D1-046: Reschedule & Cancellation Rules**
  Implement `POST /bookings/:id/reschedule` and `POST /bookings/:id/cancel`. Enforce cancellation policy cutoff (configurable policy default: 24 hours prior to session).
- [ ] **D1-047:** Consume `IMeetingProvider` to schedule sessions without coupling domain logic to Zoom or Google Meet.

### G. Attendance Business Logic
- [ ] **D1-048:** Implement Attendance domain service: manage statuses `ABSENT`, `PRESENT_AUTO`, `PRESENT_MANUAL`, and `CORRECTED`.
- [ ] **D1-048b: Participant Email Reconciliation & Unmatched Review Queue**
  Build reconciliation engine processing normalized participant reports from Zoom and Google Meet. Aggregate cumulative duration across multiple reconnects within the same session. Match participant emails against enroled batch learners; flag unmatched attendees for Admin/Manager review and manual linkage.
- [ ] **D1-049: Attendance Compliance Calculation**
  Implement attendance compliance calculator: verify whether learner attended required live cohort sessions against a configurable program/batch attendance threshold (configurable policy default: 80%, client example: 75%).
- [ ] **D1-050:** Implement manual attendance override endpoint (`PATCH /attendance/:id/override`) requiring mandatory `correctionReason` and logging `correctedById`.

### H. Certificate Business Logic
- [ ] **D1-051: Comprehensive Certificate Eligibility Engine**
  Implement evaluation service: a learner is `ELIGIBLE` for standard Professional Certification if and only if: (1) All 11 program steps complete, (2) All 11 step quizzes passed, (3) Final 50-question exam passed, (4) Oral assessment marked `PASSED`, (5) Configurable attendance threshold met, and (6) 1-on-1 closing call marked completed.
- [ ] **D1-051b: Corporate Participation Certificate Track**
  Implement separate eligibility logic for corporate tracks: requires only workshop attendance (bypasses 50-question exam, quizzes, closing call, and CPD tracking) and generates a corporate certificate of participation.
- [ ] **D1-052:** Implement Certificate approval workflow (`ELIGIBLE` -> `PENDING_APPROVAL` -> `APPROVED` -> `ISSUED` / `REJECTED`).
- [ ] **D1-053: Certificate Code, CPD Tracking & Public Verification API**
  Generate tamper-proof unique certificate IDs (`WBM-2026-XXXX`), record accredited CPD hours on the certificate, and build public endpoint `GET /api/certificates/verify/:code` returning verified recipient name, program name, issue date, validity state, and pre-formatted LinkedIn "Add to Profile" URL parameters (`certName`, `organizationId`, `issueYear`, `issueMonth`, `certUrl`).

### I. Payments & Billing Business Logic (Phase 7 — Deferred)
- [ ] **D1-054:** Implement Payment state machine (`PENDING`, `PAID`, `FAILED`, `REFUNDED`) and link payments to Enrolment activation.
- [ ] **D1-055:** Implement coupon calculation engine (percentage discounts, fixed amounts, expiry dates, batch limits, usage caps).
- [ ] **D1-056:** Implement refund rules: revoke enrolment access on refund and issue cancellation invoice record.

### J. Chat Domain Logic (Phase 6 — Deferred)
- [x] **D1-057:** Implement Conversation and Message database services (`OPEN`, `ASSIGNED`, `RESOLVED`, `REOPENED`).
- [x] **D1-058:** Implement chat routing rules: route learner inquiries to assigned batch trainers/managers; prevent unsolicited cross-learner direct messaging.

### K. Reporting & Analytics Queries
- [ ] **D1-059:** Author optimized Prisma queries for batch attendance distributions, compliance percentages, and absent rates.
- [ ] **D1-060:** Build learner progress drop-off analytics identifying bottlenecks across program steps.
- [ ] **D1-061:** Build assessment analytics: pass/fail ratios, question difficulty metrics, and score averages.
- [ ] **D1-062:** Build CSV export streaming endpoints (`GET /admin/reports/:type/export`) for attendance, progress, and financial data.

---

## 4. Developer 2 — Complete Task List (Infra & Integrations)

### A. Cloudinary Media Infrastructure (100% Owned by Dev 2)
- [x] **D2-001:** Configure Cloudinary account and SDK in `apps/api`. Set up `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- [x] **D2-002:** Configure video upload pipeline to store LMS videos strictly as `type: 'authenticated'`. Verify public unsigned URLs return 404/401.
- [x] **D2-003:** Implement `CloudinaryMediaProvider.generateSignedPlaybackUrl()` with `sign_url: true` and short TTL (300 seconds / 5 minutes).
- [ ] **D2-004:** Configure Cloudinary Allowed Strict Referral Domains (`whatboutme.com` and authorized frontend origins) to block hotlinking.
- [x] **D2-005:** Configure adaptive bitrate streaming delivery (HLS/DASH profiles `sp_auto`, 1080p, 720p, 480p).
- [x] **D2-006: Server-Side Static Watermark Transformation**
  Implement Cloudinary text overlay transformation utility pinning the learner’s email/ID onto the video stream at fixed coordinates (e.g., bottom-right) per signed playback URL. *Note: Truly animated/moving watermarks are handled client-side by the custom video player wrapper overlay (Frontend responsibility), while server-side animated watermarking remains a deferred spike (Spike U1).*
- [x] **D2-007:** Implement video thumbnail extraction at specified offsets with signed delivery URLs.
- [x] **D2-008:** Implement backend endpoint `POST /media/upload-signature` generating signed parameters for secure direct-from-client uploads.
- [x] **D2-009:** Implement webhook listener `POST /webhooks/cloudinary` with HMAC-SHA256 signature verification to process video encoding completion and metadata.
- [x] **D2-010:** Implement exponential backoff and rate-limit handling for Cloudinary API requests.
- [x] **D2-011:** Implement shared `IMediaProvider` interface using Cloudinary.
- [x] **D2-012:** Author automated test suite verifying signed URL generation, expiration parameter enforcement, and signature validity without leaking API secrets.





### B. Private Object Storage (Development: Cloudinary)
- [x] **D2-013: Development Object Storage Architecture**
  Implement `CloudinaryObjectStorageProvider` for development adhering to `IObjectStorageProvider`, using authenticated uploads (`type: 'authenticated'`, `resource_type: 'raw' | 'image' | 'video'`). Configure `STORAGE_PROVIDER=cloudinary` for local development. Ensure zero AWS/R2 account or paid cloud storage requirements during development.
- [x] **D2-014: Signed Delivery URLs with Resource-Specific TTLs**
  Implement `IObjectStorageProvider.getPresignedGetUrl(key, expiresInSeconds)`. Enforce appropriate TTL defaults: 60 seconds for downloadable documents (PDFs, worksheets, signed agreements, certificates), and 300 seconds (5 minutes) for streaming audio lessons to support audio seek/buffer range requests without premature expiration.
- [x] **D2-015:** Implement `IObjectStorageProvider.getPresignedPutUrl(key, contentType, expiresInSeconds)` for authorized admin uploads.
- [x] **D2-015b: In-Memory Worker Buffer Upload**
  Implement `IObjectStorageProvider.uploadBuffer(key, buffer, contentType)` enabling backend services and workers (e.g., certificate generation) to directly persist in-memory rendered files without circular HTTP roundtrips.
- [x] **D2-016:** Implement secure streaming fallback proxy with security headers (`Content-Disposition: inline`, `X-Content-Type-Options: nosniff`).








### C. BullMQ / Redis Infrastructure
- [x] **D2-017:** Configure Docker Redis 7 Alpine in `docker-compose.yml` on TCP port 6379 with persistent volume.
- [x] **D2-018:** Install `@nestjs/bullmq` and `bullmq`. Configure NestJS `BullModule.forRoot()` strictly via Redis TCP/RESP (`redis://localhost:6379`). Explicitly reject HTTP/REST for BullMQ.
- [x] **D2-019:** Register queues: `email`, `notification`, `attendance-import`, `certificate-gen`, `calendar-sync`, `media-process`, `invoice-gen`. Configure 3-attempt exponential backoff.
- [x] **D2-020:** Create isolated background worker entrypoint `apps/api/src/worker.ts`.
- [x] **D2-021:** Implement job idempotency using deterministic BullMQ `jobId`s to prevent duplicate processing during retries.
- [x] **D2-022:** Configure dead-letter handling, failed job event listeners, and Sentry error alerting.








### D. Email Infrastructure (Resend & React Email)
- [x] **D2-023:** Install `resend`. Configure `EmailService` with `RESEND_API_KEY` and default sender `WhatBoutMe <no-reply@whatboutme.com>`.
- [x] **D2-024:** Set up `@react-email/components` and branded WhatBoutMe email layout.
- [x] **D2-025:** Build React Email templates for Auth: `SignupWelcomeEmail`, `EmailVerificationEmail`, `PasswordResetEmail`, `OneTimeOtpEmail`.
- [x] **D2-026:** Build React Email templates for LMS:
  - `EnrolmentConfirmedEmail` (welcome to batch, next steps, calendar link)
  - `AgreementSignedConfirmationEmail` (copy of signed agreement record)
  - `SessionBookingConfirmationEmail`
  - `SessionReminderEmail` (24h and 1h reminders)
  - `SessionCancelledEmail`
  - `SessionRescheduledEmail`
  - `OralAssessmentResultEmail` (pass or retry instructions)
  - `CertificateIssuedEmail` (with download and verification links)
- [x] **D2-027:** Implement BullMQ `email` processor in `worker.ts`: render templates to HTML, dispatch via Resend SDK, and handle delivery status.
- [x] **D2-028:** Implement email delivery logging in `EmailDeliveryLog` and fallback mock logger for local dev when `RESEND_API_KEY` is not set.








### E. Zoom Integration
- [x] **D2-029:** Implement Zoom Server-to-Server (S2S) OAuth 2.0 service with automated in-memory token refresh.
- [x] **D2-030:** Implement `ZoomMeetingProvider` adhering to `IMeetingProvider` (`createMeeting()`, `updateMeeting()`, `cancelMeeting()`).
- [x] **D2-031:** Implement `getRecordingUrl()` querying Zoom Cloud Recording API for completed sessions.
- [x] **D2-032:** Implement `getParticipantReport()` querying Zoom Reports API to return normalized participant attendance records.
- [x] **D2-033:** Implement webhook listener `POST /webhooks/zoom` with challenge validation and HMAC-SHA256 signature verification. Dispatch events to BullMQ.









### F. Google Meet Integration
- [ ] **D2-034:** Configure Google APIs client (`googleapis`) with service account credentials and domain-wide delegation.
- [ ] **D2-035: Google Meet Provider Full Implementation (`GoogleMeetProvider`)**
  Implement `IMeetingProvider` using Google Calendar API (`conferenceDataVersion=1`) for meeting creation, update, and cancellation. Implement `getRecordingUrl()` by querying Google Drive API for Meet recordings in the host's drive (with manual admin URL upload fallback). Implement `getParticipantReport()` via Google Workspace Admin SDK Reports API (with manual attendance marking fallback if tenant licensing restricts API access).
- [ ] **D2-036:** Implement `MeetingProviderFactory` dynamically resolving Zoom or Google Meet based on configuration.







### G. Microsoft Graph / Outlook Calendar Integration
- [ ] **D2-037:** Configure `@microsoft/microsoft-graph-client` using Azure AD application permissions (client ID, tenant ID, client secret).
- [ ] **D2-038:** Implement `ICalendarProvider`: create, update, and cancel calendar events in Roweena's primary Outlook calendar, embedding the generated Zoom or Google Meet join URL.
- [ ] **D2-039:** Implement `getBusySlots()` querying MS Graph `POST /users/{id}/calendar/getSchedule` to detect conflicting bookings.
- [ ] **D2-040:** Implement `CalendarSyncProcessor` in BullMQ worker for asynchronous calendar event syncing.






### H. Realtime Infrastructure (Socket.IO — Phase 6 Deferred)
- [x] **D2-041:** Install `@nestjs/websockets`, `@nestjs/platform-socket.io`, and `@socket.io/redis-adapter`. Configure adapter with Redis TCP.
- [x] **D2-042:** Implement WebSocket JWT connection guard validating handshake tokens against session store.
- [x] **D2-043:** Implement room routing (`conversation:${id}`, `batch:${id}`), message broadcasting, typing indicators, and read receipts.





### I. Observability & Health
- [x] **D2-044:** Install and configure `@sentry/nestjs` in `main.ts` and `worker.ts`. Filter sensitive auth data and capture unhandled exceptions.
- [x] **D2-045:** Implement `GET /api/health` using `@nestjs/terminus` checking PostgreSQL and Redis TCP ping.
- [x] **D2-046:** Implement structured JSON logger with correlation IDs and timestamps.



### J. Deployment & DevOps Infrastructure
- [ ] **D2-047:** Create multi-stage production `Dockerfile` supporting dual commands (`main.js` and `worker.js`).
- [ ] **D2-048:** Update `docker-compose.yml` orchestrating Redis 7, API container, and Worker container.
- [ ] **D2-049:** Create comprehensive `.env.example` documenting all configuration keys.
- [ ] **D2-050:** Prepare AWS ECS Fargate task definitions and CloudWatch logging templates.





### K. Certificate PDF Generation Infrastructure (Phase 5)
- [x] **D2-051:** Implement `CertificateGenProcessor` in BullMQ using `pdf-lib` to render certificate visual template, recipient name, course name, date, and QR code.
- [x] **D2-052:** Upload rendered certificate PDF to private object storage via `IObjectStorageProvider.uploadBuffer()` (`certificates/${certificateCode}.pdf`) and return object key to certificate service.



### L. Stripe Infrastructure (Phase 7 — Deferred)
- [ ] **D2-053:** Install `stripe` SDK and initialize client with API secrets.
- [ ] **D2-054:** Implement `POST /webhooks/stripe` with raw body parsing and signature verification (`stripe.webhooks.constructEvent`).
- [ ] **D2-055:** Implement idempotency logging in `StripeWebhookEvent` and dispatch events to payment queue.

---


## 5. Cloudinary Ownership & Security Specification

### 5.1 Strict Ownership Model
Developer 2 is the **sole custodian** of Cloudinary.
- Developer 2 configures the Cloudinary account, sets up the cloud name and API credentials, and provides the NestJS integration.
- Developer 1 **must never** touch Cloudinary credentials, config files, or SDK calls. Developer 1 only receives and returns signed URLs generated by Developer 2's `IMediaProvider`.

### 5.2 Security Architecture & PDF Compliance
The Client PDF Content Protection requirement (§3.2, lines 405-419) mandates that video content must be strictly protected against unauthorized distribution.

```
┌─────────────────────────────────────────────────────────────┐
│                   CLOUDINARY SECURITY PIPELINE               │
└─────────────────────────────────────────────────────────────┘
  1. UPLOAD TIME
     • Assets uploaded strictly with: `type: 'authenticated'`
     • Delivery type: `authenticated` (blocks all unsigned public requests)
     • Stored in secure folder hierarchy: `/courses/{programId}/`
                               │
                               ▼
  2. URL GENERATION (ON-THE-FLY)
     • Developer 1 validates learner enrolment and unlocked step
     • Developer 2's `CloudinaryMediaProvider` signs the delivery URL:
       - `sign_url: true`
       - Short expiry: `expires_at = now() + 300` (5 minutes)
       - Server-Side Static Watermark transformation (fixed coordinates per URL):
         `l_text:Arial_24_bold:${encodeURIComponent(learnerEmail)}/co_rgb:ffffff,o_30/fl_layer_apply,g_south_east,x_20,y_20`
                               │
                               ▼
  3. DELIVERY GATEWAY
     • Strict Referrer Enforcement: "Allowed strict referral domains"
       configured in Cloudinary settings (`whatboutme.com`)
     • Any request from unauthorized origins or expired links -> 403 Forbidden
                               │
                               ▼
  4. CLIENT-SIDE DETERRENCE (FRONTEND TEAM)
     • Custom video player wrapper (no right-click, no native download)
     • Moving / floating watermark overlay periodically moving coordinates across the player canvas
```

### 5.3 Explicit Security Limitations & Watermark Architecture
- **No DRM Claim:** Cloudinary does **NOT** provide digital rights management (Widevine/FairPlay/PlayReady). Cloudinary cannot prevent OS-level screen capture or HDMI capture cards.
- **Three-Tier Watermark Strategy:**
  1. *Server-Side Static Watermark (Cloudinary — Developer 2):* Cloudinary embeds a static text overlay (learner email/ID) at fixed coordinates into the signed streaming manifest URL. This provides server-side forensic traceability without costly video re-encoding.
  2. *Client-Side Moving Watermark (Custom Player — Frontend Team):* The frontend video player renders an animated text watermark that continuously shifts position across the video canvas over time.
  3. *Server-Side Animated Watermarking (Deferred Spike U1):* True frame-by-frame server-side moving watermarking (burning moving text via FFmpeg) is a separate deferred technical spike and is NOT part of the current implementation commitment.
- **Deterrence Model:** The security model implemented is **deterrence and traceability**:
  1. Direct file download is blocked.
  2. Shared URLs expire after 5 minutes.
  3. Video embed links do not load outside `whatboutme.com`.
  4. Static and client-moving watermarks trace any illicit screen recordings back to the specific learner account.

---

## 6. Shared Contracts (Interfaces & Types)

Before starting parallel implementation, both developers must commit and adhere to the following TypeScript interfaces in `apps/api/src/common/contracts/`:

### 6.1 Media Provider Contract
*Owner: Developer 2 | Consumer: Developer 1*

```typescript
export interface PlaybackOptions {
  learnerId: string;
  learnerEmail: string;
  expiresInSeconds?: number; // default: 300 (5 min)
}

export interface UploadSignatureOptions {
  folder: string;
  publicId?: string;
  tags?: string[];
}

export interface UploadSignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export interface MediaMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  format: string;
  byteSize: number;
}

export interface IMediaProvider {
  generateSignedPlaybackUrl(videoId: string, options: PlaybackOptions): Promise<string>;
  generateUploadSignature(options: UploadSignatureOptions): Promise<UploadSignatureResult>;
  getMediaMetadata(videoId: string): Promise<MediaMetadata>;
}
```

### 6.2 Private Object Storage Contract
*Owner: Developer 2 | Consumer: Developer 1*

```typescript
export interface IObjectStorageProvider {
  getPresignedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getPresignedPutUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
}
```

### 6.3 Email Service & Queue Payload Contracts
*Owner: Developer 2 | Consumer: Developer 1*

```typescript
export enum EmailTemplate {
  SIGNUP_WELCOME = 'signup-welcome',
  EMAIL_VERIFICATION = 'email-verification',
  PASSWORD_RESET = 'password-reset',
  OTP_LOGIN = 'otp-login',
  ENROLMENT_CONFIRMED = 'enrolment-confirmed',
  AGREEMENT_CONFIRMATION = 'agreement-confirmation',
  SESSION_BOOKED = 'session-booked',
  SESSION_REMINDER = 'session-reminder',
  SESSION_CANCELLED = 'session-cancelled',
  SESSION_RESCHEDULED = 'session-rescheduled',
  ORAL_ASSESSMENT_RESULT = 'oral-assessment-result',
  CERTIFICATE_ISSUED = 'certificate-issued',
}

export interface EmailJobPayload<T = Record<string, any>> {
  to: string;
  template: EmailTemplate;
  subject: string;
  data: T;
  idempotencyKey?: string;
}

export interface IEmailService {
  queueEmail<T>(payload: EmailJobPayload<T>): Promise<void>;
}
```

### 6.4 Meeting Provider Contract
*Owner: Developer 2 | Consumer: Developer 1*

```typescript
export interface CreateMeetingDto {
  topic: string;
  startTime: Date;
  durationMinutes: number;
  hostEmail: string;
  agenda?: string;
}

export interface MeetingDetails {
  providerMeetingId: string;
  joinUrl: string;
  hostUrl?: string;
  passcode?: string;
}

export interface ParticipantAttendanceRecord {
  participantEmail: string;
  participantName: string;
  joinTime: Date;
  leaveTime: Date;
  durationMinutes: number;
}

export interface IMeetingProvider {
  createMeeting(dto: CreateMeetingDto): Promise<MeetingDetails>;
  updateMeeting(providerMeetingId: string, dto: Partial<CreateMeetingDto>): Promise<void>;
  cancelMeeting(providerMeetingId: string): Promise<void>;
  getRecordingUrl(providerMeetingId: string): Promise<string | null>;
  getParticipantReport(providerMeetingId: string): Promise<ParticipantAttendanceRecord[]>;
}
```

### 6.5 Calendar Provider Contract
*Owner: Developer 2 | Consumer: Developer 1*

```typescript
export interface CalendarEventDto {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendeeEmails: string[];
  locationUrl?: string; // Zoom or Google Meet link
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface ICalendarProvider {
  createEvent(calendarId: string, event: CalendarEventDto): Promise<string>;
  updateEvent(calendarId: string, eventId: string, event: Partial<CalendarEventDto>): Promise<void>;
  cancelEvent(calendarId: string, eventId: string): Promise<void>;
  getBusySlots(userEmail: string, rangeStart: Date, rangeEnd: Date): Promise<TimeSlot[]>;
}
```

### 6.6 Queue Job Payloads
*Shared Definitions for BullMQ Workers*

```typescript
export interface AttendanceImportJobPayload {
  sessionId: string;
  providerMeetingId: string;
  provider: 'ZOOM' | 'GOOGLE_MEET';
}

export interface CertificateGenJobPayload {
  enrolmentId: string;
  learnerId: string;
  certificateCode: string;
  issueDate: string;
  cpdHours?: number;
  certificateType: 'PROFESSIONAL' | 'CORPORATE_PARTICIPATION';
}

export interface CalendarSyncJobPayload {
  action: 'CREATE' | 'UPDATE' | 'CANCEL';
  bookingId: string;
  sessionId: string;
}

export interface MediaProcessJobPayload {
  resourceId: string;
  providerAssetId: string;
}

export interface NotificationJobPayload {
  userId: string;
  title: string;
  body: string;
  channel: 'IN_APP' | 'EMAIL' | 'BOTH';
}
```

### 6.7 Realtime & Audit Event Contracts
*Shared Definitions*

```typescript
export const REALTIME_EVENTS = {
  CLIENT_SEND_MESSAGE: 'chat:send_message',
  CLIENT_TYPING: 'chat:typing',
  CLIENT_MARK_READ: 'chat:mark_read',
  SERVER_NEW_MESSAGE: 'chat:new_message',
  SERVER_USER_TYPING: 'chat:user_typing',
  SERVER_MESSAGE_READ: 'chat:message_read',
  SERVER_NOTIFICATION: 'notification:received',
} as const;

export interface AuditEventPayload {
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}
```

---

## 7. Database / Migration Ownership

### 7.1 The Non-Negotiable Law
> **Developer 1 is the sole database administrator.**
> Developer 2 must **never** execute `prisma migrate dev`, edit `schema.prisma`, or push migrations.

### 7.2 Schema Modification Protocol (When Dev 2 Needs Schema Changes)
If Developer 2 requires a database change (e.g., adding `StripeWebhookEvent`, adding fields to `DeviceSession`):
```
┌─────────────────────────────────────────────────────────────┐
│                 SCHEMA MODIFICATION WORKFLOW                │
└─────────────────────────────────────────────────────────────┘
  Step 1: Developer 2 creates an RFC / Issue
          - Explains the technical requirement
          - Proposes exact fields, relations, and nullability
                               │
                               ▼
  Step 2: Developer 1 reviews the proposal
          - Checks naming conventions, indexes, constraints
          - Validates against business rules and data models
                               │
                               ▼
  Step 3: Developer 1 modifies `apps/api/prisma/schema.prisma`
          - Executes `prisma migrate dev --name <migration_name>`
          - Validates generated SQL migration file
                               │
                               ▼
  Step 4: Developer 1 commits and pushes
          - Pushes migration file and updated Prisma schema to Git
                               │
                               ▼
  Step 5: Developer 2 pulls Git updates
          - Developer 2 runs `npx prisma generate` locally
          - Developer 2 consumes newly updated TypeScript types
```

---

## 8. Environment Secrets & Credentials Ownership

| Secret Key | Owner | Description / Purpose | Environment |
|:---|:---:|:---|:---|
| `DATABASE_URL` | **Dev 1** | Neon PostgreSQL pooled connection for runtime queries | Dev / Staging |
| `DIRECT_URL` | **Dev 1** | Neon PostgreSQL unpooled direct connection for Prisma migrations | Dev / Staging |
| `JWT_ACCESS_SECRET` | **Dev 1** | Secret for signing short-lived access JWTs (15m) | All |
| `JWT_REFRESH_SECRET`| **Dev 1** | Secret for signing refresh tokens (7d) | All |
| `TOTP_ENCRYPTION_KEY`| **Dev 1** | AES-256 key for encrypting admin TOTP secrets in the database | All |
| `CLOUDINARY_CLOUD_NAME` | **Dev 2** | Cloudinary account identifier | All |
| `CLOUDINARY_API_KEY` | **Dev 2** | Cloudinary API key | All |
| `CLOUDINARY_API_SECRET` | **Dev 2** | Cloudinary API secret | All |
| `STORAGE_PROVIDER` | **Dev 2** | Object storage provider flag (`cloudinary` for development) | Dev / Staging |
| `REDIS_URL` | **Dev 2** | Redis TCP connection string (`redis://localhost:6379`) | Dev / Staging |
| `RESEND_API_KEY` | **Dev 2** | Resend transactional email API key | All |
| `ZOOM_ACCOUNT_ID` | **Dev 2** | Zoom Server-to-Server OAuth Account ID | All |
| `ZOOM_CLIENT_ID` | **Dev 2** | Zoom Server-to-Server OAuth Client ID | All |
| `ZOOM_CLIENT_SECRET` | **Dev 2** | Zoom Server-to-Server OAuth Client Secret | All |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | **Dev 2** | Zoom webhook HMAC validation secret | All |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | **Dev 2** | Google Workspace service account JSON credentials | All |
| `AZURE_TENANT_ID` | **Dev 2** | Azure AD Tenant ID for Microsoft Graph | All |
| `AZURE_CLIENT_ID` | **Dev 2** | Azure AD Application (client) ID | All |
| `AZURE_CLIENT_SECRET` | **Dev 2** | Azure AD Application secret | All |
| `ROWEENA_OUTLOOK_UPN`| **Dev 2** | Roweena's Microsoft 365 User Principal Name / email | All |
| `SENTRY_DSN` | **Dev 2** | Sentry project DSN for error reporting | All |
| `STRIPE_SECRET_KEY` | **Dev 2** | Stripe API secret key (DEFERRED — Phase 7) | Phase 7 |
| `STRIPE_WEBHOOK_SECRET` | **Dev 2** | Stripe webhook signing secret (DEFERRED — Phase 7) | Phase 7 |

---

## 9. Phase-by-Phase Implementation Split

### Phase 1 — Foundation & Core Scaffolding
- **Developer 1:**
  - Verify `directUrl` in `schema.prisma`; purge `packages/database/`.
  - Clean `schema.prisma`: remove old Mux/Order models, add auth token tables, device sessions, and audit logs.
  - Create and run initial baseline migration on Neon PostgreSQL.
  - Set up Seed script (`prisma/seed.ts`).
  - Establish `CommonModule`: Global validation pipe, HTTP exception filter, audit interceptor.
  - Create `permissions.config.ts`, `PermissionsGuard`, and `@RequirePermission()`.
- **Developer 2:**
  - Verify and configure Docker Redis 7 TCP container in `docker-compose.yml`.
  - Install and initialize `@nestjs/bullmq` with Redis TCP (`localhost:6379`).
  - Create standalone worker process entrypoint (`apps/api/src/worker.ts`).
  - Set up Resend email SDK and configure `EmailService`.
  - Initialize Sentry SDK for API and Worker exception reporting.
  - Initialize Cloudinary client with credentials and create health check endpoint (`/api/health`).

### Phase 2 — Authentication, Security & Email Delivery
- **Developer 1:**
  - Implement full auth endpoints: Signup, Login, OTP login, Password reset, and Email verify.
  - Fix JWT strategy session check: validate `revokedAt === null`.
  - Fix device limit: enforce `maxSessions = 2` for `USER` role with transaction lock.
  - Implement Admin TOTP/2FA (generation, verification, backup codes).
  - Implement `LoginAudit` security logging.
- **Developer 2:**
  - Build React Email templates for all Phase 2 auth flows (welcome, verify, reset, OTP).
  - Implement BullMQ `email` queue processor in worker.
  - Wire queue to Resend SDK, handling retries and bounce logging.
  - Test end-to-end delivery of auth emails from Worker.

### Phase 3 — Core LMS Engine, Content Studio & Secure Media
- **Developer 1:**
  - Define Program, Step, Lesson, Batch, and Enrolment domain services with Content Studio `DRAFT`/`PUBLISHED`/`ARCHIVED` lifecycle states.
  - Implement hybrid step progression engine (sequential prerequisite completion + batch scheduled calendar release).
  - Implement manual unlock/re-lock endpoints with audit trails.
  - Implement Agreements domain, signing endpoint, and Step 1 gate.
  - Build Quiz question-bank domain (10 questions per step quiz) and retry throttles.
  - Build comprehensive 50-question final exam engine (timed, shuffled pool) and oral assessment rubrics with qualitative trainer feedback.
  - Implement Resource Library with step-scoping and access classification (view-only PDF, downloadable worksheet, streaming audio).
- **Developer 2:**
  - Implement `CloudinaryMediaProvider` with authenticated video uploads.
  - Implement signed playback URL generation with short TTL and static server-side text overlay watermark.
  - Configure strict referral domain restrictions.
  - Implement `CloudinaryObjectStorageProvider` for private object storage (PDFs, audio, signed agreements) in development adhering to `IObjectStorageProvider`.
  - Implement pre-signed GET URL generator with resource-specific TTLs (60s docs, 300s audio) and in-memory buffer upload.
  - Build React Email templates for LMS lifecycle (`EnrolmentConfirmedEmail`, `AgreementSignedConfirmationEmail`, etc.).

### Phase 4 — Sessions, Bookings & External Meeting Integrations
- **Developer 1:**
  - Implement Session and Booking business logic, capacity controls, and booking quotas.
  - Implement booking cancellation and reschedule policies (configurable policy default: 24h cutoff).
  - Implement learner booking service calling `ICalendarProvider.getBusySlots()` to verify Roweena has no Outlook calendar clash prior to confirmation (configurable policy default: 12h advance notice).
  - Implement learner-to-host timezone translation service.
  - Consume `IMeetingProvider` to schedule sessions without provider coupling.
- **Developer 2:**
  - Implement `ZoomMeetingProvider` (S2S OAuth, meeting create/cancel, webhooks, recording fetch, participant reports).
  - Implement `GoogleMeetProvider` with full lifecycle: create/update/cancel via Calendar API, recording retrieval via Drive API (with manual upload fallback), and participant report ingestion via Admin Reports API (with manual trainer fallback).
  - Implement `MeetingProviderFactory`.
  - Implement Microsoft Graph / Azure AD client for Roweena's Outlook calendar (`getBusySlots()`, event create/update/cancel).
  - Implement BullMQ calendar sync worker.

### Phase 5 — Attendance Tracking & Certificate Generation
- **Developer 1:**
  - Implement Attendance domain service: manage statuses `ABSENT`, `PRESENT_AUTO`, `PRESENT_MANUAL`, and `CORRECTED`.
  - Build participant email reconciliation engine for Zoom and Google Meet reports, aggregating cumulative duration across reconnects and providing an unmatched attendee review queue.
  - Implement attendance compliance calculation against configurable threshold (default: 80%, client example: 75%).
  - Implement manual attendance overrides requiring mandatory `correctionReason`.
  - Implement Certificate eligibility engine: Professional Certification (11 steps + 11 quizzes + 50-question exam + oral pass + closing call + attendance threshold) and Corporate Participation Certificate track (attendance-only).
  - Implement Certificate approval workflow and public verification endpoint (`/api/certificates/verify/:code`) returning verified metadata and pre-formatted LinkedIn "Add to Profile" URL parameters.
- **Developer 2:**
  - Implement participant report ingestion worker for Zoom and Google Meet in BullMQ.
  - Implement PDF certificate generation worker using `pdf-lib` in BullMQ (rendering recipient, course, issue date, QR code, and accredited CPD hours).
  - Upload generated certificate PDF to private object storage via `IObjectStorageProvider.uploadBuffer()`.
  - Deliver signed certificate download URLs.

### Phase 6 — Realtime Communication & Notifications (Deferred)
- **Developer 1:**
  - Implement Conversation and Message database services.
  - Implement conversation assignment rules (Admin/Manager routing) and resolution status.
  - Enforce chat security rules (prohibit cross-learner unsolicited direct chat).
- **Developer 2:**
  - Implement NestJS Socket.IO gateway with Redis Adapter for horizontal scaling.
  - Implement WebSocket JWT handshake authentication guard.
  - Implement room routing, message broadcast, typing indicators, and read receipts.

### Phase 7 — Payments, Invoicing & Production Hardening (Deferred)
- **Developer 1:**
  - Implement Payment state transitions, Coupon discount calculations, and Refund rules.
  - Implement invoice number generation and reporting queries.
  - Build financial, attendance, and progress CSV export endpoints.
- **Developer 2:**
  - Implement Stripe SDK, Stripe Checkout session generator, and Customer Portal.
  - Implement Stripe webhook endpoint with raw body signature verification and idempotency.
  - Build multi-stage production Dockerfiles and AWS ECS Fargate deployment descriptors.

---

## 10. Merge Checkpoints & Quality Gates

### Checkpoint 1: Foundation, Auth & Worker
- **Prerequisites:** D1-001 through D1-029; D2-017 through D2-028 complete.
- **Verification Gates:**
  1. `prisma migrate dev` executes with zero errors on Neon PostgreSQL direct endpoint.
  2. `GET /api/health` returns HTTP 200 with DB and Redis green.
  3. User signup triggers email verification job in BullMQ; worker renders React Email and sends via Resend.
  4. User login enforces 2-device limit: 3rd concurrent login evicts oldest session via advisory lock.
  5. Revoked sessions immediately fail in `JwtStrategy`.
  6. Admin 2FA setup and verification passes.

### Checkpoint 2: Core Learning Engine & Secure Media
- **Prerequisites:** D1-005, D1-006, D1-030 through D1-042; D2-001 through D2-016 complete.
- **Verification Gates:**
  1. Learner cannot access Step 1 content until Agreement is signed.
  2. Hybrid step locking enforces prerequisite completion AND batch scheduled release date.
  3. Content Studio allows admins to author and preview lessons in `DRAFT` state without affecting live batches.
  4. 50-question final exam enforces timed duration, question pool shuffling, and cooldown retries.
  5. Video playback URLs are signed with 5-minute expiry and include static server-side text overlay watermark with learner identity.
  6. Video streaming rejects unauthorized domains (hotlinking prevention).
  7. Private PDFs and audio files are served solely via short-lived pre-signed URLs with view-only vs download scoping (backed by Cloudinary authenticated delivery in development).
  8. Quiz attempts enforce retry counts and cooldown timers.

### Checkpoint 3: Live Sessions, Calendar & Providers
- **Prerequisites:** D1-043 through D1-047; D2-029 through D2-040 complete.
- **Verification Gates:**
  1. Live session booking creates corresponding Zoom / Google Meet meeting.
  2. Session booking queries `ICalendarProvider.getBusySlots()` and rejects booking if Roweena has a calendar clash in Outlook.
  3. Session booking automatically posts calendar event to Roweena's Outlook calendar via MS Graph with meeting link.
  4. Booking notice and cancellation windows enforce configurable policy defaults (12h / 24h).
  5. Google Meet provider successfully creates, updates, and deletes conferencing spaces via Calendar API.
  6. Timezone conversion correctly displays UTC schedule in learner's local timezone.

### Checkpoint 4: Attendance & Certificate Issuance
- **Prerequisites:** D1-048 through D1-053; D2-051 through D2-052 complete.
- **Verification Gates:**
  1. Participant report ingestion worker runs for Zoom and Google Meet, sums reconnect durations, and matches emails to enroled learners.
  2. Unmatched attendee queue displays unrecognized participants for Admin/Manager review and manual linkage.
  3. Manual attendance override mandates and records `correctionReason`.
  4. Professional Certificate eligibility engine requires: 11 steps + 11 quizzes + 50-question exam + oral pass + closing call + configurable attendance threshold.
  5. Corporate Participation Certificate track issues attendance-only certificates bypassing exam/quiz/closing-call criteria.
  6. Approved certificate triggers PDF generation worker, stores PDF in private storage via `IObjectStorageProvider` with accredited CPD hours, and public URL `GET /api/certificates/verify/:code` validates authenticity and returns pre-formatted LinkedIn "Add to Profile" URL parameters.

---

## 11. What Developer 1 Can Implement Independently (Zero-Block)

1. Canonical Prisma schema updates, constraints, indexes, and baseline migration on Neon (including Content Studio statuses, cohort release schedules, Resource scoping, and assessment fields).
2. Complete seed script (`prisma/seed.ts`).
3. Core Auth flows (Signup, Login, Refresh, Logout, Device limit advisory lock, Revocation check bug fix).
4. Admin 2FA / TOTP generation and verification.
5. Named permissions catalog, `ROLE_PERMISSIONS` matrix, and `PermissionsGuard`.
6. Manager / Trainer batch boundary enforcement (`BatchAccessGuard`).
7. Content Studio Program, Step, Lesson, and Batch CRUD services (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
8. Hybrid step progression logic (sequential unlocking + batch scheduled calendar release) and manual override endpoints.
9. Agreement template management, signing endpoint, and Step 1 access gate.
10. Question bank, Quiz attempt engine (10 questions), retry cooldown timers, and randomized question pool.
11. Formal 50-question timed final written exam and Oral Assessment scoring rubrics with qualitative trainer feedback.
12. Session booking business logic with configurable policy defaults (12h lead time, 24h cancellation) and timezone conversion.
13. Participant email reconciliation engine, duration aggregation across reconnects, and unmatched attendee review queue.
14. Attendance compliance calculation against configurable threshold and manual override audit logging.
15. Comprehensive Certificate eligibility calculation engine (11 steps + 11 quizzes + 50-question exam + oral pass + closing call + attendance threshold).
16. Corporate Participation Certificate track (attendance-only eligibility).
17. Public certificate verification API returning certificate status, CPD hours, and LinkedIn "Add to Profile" parameters.
18. Attendance, progress, and financial reporting aggregation queries and CSV streaming.

---

## 12. What Developer 2 Can Implement Independently (Zero-Block)

1. Cloudinary account configuration, environment variables, and SDK setup.
2. Cloudinary authenticated video pipeline, signed playback URL generator (5m TTL), and domain restrictions.
3. Cloudinary static server-side text overlay watermark transformation and thumbnail generator.
4. Cloudinary client direct upload signature generator (`POST /media/upload-signature`).
5. Cloudinary webhook receiver with HMAC signature verification.
6. Object storage integration: `CloudinaryObjectStorageProvider` adhering to `IObjectStorageProvider`, with pre-signed GET/PUT/buffer upload generators (view-only PDFs, worksheets, audio).
7. Docker Redis 7 TCP setup in `docker-compose.yml`.
8. BullMQ configuration via Redis TCP and queue definitions.
9. Standalone background worker process (`apps/api/src/worker.ts`).
10. Resend SDK integration and `EmailService`.
11. React Email template layouts and HTML compilation (Auth and LMS suites).
12. Sentry error tracking integration for API and Worker.
13. Health check endpoint (`/api/health`) with Terminus.
14. Zoom Server-to-Server OAuth token manager and `ZoomMeetingProvider` (meeting CRUD, cloud recordings, participant reports, webhooks).
15. Google Workspace service account client and `GoogleMeetProvider` (Calendar API space create/update/cancel, Drive recording fetch with manual fallback, Admin Reports API participant report ingestion with manual fallback).
16. Microsoft Graph client, Azure AD auth, Outlook calendar event CRUD, and free/busy queries (`getBusySlots()`).
17. PDF certificate generation worker using `pdf-lib` (rendering certificate code, recipient, date, QR code, CPD hours).
18. Multi-stage production `Dockerfile` and Docker Compose environment.

---

## 13. What Must NOT Be Implemented Yet

1. **Stripe Payments (DEFERRED):** No payment gateway code, checkout sessions, or live webhooks until Phase 7.
2. **Mock Payment Tables:** Do not create or retain prototype `Order` or mock payment tables.
3. **Nodemailer:** Do not install or use Nodemailer; transactional email must use Resend and React Email.
4. **Mux Video:** Mux is officially rejected and must be completely removed (`@mux/mux-node` and `modules/mux`).
5. **LinkedIn / Social Login:** The client PDF does not require social login; do not add OAuth social login.
6. **Upstash REST for BullMQ:** BullMQ must never connect via Upstash HTTP/REST; it strictly requires Redis TCP/RESP.
7. **Premature AWS Cloud Provisioning:** Do not create live AWS RDS or ECS resources during local dev. Development uses Neon, Docker Redis, and Cloudinary for all media/storage; no cloud storage accounts are required.
8. **Frontend Code:** Backend developers must not modify frontend packages or UI components.

---

## 14. Dependency Order Between the Two Developers

```
DEVELOPER 1 (Lead / Domain)                       DEVELOPER 2 (Infra / Integrations)
===========================                       ==================================

1. Update schema.prisma & run                     1. Configure Docker Redis 7 TCP
   baseline migration on Neon ──────────┐            & BullMQ module
   (includes Content Studio states,     │
    Resource scoping, Exam/Audit fields)├────────> 2. Create worker.ts entry point
                                        │            & Sentry setup
2. Author seed script                   │
                                        │
3. Implement Auth endpoints &           │
   enqueue EmailJobPayload ─────────────┼────────> 3. Build React Email templates &
                                        │            Resend worker consumer
4. Fix JWT revocation &                 │
   2-device lock                        │
                                        ▼
                           [ CHECKPOINT 1: Auth & Worker ]

5. Implement LMS progression,           │          4. Implement Cloudinary signed URLs
   quizzes, 50-q exam, agreement gate ──┼────────>    & Cloudinary object storage
   & Content Studio authoring/preview   │             (IObjectStorageProvider)
                                        ▼
                         [ CHECKPOINT 2: LMS & Media Infra ]

6. Implement Session & Booking          │          5. Implement Zoom & Google Meet
   domain (consumes IMeetingProvider) <─┼─────────    providers (full lifecycle)
                                        │
7. Integrate Timezone logic &           │          6. Implement MS Graph Outlook sync
   slot validation (calls getBusySlots) <─────────    & getBusySlots() lookup
                                        │
                                        ▼
                         [ CHECKPOINT 3: Sessions & Calendar ]

8. Implement Attendance reconciliation  │          7. Ingest Zoom & Google Meet
   (email matching, reconnect duration) <─────────    participant reports via worker
                                        │
9. Implement Certificate eligibility    │          8. Implement PDF certificate
   (all criteria + closing call + CPD) ─┼────────>    generator worker (pdf-lib)
   & corporate participation track      │
                                        ▼
                         [ CHECKPOINT 4: Attendance & Certs ]

10. Phase 6: Chat domain logic ─────────┬────────> 9. Phase 6: Socket.IO & Redis adapter
11. Phase 7: Payment business rules ────┴────────> 10. Phase 7: Stripe SDK & webhooks
```
