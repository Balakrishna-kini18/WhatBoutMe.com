const fs = require('fs');

const doNotSection = `### Do Not
Do not break existing APIs.
Do not remove working functionality.
Do not duplicate logic.
Do not introduce unnecessary dependencies.
Reuse existing architecture.
Follow project coding standards.
Maintain backward compatibility.`;

const existingReviewSection = `### Existing Implementation Review
Before making any code changes, instruct the AI to:
- inspect the current implementation
- understand existing architecture
- identify reusable code
- avoid duplicate functionality
- avoid breaking changes`;

const milestones = [
  {
    title: "01 Foundation",
    objective: "Establish the core infrastructure, monorepo setup, database connections, and base architecture for both frontend and backend.",
    scope: "NestJS core modules, Prisma client, Next.js configurations, base UI components, Tailwind setup, global error handling, and logging.",
    database: "- Core tables: User, Session\n- Prisma migrations setup\n- Connection pooling (Neon)",
    backend: "- PrismaModule, HealthModule\n- Global Exception Filters\n- Logging (Pino)\n- Redis connection",
    apis: "- GET /health\n- GET /api/status",
    frontend: "- Base layouts\n- Design system tokens\n- Core UI components (buttons, inputs, modals)",
    logic: "System bootstrap, database connection handling, global request validation, and environment variable validation.",
    security: "- Helmet, CORS\n- Basic rate limiting configuration",
    performance: "- Database connection pooling\n- Redis caching layer initialization",
    notifications: "N/A",
    integrations: "Neon Postgres, Redis",
    edgeCases: "Database downtime, Redis unavailability.",
    testing: "- E2E health check tests\n- Jest/Vitest setup validation",
    acceptance: "- [ ] Health check passes\n- [ ] Database connects successfully\n- [ ] Frontend compiles without errors"
  },
  {
    title: "02 Authentication & Authorization",
    objective: "Secure the application with robust authentication, JWT-based sessions, role-based access control, and 2FA.",
    scope: "Signup, login, email verification, password reset, OTP, 2FA for admins, and session revocation.",
    database: "- User (auth fields)\n- UserSession\n- EmailVerificationToken\n- PasswordResetToken\n- OtpCode\n- LoginAudit",
    backend: "- AuthModule, AuthService, AuthController\n- JwtStrategy, LocalStrategy\n- RolesGuard, PermissionsGuard\n- Session tracking service",
    apis: "- POST /auth/signup\n- POST /auth/login\n- POST /auth/logout\n- POST /auth/refresh\n- POST /auth/verify-email\n- POST /auth/password-reset\n- POST /auth/2fa/verify",
    frontend: "- Login page\n- Signup page\n- 2FA setup/verify flow\n- Password reset flow",
    logic: "Validate credentials, manage active sessions limit (max 2 devices), enforce role permissions, lock accounts after failed attempts.",
    security: "- JWT short-lived tokens + HTTP-only refresh tokens\n- Argon2 password hashing\n- Rate limiting on auth routes\n- 2FA enforcement for SUPER_ADMIN/ADMIN",
    performance: "- Redis caching for active sessions\n- Fast token validation without DB roundtrips for every request",
    notifications: "- Verification email\n- Password reset email\n- Suspicious login alert email",
    integrations: "Resend (Email delivery)",
    edgeCases: "Expired tokens, revoked sessions, concurrent logins exceeding device limits.",
    testing: "- JWT expiration tests\n- RBAC unit tests\n- 2FA flow E2E tests",
    acceptance: "- [ ] Users can register and log in\n- [ ] Admins are forced to use 2FA\n- [ ] Sessions are securely revoked on logout"
  },
  {
    title: "03 User & Role Management",
    objective: "Provide administration tools to manage users, roles, profiles, and basic user data.",
    scope: "User CRUD operations, role assignment, profile editing, and security audits view.",
    database: "- User profile fields (avatar, bio, timezone)\n- Company (for corporate users)",
    backend: "- UsersModule, UsersService, UsersController",
    apis: "- GET /users\n- GET /users/:id\n- PATCH /users/:id\n- DELETE /users/:id\n- GET /users/:id/audits",
    frontend: "- Admin: Users list, User detail view, Edit user modal\n- Learner: Profile settings page",
    logic: "Admins can promote/demote users. Users can update their own timezone/profiles. Soft delete for GDPR compliance.",
    security: "- Role restrictions (only Admins can change roles)\n- Users can only edit their own profiles",
    performance: "- Paginated user list\n- Search debouncing on frontend",
    notifications: "N/A",
    integrations: "Cloudinary (Avatar uploads)",
    edgeCases: "Attempting to delete the last Super Admin, invalid timezones.",
    testing: "- RBAC on user mutation endpoints\n- Profile update validation",
    acceptance: "- [ ] Admins can list and search all users\n- [ ] Users can update personal details\n- [ ] Soft deletion works correctly"
  },
  {
    title: "04 Public Website",
    objective: "Deliver the public-facing marketing pages for WhatBoutMe to attract and convert leads.",
    scope: "Landing page, course details, about us, contact form, and SEO optimization.",
    database: "- Lead / Contact messages table",
    backend: "- WebsiteModule, MessagesController",
    apis: "- POST /website/contact\n- GET /website/programs (public view)",
    frontend: "- Marketing layout\n- Homepage, About page, Course Catalog\n- Contact form component",
    logic: "Capture leads from contact forms, display public course information.",
    security: "- Rate limit contact form submissions\n- reCAPTCHA integration (optional)",
    performance: "- Next.js static site generation (SSG) for marketing pages\n- Optimized images via Next/Image",
    notifications: "- Email alert to admin on new contact form submission",
    integrations: "Resend",
    edgeCases: "Spam submissions.",
    testing: "- Form validation tests\n- SEO metadata checks",
    acceptance: "- [ ] Public pages load fast (Lighthouse >90)\n- [ ] Contact form successfully sends email"
  },
  {
    title: "05 Course Management",
    objective: "Enable admins to author and structure programs, steps, and lessons (The Content Studio).",
    scope: "Programs, Steps, Lessons hierarchy, Draft/Publish lifecycle, and content sequencing.",
    database: "- Program\n- ProgramStep\n- Lesson\n- Resource (Library)",
    backend: "- ProgramsModule\n- Content ordering logic\n- Status publishing logic",
    apis: "- CRUD /programs\n- CRUD /programs/:id/steps\n- CRUD /steps/:stepId/lessons\n- PATCH /programs/:id/publish",
    frontend: "- Admin: Content Studio drag-and-drop ordering\n- Lesson rich text editor\n- Media upload modals",
    logic: "Enforce sequential ordering. Draft items are hidden from learners. Publishing requires validation of minimum content.",
    security: "- Admin/Manager only access",
    performance: "- Tree-structured data fetching optimization",
    notifications: "N/A",
    integrations: "Cloudinary (Video/PDF hosting)",
    edgeCases: "Reordering steps while a cohort is currently active.",
    testing: "- Ordering collision tests\n- Draft visibility tests",
    acceptance: "- [ ] Admins can create full course hierarchies\n- [ ] Draft content is not visible to learners"
  },
  {
    title: "06 Registration & Enrollment",
    objective: "Manage learner onboarding into specific programs and handling their enrollment states.",
    scope: "Enrolment state machine, cohort linking, and access revocation.",
    database: "- Enrolment (Status: PENDING_PAYMENT, PENDING_AGREEMENT, ACTIVE, REVOKED)",
    backend: "- EnrollmentsModule",
    apis: "- POST /enrollments\n- PATCH /enrollments/:id/status\n- GET /enrollments/my",
    frontend: "- Admin: Enrollments dashboard\n- Learner: My Courses view",
    logic: "Enrollments transition from Pending to Active based on agreements and payments. Revoked enrollments immediately block access.",
    security: "- Users can only see their own enrollments",
    performance: "- Eager load program data for learner dashboard",
    notifications: "- Enrollment confirmation email",
    integrations: "N/A",
    edgeCases: "Duplicate enrollment attempts, capacity limits.",
    testing: "- State machine transition tests",
    acceptance: "- [ ] Learners can be enrolled\n- [ ] Revoked learners lose access instantly"
  },
  {
    title: "07 Batch Management",
    objective: "Organize learners into cohorts (batches) and assign trainers/managers.",
    scope: "Batch CRUD, trainer assignments, batch capacities, and batch schedules.",
    database: "- Batch\n- BatchTrainer",
    backend: "- BatchesModule\n- Assignment logic",
    apis: "- CRUD /batches\n- POST /batches/:id/trainers\n- POST /batches/:id/learners",
    frontend: "- Admin: Batch creation, Roster management",
    logic: "Batches group enrollments. Trainers are assigned to batches and gain RBAC scoped access to those specific learners.",
    security: "- BatchAccessGuard ensures managers only see their assigned batches",
    performance: "- Batch roster pagination",
    notifications: "- Trainer assignment notification",
    integrations: "N/A",
    edgeCases: "Assigning more learners than batch capacity.",
    testing: "- Manager batch scoping guard tests",
    acceptance: "- [ ] Trainers can only access their assigned batches\n- [ ] Admin can view all batches"
  },
  {
    title: "08 Learning Experience",
    objective: "Deliver the core LMS consumption interface for learners to watch videos and read content.",
    scope: "Lesson viewer, video player, progress tracking, and step unlocking.",
    database: "- UserLessonProgress\n- StepProgress",
    backend: "- ProgressionModule",
    apis: "- GET /learn/programs/:id\n- POST /progress/lessons/:id/mark-viewed",
    frontend: "- Learner: Course player, Video component, Progress sidebar",
    logic: "Sequential unlocking: Step N unlocks when Step N-1 is complete. Track video completion (90% viewed rule).",
    security: "- Validate enrollment status before serving content\n- Signed Cloudinary URLs for video protection",
    performance: "- Redis caching for step unlock status",
    notifications: "N/A",
    integrations: "Cloudinary Video Player",
    edgeCases: "Skipping ahead via URL hacking, network drops during video.",
    testing: "- Sequential unlock business logic tests",
    acceptance: "- [ ] Learners can consume lessons\n- [ ] Progress is accurately tracked\n- [ ] Future steps remain locked until prerequisites are met"
  },
  {
    title: "09 Resource Library",
    objective: "Manage downloadable and view-only supplementary materials (PDFs, Audio, Worksheets).",
    scope: "Resource uploads, scoping (Step vs Library), and access controls.",
    database: "- Resource",
    backend: "- CloudinaryModule / StorageProvider",
    apis: "- GET /resources/:id/download-url\n- CRUD /resources",
    frontend: "- Learner: Resources tab\n- Admin: Resource upload manager",
    logic: "Generate short-lived presigned URLs (e.g., 60s for PDF, 300s for Audio) to prevent hotlinking.",
    security: "- File permissions based on enrollment",
    performance: "- CDN delivery via Cloudinary",
    notifications: "N/A",
    integrations: "Cloudinary",
    edgeCases: "Expired signed URLs during long audio playback.",
    testing: "- Presigned URL generation tests",
    acceptance: "- [ ] Files are securely delivered\n- [ ] Signed URLs expire correctly"
  },
  {
    title: "10 Assessments",
    objective: "Evaluate learner comprehension through quizzes, 50-question final exams, and oral assessment rubrics.",
    scope: "Question Banks, Quizzes, Attempts, Scoring, Oral grading.",
    database: "- QuestionBank, Question, Quiz, QuizAttempt, QuizAnswer, Exam, OralAssessment",
    backend: "- ExamsModule, QuizzesModule, OralAssessmentsModule",
    apis: "- POST /quizzes/:id/submit\n- POST /exams/start\n- POST /oral-assessments/:id/grade",
    frontend: "- Learner: Quiz taker interface, Exam timer\n- Trainer: Oral assessment grading rubric",
    logic: "Auto-grading for MCQs. Retry throttling (max 3, 24h cooldown). Randomize 50 exam questions from bank.",
    security: "- Prevent multiple active exam attempts\n- Server-side validation of answers (don't send correct answers to frontend)",
    performance: "- Efficient quiz submission handling",
    notifications: "- Exam passed/failed emails",
    integrations: "N/A",
    edgeCases: "Tab closed during timed exam.",
    testing: "- Scoring logic tests\n- Cooldown enforcement tests",
    acceptance: "- [ ] Quizzes auto-grade correctly\n- [ ] Trainers can submit oral assessment rubrics"
  },
  {
    title: "11 Live Sessions",
    objective: "Schedule and manage 1-on-1 and group cohort live video sessions.",
    scope: "Session CRUD, Bookings, Zoom/Meet link injection, Outlook calendar syncing.",
    database: "- Session, SessionBooking",
    backend: "- SessionsModule, ZoomModule, OutlookModule",
    apis: "- POST /sessions/book\n- POST /sessions/:id/cancel\n- GET /sessions/my",
    frontend: "- Learner: Session booking calendar\n- Admin: Master calendar",
    logic: "Enforce lead time (12h) and cancellation cutoffs (24h). Convert timezones. Prevent Outlook calendar clashes via getBusySlots().",
    security: "- Users can only book authorized session types",
    performance: "- Cache Outlook busy slots",
    notifications: "- Session confirmation and reminder emails",
    integrations: "Zoom, Google Meet, Microsoft Graph/Outlook",
    edgeCases: "Booking at the exact same millisecond, timezone daylight saving boundary issues.",
    testing: "- Timezone transformation tests\n- Clash prevention tests",
    acceptance: "- [ ] Sessions generate valid Zoom/Meet links\n- [ ] Double-booking is blocked by Outlook check"
  },
  {
    title: "12 Attendance",
    objective: "Track learner attendance for live sessions and calculate program compliance.",
    scope: "Attendance ingestion, reconciliation, compliance thresholds, and manual overrides.",
    database: "- Attendance",
    backend: "- SessionsModule (Attendance Service)\n- BullMQ Workers",
    apis: "- PATCH /attendance/:id/override\n- GET /batches/:id/attendance",
    frontend: "- Admin: Attendance review queue, Manual correction modal",
    logic: "Ingest provider webhooks/reports. Aggregate duration across reconnects. Calculate compliance (e.g. 75% threshold).",
    security: "- Manual overrides require correctionReason and audit log",
    performance: "- Async processing of large Zoom participant webhooks via BullMQ",
    notifications: "- Unmatched attendee alert to Admin",
    integrations: "Zoom Webhooks",
    edgeCases: "User joins with a different email than their account.",
    testing: "- Compliance calculation tests\n- Duration aggregation tests",
    acceptance: "- [ ] Attendance is automatically ingested\n- [ ] Admins can manually correct attendance with a logged reason"
  },
  {
    title: "13 Payments & Invoicing",
    objective: "Handle monetization, Stripe checkout, coupon codes, and automated invoicing.",
    scope: "Stripe integration, Payment state machine, PDF invoices, and refunds.",
    database: "- Payment, Invoice, Coupon",
    backend: "- RevenueModule\n- Stripe Webhooks",
    apis: "- POST /payments/checkout\n- POST /payments/webhook\n- GET /invoices/:id/pdf",
    frontend: "- Learner: Checkout flow, Billing history",
    logic: "Activate enrolment upon successful payment webhook. Calculate coupon discounts. Issue PDF invoice.",
    security: "- Stripe webhook signature verification",
    performance: "- Idempotent webhook processing",
    notifications: "- Payment receipt email",
    integrations: "Stripe",
    edgeCases: "Webhook out of order delivery, expired coupons.",
    testing: "- Webhook idempotency tests\n- Discount calculation tests",
    acceptance: "- [ ] Successful Stripe payment activates enrolment\n- [ ] Invoice PDFs are generated"
  },
  {
    title: "14 Agreements",
    objective: "Manage legal agreements that must be signed before accessing course content.",
    scope: "Agreement templates, E-signature capturing, and access gating.",
    database: "- AgreementTemplate, SignedAgreement",
    backend: "- EnrollmentsModule (Agreements Service)",
    apis: "- POST /agreements/sign\n- GET /agreements/pending",
    frontend: "- Learner: Agreement signing modal\n- Admin: Agreement templates view",
    logic: "Block Step 1 access until consent is ticked and typed signature is recorded with IP/Timestamp.",
    security: "- Immutable records (Agreements cannot be deleted)",
    performance: "N/A",
    notifications: "N/A",
    integrations: "N/A",
    edgeCases: "Template updated mid-enrollment.",
    testing: "- Access gate blocking tests",
    acceptance: "- [ ] Users cannot bypass the agreement screen\n- [ ] Signed agreements capture immutable IP and timestamp"
  },
  {
    title: "15 Certificates",
    objective: "Automatically evaluate eligibility and generate tamper-proof PDF certificates.",
    scope: "Eligibility engine, PDF rendering, verification endpoint, and LinkedIn sharing.",
    database: "- Certificate",
    backend: "- CertificatesModule\n- PDF Worker",
    apis: "- GET /certificates/verify/:code\n- POST /certificates/:id/approve",
    frontend: "- Learner: Certificate download, LinkedIn share button\n- Public: Verification page",
    logic: "Evaluate 6 criteria (steps, quizzes, exam, oral, attendance, closing call). Distinguish Professional vs Corporate tracks. Generate PDF.",
    security: "- Public endpoint must not leak user PII beyond certificate details",
    performance: "- PDF generation offloaded to BullMQ worker",
    notifications: "- Certificate issued email",
    integrations: "LinkedIn Add to Profile URL",
    edgeCases: "User name changes after certificate issuance.",
    testing: "- Eligibility rule engine tests",
    acceptance: "- [ ] Eligible learners automatically receive certificates\n- [ ] Public verification URL works correctly"
  },
  {
    title: "16 Learner Dashboard",
    objective: "Provide the central hub for learners to track their overall progress and upcoming schedule.",
    scope: "Dashboard aggregation, progress bars, notifications list, and upcoming sessions.",
    database: "N/A (Aggregates data)",
    backend: "- DashboardController",
    apis: "- GET /dashboard/learner",
    frontend: "- Learner: Dashboard layout, widgets",
    logic: "Aggregate progress percentages, fetch next immediate session, surface pending actions (e.g., unsigned agreements).",
    security: "- Scoped to active user",
    performance: "- Redis caching for aggregate progress calculations",
    notifications: "N/A",
    integrations: "N/A",
    edgeCases: "Learner with multiple active enrollments.",
    testing: "- Aggregation accuracy tests",
    acceptance: "- [ ] Dashboard loads quickly with accurate progress metrics"
  },
  {
    title: "17 Chat & Communication",
    objective: "Build a secure learner-to-staff communication system with real-time messaging.",
    scope: "Conversations, Messages, routing rules, WebSockets, and Admin shared inbox.",
    database: "- Conversation, Message",
    backend: "- ChatModule, RealtimeGateway",
    apis: "- POST /chat/conversations\n- GET /chat/conversations\n- POST /chat/conversations/:id/messages",
    frontend: "- Admin: Chat inbox UI\n- Learner: Chat widget",
    logic: "Route learner inquiries to assigned batch trainers/managers. Prevent cross-learner messaging.",
    security: "- Validate participant IDs on every message\n- WebSocket JWT guard",
    performance: "- Cursor pagination for messages\n- Real-time events",
    notifications: "- Unread message email fallback",
    integrations: "N/A",
    edgeCases: "WebSocket disconnects during message send.",
    testing: "- Routing isolation tests\n- WebSocket authorization tests",
    acceptance: "- [ ] Learners can only message their assigned staff\n- [ ] Real-time delivery works"
  },
  {
    title: "18 Notifications",
    objective: "System-wide notification center for alerts, reminders, and updates.",
    scope: "In-app notifications, email fallback, and read states.",
    database: "- Notification",
    backend: "- QueueModule (Notifications Worker)",
    apis: "- GET /notifications\n- PATCH /notifications/read-all",
    frontend: "- Global bell icon, dropdown list",
    logic: "Dispatch events (e.g. Session Starting soon). If unread for 24h, fallback to email.",
    security: "- Scoped to user",
    performance: "- Bulk insert/update operations",
    notifications: "Self-referential",
    integrations: "Resend",
    edgeCases: "High volume batch announcements.",
    testing: "- Fallback email trigger tests",
    acceptance: "- [ ] Users receive real-time bell alerts\n- [ ] Read states synchronize correctly"
  },
  {
    title: "19 Reports & Analytics",
    objective: "Empower admins with data insights regarding attendance, drop-offs, and financials.",
    scope: "Complex queries, data aggregation, and CSV exports.",
    database: "N/A (Read-only analytics queries)",
    backend: "- RevenueModule / ReportsController",
    apis: "- GET /reports/attendance\n- GET /reports/drop-offs\n- GET /reports/export/csv",
    frontend: "- Admin: Analytics charts, Export buttons",
    logic: "Calculate batch compliance percentages, identify funnel bottlenecks across steps.",
    security: "- Super Admin / Admin access only",
    performance: "- Use Prisma indexed grouping\n- Stream CSV exports to avoid memory limits",
    notifications: "N/A",
    integrations: "N/A",
    edgeCases: "Exporting datasets > 100,000 rows.",
    testing: "- Data accuracy tests for aggregations",
    acceptance: "- [ ] Charts display accurate historical data\n- [ ] CSV streams download without timeouts"
  },
  {
    title: "20 Workshops & Corporate",
    objective: "Support B2B corporate client portals and bulk batch operations.",
    scope: "Company models, corporate manager views, bulk enrollment.",
    database: "- Company",
    backend: "- BatchesModule (Corporate logic)",
    apis: "- POST /companies\n- POST /batches/:id/bulk-enroll",
    frontend: "- Admin: Corporate portal manager",
    logic: "Assign Corporate Managers to view overall employee progression without editing course content.",
    security: "- Corporate Manager RBAC scope",
    performance: "N/A",
    notifications: "N/A",
    integrations: "N/A",
    edgeCases: "Employees leaving the company mid-batch.",
    testing: "- Corporate scope isolation tests",
    acceptance: "- [ ] Corporate managers can track their employees' progress"
  },
  {
    title: "21 Third-Party Integrations",
    objective: "Finalize and harden external provider integrations and webhooks.",
    scope: "Stripe, Zoom, Meet, Resend, Cloudinary webhook robustness.",
    database: "N/A",
    backend: "Webhook controllers",
    apis: "- POST /webhooks/*",
    frontend: "N/A",
    logic: "Ensure all webhooks have retry policies, signature validation, and idempotency keys.",
    security: "- Strict HMAC/Signature verification",
    performance: "- Quick ACK (200 OK) and async processing via BullMQ",
    notifications: "N/A",
    integrations: "All",
    edgeCases: "Provider API outages.",
    testing: "- Webhook payload mocking and security tests",
    acceptance: "- [ ] All webhooks are secured and processed asynchronously"
  },
  {
    title: "22 Security",
    objective: "Comprehensive security hardening and penetration test readiness.",
    scope: "Rate limiting, Helmet, XSS, sanitization, dependency auditing.",
    database: "- LoginAudit reviews",
    backend: "- Global middleware",
    apis: "All",
    frontend: "- CSP headers, XSS sanitization (DOMPurify)",
    logic: "Enforce strict CSP. Audit all inputs for SQLi/XSS.",
    security: "Core focus.",
    performance: "Ensure security layers don't degrade TTFB significantly.",
    notifications: "N/A",
    integrations: "N/A",
    edgeCases: "False positive rate limits.",
    testing: "- Automated security vulnerability scans",
    acceptance: "- [ ] Zero high/critical npm audit issues\n- [ ] CSP headers strictly enforced"
  },
  {
    title: "23 Performance",
    objective: "Optimize application speed, caching, and database query efficiency.",
    scope: "Redis implementation, Prisma query optimization, Frontend asset delivery.",
    database: "- Add missing indexes based on query plan analysis",
    backend: "- Cache interceptors",
    apis: "All GET routes",
    frontend: "- Lighthouse optimization, dynamic imports",
    logic: "Identify N+1 query problems in Prisma and replace with relations/joins.",
    security: "N/A",
    performance: "Core focus.",
    notifications: "N/A",
    integrations: "N/A",
    edgeCases: "Cache invalidation race conditions.",
    testing: "- Load testing (k6/Artillery)",
    acceptance: "- [ ] API P95 response time < 200ms\n- [ ] Frontend Lighthouse scores > 90"
  },
  {
    title: "24 Testing",
    objective: "Ensure high test coverage and system reliability before production.",
    scope: "Unit, Integration, and E2E suites.",
    database: "N/A",
    backend: "- Vitest suites",
    apis: "N/A",
    frontend: "- Playwright/Cypress",
    logic: "Write missing tests for complex domain logic (Certificates, Attendance, Progression).",
    security: "N/A",
    performance: "N/A",
    notifications: "N/A",
    integrations: "Mocking external providers",
    edgeCases: "Flaky tests.",
    testing: "Core focus.",
    acceptance: "- [ ] Backend test coverage > 80%\n- [ ] Critical path E2E tests pass reliably"
  },
  {
    title: "25 Deployment",
    objective: "Prepare CI/CD pipelines and infrastructure deployment scripts.",
    scope: "Vercel config, Docker containers (if applicable for workers), GitHub Actions.",
    database: "- Migration deployment strategy",
    backend: "- CI/CD",
    apis: "N/A",
    frontend: "- CI/CD",
    logic: "Automate builds, tests, and deployments.",
    security: "- Secret management",
    performance: "- Build caching (Turbo)",
    notifications: "- Slack deployment alerts",
    integrations: "Vercel, GitHub Actions",
    edgeCases: "Rollbacks.",
    testing: "N/A",
    acceptance: "- [ ] Commits to main automatically deploy safely"
  },
  {
    title: "26 Production Readiness",
    objective: "Final sign-off, documentation, and hand-over.",
    scope: "Runbooks, environment validation, and final checks.",
    database: "- Backup strategies verified",
    backend: "- Environment variables validated",
    apis: "N/A",
    frontend: "N/A",
    logic: "N/A",
    security: "N/A",
    performance: "N/A",
    notifications: "N/A",
    integrations: "Production keys rotated and applied",
    edgeCases: "N/A",
    testing: "N/A",
    acceptance: "- [ ] All environments mirror production\n- [ ] Documentation complete"
  }
];

let md = `# WhatBoutMe LMS — Domain-Driven Implementation Roadmap
**Document Version:** 3.0.0
**Date:** October 7, 2026

This document serves as the single source of truth for the remaining implementation of the LMS. The granular tickets have been replaced with comprehensive implementation milestones.

## Implementation Rules
We will implement **one milestone at a time**. No parallel implementation. Each milestone must be fully completed and verified before the next begins.

Example workflow:
\`Milestone 01\` -> \`review\` -> \`implement\` -> \`test\` -> \`review\` -> \`merge\` -> \`Milestone 02\`

---

`;

for (const m of milestones) {
  md += `## Milestone ${m.title}\n\n`;
  md += `### Objective\n${m.objective}\n\n`;
  md += `### Scope\n${m.scope}\n\n`;
  md += `${existingReviewSection}\n\n`;
  md += `### Database\n${m.database}\n\n`;
  md += `### Backend\n${m.backend}\n\n`;
  md += `### APIs\n${m.apis}\n\n`;
  md += `### Frontend\n${m.frontend}\n\n`;
  md += `### Business Logic\n${m.logic}\n\n`;
  md += `### Security\n${m.security}\n\n`;
  md += `### Performance\n${m.performance}\n\n`;
  if(m.notifications !== "N/A") md += `### Notifications\n${m.notifications}\n\n`;
  if(m.integrations !== "N/A") md += `### Integrations\n${m.integrations}\n\n`;
  md += `### Edge Cases\n${m.edgeCases}\n\n`;
  md += `### Testing\n${m.testing}\n\n`;
  md += `### Acceptance Criteria\n${m.acceptance}\n\n`;
  md += `${doNotSection}\n\n---\n\n`;
}

fs.writeFileSync('DEVELOPER_SPLIT_PLAN.md', md);
console.log('Successfully generated DEVELOPER_SPLIT_PLAN.md');
