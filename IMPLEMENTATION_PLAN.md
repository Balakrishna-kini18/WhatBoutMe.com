# WhatBoutMe LMS — Implementation Plan

> **Version:** 1.0  
> **Date:** September 29, 2026  
> **Author:** Foxwel.AI  
> **Team:** 2 Developers (Full-Stack)  
> **Source:** PRD v1.2 · ARCHITECTURE v1.1 · TRD v1.2 · BACKEND_SCHEMA v1.0 · APP_FLOW v1.0 · UI_UX_DESIGN_BRIEF v1.0 · Requirements PDF

---

## Table of Contents

1. [Pre-Development Checklist](#1-pre-development-checklist)
2. [Phase 1 — MVP (Sprints 0–8)](#2-phase-1--mvp-sprints-08)
3. [Phase 2 — Certification Complete (Sprints 9–14)](#3-phase-2--certification-complete-sprints-914)
4. [Phase 3 — Engagement & Polish (Sprints 15–18)](#4-phase-3--engagement--polish-sprints-1518)
5. [Phase Gates & Review Criteria](#5-phase-gates--review-criteria)
6. [Risk Mitigation Schedule](#6-risk-mitigation-schedule)
7. [PDF Requirement Traceability Matrix](#7-pdf-requirement-traceability-matrix)

---

## 1. Pre-Development Checklist

> [!IMPORTANT]
> These items MUST be completed before Sprint 0 starts. Without them, development will be blocked.

### From Client (Roweena / WhatBoutMe FZE)

| # | Item | Needed By | Status | Blocks |
|---|------|-----------|:------:|--------|
| C1 | **Brand kit:** Logo (SVG), brand colors (hex), fonts, headshot photos | Day 1 | ⬜ | Sprint 1 (design system, public site) |
| C2 | **DNS access** to `whatboutme.com` (GoDaddy admin login or nameserver delegation) | Day 1 | ⬜ | Sprint 1 (domain setup, email SPF/DKIM) |
| C3 | **Stripe account** (test mode API keys, dashboard access) | Sprint 3 | ⬜ | Sprint 3 (payment integration) |
| C4 | **Agreement template** text (legal content for learner to sign) | Sprint 3 | ⬜ | Sprint 4 (e-signature) |
| C5 | **Existing website content:** All current page text, testimonials, event photos, client logos | Sprint 1 | ⬜ | Sprint 2 (public website) |
| C6 | **11 Step titles + descriptions** (at minimum, names of each step and short blurbs) | Sprint 5 | ⬜ | Sprint 5 (content management) |
| C7 | **Course video/PDF/audio content** for at least Steps 1–3 (for testing) | Sprint 6 | ⬜ | Sprint 6 (content upload testing) |
| C8 | **Zoom Pro license** + OAuth app registration | Sprint 9 | ⬜ | Sprint 9 (sessions) |
| C9 | **Microsoft 365** + Azure AD app registration for Graph API | Sprint 9 | ⬜ | Sprint 9 (calendar sync) |
| C10 | **Certificate template design** (Figma/Illustrator file) | Sprint 13 | ⬜ | Sprint 13 (certificates) |

### From Dev Team (Foxwel.AI)

| # | Item | Needed By | Status |
|---|------|-----------|:------:|
| T1 | Create GitHub/GitLab repository (Turborepo monorepo) | Day 1 | ⬜ |
| T2 | Set up AWS RDS (PostgreSQL) instance in private VPC | Day 1 | ⬜ |
| T3 | Create AWS ElastiCache (Redis) cluster | Day 1 | ⬜ |
| T4 | Create AWS Amplify app for frontend | Day 1 | ⬜ |
| T5 | Create AWS ECS (Fargate) cluster for backend API + worker | Day 1 | ⬜ |
| T6 | Create AWS S3 bucket (`whatboutme-storage`) | Day 1 | ⬜ |
| T7 | Create Resend account + verify sending domain | Sprint 1 | ⬜ |
| T8 | Create Mux account (video streaming) | Sprint 5 | ⬜ |
| T9 | Create Sentry projects (frontend + backend) | Day 1 | ⬜ |
| T10 | Set up Stripe test account with test webhooks | Sprint 3 | ⬜ |

---

## 2. Phase 1 — Demo MVP (Sprint 1)

> **Phase Goal:** Build the visual frontend for the Marketing site, Learner Portal (LMS), and Admin Panel using mock data. This provides a stunning, clickable prototype for the client (Roweena) to review before any complex backend logic is connected.

| # | Task | Details | PDF Ref |
|---|------|---------|---------|
| D-1 | **Marketing UI** | Build Home, About, Programs, and Contact pages with premium glassmorphism design. | §1 Public Website |
| D-2 | **LMS Dashboard Shell** | Build the Sidebar, Header, and Layout for the learner portal. | §9 Learner Dashboard |
| D-3 | **11 Steps Roadmap UI** | Build the visual roadmap showing locked and unlocked steps. | §4 11 Steps |
| D-4 | **Video Player & Quiz UI** | Build the premium video viewing page and multiple-choice quiz component. | §4 11 Steps, §6 Quizzes |
| D-5 | **Admin Dashboard Shell** | Build the Admin UI layout and mock tables for Users, Batches, and Programs. | §13 Admin Panel |

---

## 3. Phase 2 — Production Logic (Sprints 2–8)

> **Phase Goal:** A learner can discover the program on the public site, sign up, pay via Stripe, sign the agreement, join a batch, work through all 11 steps with quizzes, and see their progress on a dashboard. Admin can manage all of this from the panel.
>
> **PDF Sections Covered:** Overview, Tech Stack, User Roles, Core Entities, Public Website (§1), Registration/Payment/Agreement (§2), Batch Management (§3), 11 Steps Program (§4), Quizzes (§6 partial), Learner Dashboard (§9 partial), Admin Panel (§13 partial), Notifications (partial), Content Protection (partial), Non-Functional Requirements

---

### Sprint 0 — Foundation & Infrastructure (Weeks 1–2)

**Goal:** Monorepo initialized, CI/CD pipeline working, database schema deployed, auth system functional, design system tokens created.

#### Infrastructure Tasks

| # | Task | Details | PDF Ref |
|---|------|---------|---------|
| S0-1 | **Initialize Turborepo monorepo** | Frontends: `apps/lms`, `apps/marketing`, `apps/admin`. Backends: `apps/api-gateway`. Packages: `core-lms`, `core-registration`, `core-invoice`, `core-certification`, `shared` | Tech Stack |
| S0-2 | **Configure Local Database** | Set up local PostgreSQL instance via Docker or native install for development | Tech Stack |
| S0-3 | **Configure Local Redis** | Set up local Redis instance via Docker or native install for session and queue development | Tech Stack |
| S0-4 | **Create `.env.example`** | Document ALL environment variables per the Env Var Catalogue (ARCH §22), defaulted to local URLs | — |

#### Backend Tasks (NestJS)

| # | Task | NestJS Module | Prisma Models | PDF Ref |
|---|------|--------------|---------------|---------|
| S0-10 | **Create Prisma schema** (full) | — | Implement the exact schema defined in `BACKEND_SCHEMA.md` | Core Entities |
| S0-11 | **Run initial migration** | `npx prisma migrate dev --name init` | — | — |
| S0-12 | **Create seed script** | `prisma/seed.ts`: Create super admin user, sample program, sample step, sample batch | — |
| S0-13 | **Set up common module** | `src/common/`: JWT auth guard, roles guard, batch-access guard, audit-log interceptor, http-exception filter, validation pipe, pagination DTO, timezone util, currency util, signed-url util | User Roles |
| S0-14 | **Build Auth module** | `modules/auth/` | User | Roles, Auth |
| S0-15 | **Auth — Signup** | `POST /api/auth/signup` — email, password, name, country, timezone. Hash password (bcrypt 12). Send verification email. | §2 Registration |
| S0-16 | **Auth — Email verification** | `POST /api/auth/verify-email` — UUID token, 24h expiry | §2 Registration |
| S0-17 | **Auth — Login** | `POST /api/auth/login` — email + password. Return JWT (15min access + 7d refresh) in HTTP-only cookies. Check 2FA for admin/super admin. | Auth, Content Protection |
| S0-18 | **Auth — 2FA (TOTP)** | `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`. For admin/super admin only. | Admin Login |
| S0-19 | **Auth — Session management** | Store sessions in Redis. Max 2 active sessions per user. New login invalidates oldest. | Content Protection |
| S0-20 | **Auth — Refresh token** | `POST /api/auth/refresh` — rotate refresh token, issue new access token | Auth |
| S0-21 | **Auth — Forgot/reset password** | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` — UUID token, 1h expiry | §2 Registration |
| S0-22 | **Build Users module** | `modules/users/` — `GET /api/users/me`, `PATCH /api/users/me`, `GET /api/admin/users` (admin), role management | User Roles |
| S0-23 | **Health check endpoint** | `GET /api/health` — returns DB, Redis, and uptime status | Non-Functional |
| S0-24 | **Set up BullMQ** | Configure queues: `email`, `notification`. Create worker entry point (`worker.ts`). | Tech Stack |

#### Frontend Tasks (Next.js)

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S0-25 | **Create design system** | Implement tokens exactly as defined in `UI_UX_DESIGN_BRIEF.md` (colors, typography, spacing). | — |
| S0-26 | **Create layout components** | `PublicLayout`, `PortalLayout`, `AdminLayout` — header, footer, sidebar shell | §1 Public Website |
| S0-27 | **Auth pages** | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | §2 Registration |
| S0-28 | **Auth context / hooks** | `useAuth()` hook, `AuthProvider`, protected route wrapper, role-based redirect | — |
| S0-29 | **2FA setup page** | `/admin/security/2fa` — QR code display, TOTP verification | Admin Login |

#### Shared Package Tasks

| # | Task | File | PDF Ref |
|---|------|------|---------|
| S0-30 | **Create shared types** | `packages/shared/types/` — `User`, `UserRole`, `Program`, `Step`, `Batch`, `Enrolment` interfaces | — |
| S0-31 | **Create shared enums** | `packages/shared/enums/` — `UserRole`, `EnrolmentStatus`, `PaymentStatus`, `StepUnlockRule` | — |
| S0-32 | **Create API response types** | `packages/shared/api/` — `ApiResponse<T>`, `PaginatedResponse<T>`, `ApiError` | — |

#### Sprint 0 — Acceptance Criteria

- [ ] `git clone` → `npm install` → `npm run dev` works for both apps
- [ ] Signup → verify email → login → see dashboard (empty) works end-to-end
- [ ] Admin login requires 2FA (TOTP setup and verify)
- [ ] Third login from a device logs out the oldest session
- [ ] CI pipeline runs lint + type-check + tests on every PR
- [ ] Staging deployment is live and accessible
- [ ] Health check endpoint returns `200 OK` with DB and Redis status
- [ ] Seed script creates super admin + sample data

---

### Sprint 1–2 — Public Website (Weeks 3–4)

**Goal:** Full rebuild of `whatboutme.com` — all public pages live with SEO, responsive design, and dynamic program pages.

> **Dependency:** Brand kit (C1), existing website content (C5), DNS access (C2)

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S1-1 | **Build Programs module (public read)** | `modules/programs/` | `GET /api/programs` (public, paginated), `GET /api/programs/:slug` (public, single program with steps and open batches) | Course Management |
| S1-2 | **Build Leads module** | `modules/leads/` | `POST /api/leads/enquiry` — save name, email, phone, message to DB. Queue email notification to admin. | §1 Let's Talk |
| S1-3 | **Email service (foundation)** | `modules/email/` | Resend SDK integration. `sendEmail(to, template, data)` method. Template rendering (Handlebars/React Email). | Notifications |
| S1-4 | **Email — Contact form notification** | — | Template: "New enquiry from {name}" sent to admin team | §1 Let's Talk |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S1-5 | **Home page** | `/` — Hero section, 3 offers (11 Steps, Speaker, Vision Board), Roweena's story, testimonials carousel, certifications/badges, social links | §1 Home |
| S1-6 | **About Me page** | `/about` — Roweena's bio, qualifications, media mentions | §1 About Me |
| S1-7 | **11 Steps to U page** | `/programs/11-steps-to-u` — Program details pulled from API, price, CPD hours, open batches with dates, "Get Started" CTA | §1 Program Pages |
| S1-8 | **Vision Boards page** | `/programs/vision-boards` — Workshop description, pricing, upcoming dates | §1 Program Pages |
| S1-9 | **Speaker page** | `/speaker` — Resilience and brain health speaking, topics, booking CTA | §1 Speaker |
| S1-10 | **Let's Talk (Contact) page** | `/contact` — Enquiry form (name, email, phone, message) → `POST /api/leads/enquiry` | §1 Let's Talk |
| S1-11 | **Terms & Conditions page** | `/terms` — Static legal content | §1 Terms |
| S1-12 | **Privacy Policy page** | `/privacy` — UAE PDPL-compliant privacy policy | Privacy |
| S1-13 | **Header component** | Logo, nav links, Sign In / Create Account buttons. Mobile hamburger menu. | §1 Header |
| S1-14 | **Footer component** | Coaching disclaimer, social links (Instagram, LinkedIn, YouTube), copyright | §1 Footer |
| S1-15 | **Cookie consent banner** | Accept/Reject cookies, save preference to localStorage | §1 Cookie |
| S1-16 | **SEO implementation** | `<title>`, `<meta description>`, Open Graph, Twitter Card, `sitemap.xml`, `robots.txt`. Carry over existing titles/descriptions from GoDaddy. | §1 SEO |
| S1-17 | **301 redirects** | Map all existing GoDaddy URLs → new Next.js URLs in `next.config.js` `redirects` array | §1 Redirects |
| S1-18 | **ISR configuration** | Program pages use ISR with 60s revalidation. Static pages use SSG. | Performance |

#### Sprint 1–2 — Acceptance Criteria

- [ ] All 7 public pages render correctly on desktop, tablet, and mobile
- [ ] Program page dynamically pulls data from API (name, price, dates, batches)
- [ ] "Get Started" button links to `/signup?program=11-steps-to-u`
- [ ] Contact form submits and admin receives email notification
- [ ] Cookie consent banner appears and saves preference
- [ ] Lighthouse SEO score ≥ 90
- [ ] All old GoDaddy URLs redirect to correct new pages (301)
- [ ] Footer disclaimer appears on every page
- [ ] Page loads in < 3 seconds on 3G connection (mobile)

---

### Sprint 3–4 — Payment, Invoicing & Agreement (Weeks 5–6)

**Goal:** Learner can register for a program, pay via Stripe, receive an invoice, and sign the program agreement.

> **Dependencies:** Stripe test keys (C3, T10), agreement template text (C4)

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S3-1 | **Build Payments module** | `modules/payments/` | — | — |
| S3-2 | **Stripe Checkout session** | — | `POST /api/payments/checkout` — validates program, batch, coupon. Creates Stripe Checkout Session. Returns `checkoutUrl`. | §2 Payment |
| S3-3 | **Stripe webhook handler** | — | `POST /webhooks/stripe` — verify signature. Handle `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`. Create Payment record, update Enrolment status. | §2 Payment |
| S3-4 | **Coupon management** | — | `POST /api/admin/coupons` (create), `GET /api/admin/coupons` (list), `PATCH /api/admin/coupons/:id` (update/deactivate), `POST /api/coupons/validate` (public — check code validity) | Pricing |
| S3-5 | **Invoice generation** | `modules/payments/invoices` | BullMQ job: `invoice-gen` queue. Generate PDF (company details, logo, invoice number, tax, line items). Upload to R2. Send to learner email. | Invoices |
| S3-6 | **Invoice config (admin)** | — | `GET/PUT /api/admin/settings/invoice` — company name, logo, number format, sequence, tax fields, footer notes | Invoices |
| S3-7 | **Invoice endpoints** | — | `GET /api/invoices` (learner's invoices), `GET /api/admin/invoices` (all), `GET /api/invoices/:id/download` (signed URL to PDF) | Invoices |
| S3-8 | **Build Enrolments module** | `modules/enrolments/` | `POST /api/enrolments` (auto on payment), `GET /api/enrolments/mine`, `PATCH /api/admin/enrolments/:id` (admin: move batch, change status) | §3 Batch |
| S3-9 | **Manual enrolment (admin)** | — | `POST /api/admin/enrolments/manual` — offline payment or complimentary seat. Admin specifies payment method. | Pricing |
| S3-10 | **Build Agreements module** | `modules/agreements/` | — | — |
| S3-11 | **Agreement template management** | — | `POST/GET/PATCH /api/admin/agreement-templates` — CRUD for versioned agreement templates (HTML content) | §2 Agreement |
| S3-12 | **Agreement signing** | — | `POST /api/agreements/sign` — receives: consent tick, full name, signature (base64 image), IP address. Generates signed PDF (agreement text + signature). Uploads to R2. Updates enrolment status to `ACTIVE`. | §2 Agreement |
| S3-13 | **Agreement verification** | — | `GET /api/agreements/:enrolmentId` — returns signed agreement details and PDF download link | §2 Agreement |
| S3-14 | **Email — Payment confirmation** | — | Template: "Payment received for {program}. Invoice attached." | Notifications |
| S3-15 | **Email — Agreement reminder** | — | Template: "Please sign your agreement to access Step 1." Sent 24h after payment if unsigned. | Notifications |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S3-16 | **Registration flow** | `/register?program=xxx&batch=yyy` — Select batch, enter details, apply coupon, proceed to payment | §2 Registration |
| S3-17 | **Stripe Checkout redirect** | After registration form, redirect to Stripe Checkout. Handle success (`/payment/success`) and cancel (`/payment/cancel`) callbacks. | §2 Payment |
| S3-18 | **Payment success page** | `/payment/success` — "Payment received! Please sign your agreement to begin." with CTA | §2 Payment |
| S3-19 | **Agreement signing page** | `/agreement/sign` — Display agreement text, consent checkbox, full name input, signature pad (canvas). Submit button. | §2 Agreement |
| S3-20 | **Invoice list (portal)** | `/portal/invoices` — List of learner's invoices with download buttons | Invoices |
| S3-21 | **Admin — Coupon management** | `/admin/coupons` — Create/edit/deactivate coupons, usage stats | Pricing |
| S3-22 | **Admin — Invoice settings** | `/admin/settings/invoices` — Company details, logo upload, number format | Invoices |
| S3-23 | **Admin — Payments list** | `/admin/payments` — All payments with filters (course, batch, date, status, currency), export to Excel | Invoices |
| S3-24 | **Admin — Manual enrolment** | `/admin/enrolments/new` — Manually enrol a learner (offline/complimentary) | Pricing |

#### Sprint 3–4 — Acceptance Criteria

- [ ] Learner can select a batch, apply a coupon, and pay via Stripe Checkout
- [ ] Stripe webhook creates Payment + Enrolment records in DB
- [ ] Invoice PDF is generated automatically and emailed to learner
- [ ] Learner can sign the agreement (read, tick, type name, draw signature)
- [ ] Signed agreement PDF is stored in R2 with IP and timestamp
- [ ] Step 1 remains locked until agreement is signed
- [ ] Admin can create/edit coupons (percentage, fixed, usage limit, expiry)
- [ ] Admin can manually enrol a learner and mark payment method
- [ ] Payment confirmation and agreement reminder emails send correctly
- [ ] Edge case: double-clicking "Pay" does not create duplicate payments (idempotent)

---

### Sprint 5–6 — 11 Steps Program + Quizzes (Weeks 7–8)

**Goal:** Admin can create course content in Roweena's Studio. Learners work through 11 steps with locked progression and step quizzes.

> **Dependencies:** Step titles (C6), sample content for testing (C7)

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S5-1 | **Programs module (admin CRUD)** | `modules/programs/` | `POST /api/admin/programs`, `PATCH /api/admin/programs/:id`, `POST /api/admin/programs/:id/publish`, `POST /api/admin/programs/:id/unpublish`, `POST /api/admin/programs/:id/duplicate` | Course Mgmt |
| S5-2 | **Steps module (admin CRUD)** | `modules/programs/steps` | `POST /api/admin/programs/:id/steps` (create), `PATCH /api/admin/steps/:id` (update), `PUT /api/admin/programs/:id/steps/reorder` (drag-drop order), `DELETE /api/admin/steps/:id` | §4 Steps |
| S5-3 | **Content/Lessons module** | `modules/content/` | `POST /api/admin/steps/:id/lessons` (upload video/PDF/audio + metadata), `PATCH /api/admin/lessons/:id`, `PUT /api/admin/steps/:id/lessons/reorder`, `DELETE /api/admin/lessons/:id` | §4 Steps |
| S5-4 | **File upload service** | `modules/storage/` | `POST /api/uploads/presigned-url` — generate R2 pre-signed URL for direct browser upload. Support: video (then push to Mux), PDF (R2), audio (R2), images (R2) | Data & Storage |
| S5-5 | **Content delivery (signed URLs)** | — | `GET /api/lessons/:id/content` — verify learner has access to this step, then return short-lived signed URL (15 min). For video: Mux signed playback URL. For PDF/audio: R2 signed URL. | Content Protection |
| S5-6 | **Lesson completion tracking** | — | `POST /api/lessons/:id/complete` — mark lesson as viewed. Validate: video watched to X%, PDF opened. | §4 Completion |
| S5-7 | **Step unlock logic** | — | Service method: `checkStepUnlock(enrolmentId, stepId)`. Checks: all previous step lessons complete + quiz passed + optional date-based release per batch (`BatchStepOverride`). | §4 Unlock Rule |
| S5-8 | **Enrolment progress calculation** | — | `calculateProgress(enrolmentId)` — returns `{currentStep, progressPercent, cpdHoursEarned}` based on completed lessons and quizzes | §9 Dashboard |
| S5-9 | **Build Quizzes module** | `modules/quizzes/` | — | — |
| S5-10 | **Question bank (admin CRUD)** | — | `POST /api/admin/questions`, `GET /api/admin/questions?stepId=x`, `PATCH /api/admin/questions/:id`, `DELETE /api/admin/questions/:id`. Questions tagged by step. | §6 Question Bank |
| S5-11 | **Quiz configuration** | — | `POST /api/admin/steps/:id/quiz` — set: question count (10), pass mark, retry limit, wait time between retries | §6 Step Quizzes |
| S5-12 | **Quiz attempt (learner)** | — | `POST /api/quizzes/:id/start` — draw N random questions for this step, return them (shuffled). `POST /api/quizzes/:id/submit` — grade answers, save attempt, return score/pass-fail. Enforce retry limit + wait time. | §6 Step Quizzes |
| S5-13 | **Step unlock notification** | — | When step N+1 unlocks: queue in-app notification + email to learner. WebSocket event: `step:unlocked`. | Notifications |
| S5-14 | **Audit logging for admin actions** | `common/interceptors/` | Auto-intercept: unlock/lock step, override quiz, edit content. Log `who`, `what`, `when`, `reason`. | Audit Log |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S5-15 | **Roweena's Studio — Program management** | `/admin/programs` — List all programs (table), create/edit/duplicate/publish/archive | Course Mgmt |
| S5-16 | **Roweena's Studio — Step editor** | `/admin/programs/:id/steps` — Drag-drop reorderable steps, each expandable with lessons inside | §4 Steps |
| S5-17 | **Roweena's Studio — Lesson upload** | Inside step editor: upload video/PDF/audio, set title, drag-drop reorder, preview as learner, publish/draft toggle | §4 Steps |
| S5-18 | **Roweena's Studio — Preview mode** | "Preview as Learner" button — renders the step/lesson as a learner would see it | Course Mgmt |
| S5-19 | **Portal — Step list page** | `/portal/program/:slug` — Shows all 11 steps with lock/unlock status, progress bar per step. Locked steps show a lock icon + "Complete Step X first" | §4 Steps |
| S5-20 | **Portal — Step detail / Lesson viewer** | `/portal/steps/:stepId` — Lists lessons. Click lesson opens inline viewer (video player / PDF viewer / audio player) | §4 Steps |
| S5-21 | **Portal — Video player** | Custom player: no download, no right-click, moving watermark with learner name/email. Use Mux Player SDK. | Content Protection (Video) |
| S5-22 | **Portal — PDF viewer** | In-app viewer using `react-pdf`. Page-by-page render. No download/print button. Light watermark with learner name. | Content Protection (PDF) |
| S5-23 | **Portal — Audio player** | Custom audio player with progress bar. No download button. Signed URL. | Content Protection (Audio) |
| S5-24 | **Portal — Quiz page** | `/portal/steps/:stepId/quiz` — Shows 10 questions (MCQ), timer (if configured), submit button. After submit: score, pass/fail, which step to revisit. | §6 Step Quizzes |
| S5-25 | **Portal — Quiz retry logic** | If failed: show retry countdown timer. If retries exhausted: show "Contact admin" message. | §6 Step Quizzes |
| S5-26 | **Admin — Question bank** | `/admin/questions` — Table with filters by step. Create/edit/delete questions. Bulk import (CSV). | §6 Question Bank |
| S5-27 | **Admin — Quiz settings** | Inside step editor: configure pass mark, retry limit, wait time per quiz | §6 Step Quizzes |

#### Sprint 5–6 — Acceptance Criteria

- [ ] Admin can create a program with 11 steps, upload lessons (video, PDF, audio)
- [ ] Admin can reorder steps and lessons via drag-and-drop
- [ ] "Preview as Learner" renders content in protected viewer
- [ ] Learner sees Step 1 as unlocked, Steps 2–11 as locked
- [ ] After completing all Step 1 lessons + passing the quiz → Step 2 unlocks
- [ ] Quiz draws 10 random questions, shuffles them, grades automatically
- [ ] Failed quiz shows retry countdown timer (if wait time is configured)
- [ ] Retries exhausted → "Contact admin" message
- [ ] Video player shows moving watermark with learner name, no download option
- [ ] PDF viewer renders page-by-page with watermark, no print/download
- [ ] Step unlock triggers email + in-app notification to learner
- [ ] Audit log captures: admin uploads content, admin unlocks a step manually
- [ ] Signed URLs expire after 15 minutes (test by waiting 16 minutes)

---

### Sprint 7–8 — Dashboard, Notifications, Admin Panel & Batch Management (Weeks 9–10)

**Goal:** Learner dashboard is fully functional. Admin panel shows operational dashboard. Batch management is complete. Core notifications are working.

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S7-1 | **Build Batches module (full)** | `modules/batches/` | `POST /api/admin/batches` (create), `PATCH /api/admin/batches/:id` (update), `POST /api/admin/batches/:id/close`, `POST /api/admin/batches/:id/archive`, `GET /api/admin/batches` (list with filters) | §3 Batches |
| S7-2 | **Batch — Move learner** | — | `POST /api/admin/enrolments/:id/move-batch` — move learner to another batch without losing progress | §3 Batches |
| S7-3 | **Batch — Announcements** | — | `POST /api/admin/batches/:id/announcement` — send to all learners in batch (email + in-app) | §3 Batches |
| S7-4 | **Build Notifications module (core)** | `modules/notifications/` | `GET /api/notifications` (learner's notifications, paginated), `PATCH /api/notifications/:id/read`, `GET /api/notifications/unread-count` | Notifications |
| S7-5 | **Notification preferences** | — | `GET/PATCH /api/notification-preferences` — learner toggles non-essential email notifications on/off | Notifications |
| S7-6 | **WebSocket gateway (notifications)** | `modules/websocket/` | Socket.IO server. Authenticate via JWT handshake. User joins `user:{userId}` room. Push `notification:new` events on new notification. | Real-Time |
| S7-7 | **Email queue — Core templates** | — | Create templates: signup, verification, password reset, payment confirmation, agreement reminder, step unlocked, batch welcome | Notifications |
| S7-8 | **Admin dashboard API** | `modules/admin/` | `GET /api/admin/dashboard` — returns: active learners count, revenue this month, new enrolments this week, batches in progress, pending certificates, unread chats | §13 Admin Dashboard |
| S7-9 | **Admin — Learner profile API** | — | `GET /api/admin/users/:id/profile` — everything about one learner: enrolments, progress, quiz results, payments, invoices, agreements, attendance, certificates | §13 Learner Profile |
| S7-10 | **Learner dashboard API** | — | `GET /api/portal/dashboard` — current step, progress %, CPD hours earned, next session, pending quiz, invoices, agreement status, certificates | §9 Dashboard |
| S7-11 | **Batch-access guard (full)** | `common/guards/` | Manager can only access learners/sessions/attendance for their assigned batches. 403 for other batches. | Permissions |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S7-12 | **Portal — Learner dashboard** | `/portal/dashboard` — Progress card (current step, %), CPD hours ring, next session card, pending quiz alert, quick links to invoices/agreements/certificates | §9 Dashboard |
| S7-13 | **Portal — Notification bell** | Header bell icon with unread badge. Dropdown: latest notifications. Click → `/portal/notifications` (full list) | Notifications |
| S7-14 | **Portal — Notification page** | `/portal/notifications` — All notifications, mark as read, filter by type | Notifications |
| S7-15 | **Portal — Notification preferences** | `/portal/settings/notifications` — Toggle switches for non-essential email types | Notifications |
| S7-16 | **Admin — Dashboard** | `/admin/dashboard` — Stats cards (active learners, revenue, enrolments, pending certs, unread chats), recent activity feed, batch status chart (recharts) | §13 Dashboard |
| S7-17 | **Admin — Learner profile** | `/admin/users/:id` — Tabbed view: Overview, Enrolments, Progress, Quiz Results, Payments, Agreements, Attendance, Certificates. All info in one place. | §13 Learner Profile |
| S7-18 | **Admin — Users list** | `/admin/users` — Table with search, filter by role/status/batch, export to Excel | §13 Admin |
| S7-19 | **Admin — Batch management** | `/admin/batches` — Create/edit batch, assign manager, set capacity, view enrolled learners, send announcement, close/archive | §3 Batches |
| S7-20 | **Admin — Batch detail** | `/admin/batches/:id` — Session calendar, attendance sheet, progress view, enrolled learners table, announcement log | §3 Batches |
| S7-21 | **Admin — Audit log viewer** | `/admin/audit-log` — Filterable table: who, action, target, timestamp. Search by user or action type. | Audit Log |

#### Sprint 7–8 — Acceptance Criteria (MVP Gate)

- [ ] Learner dashboard shows: progress %, current step, CPD hours, next session, pending quiz
- [ ] Notification bell shows unread count, real-time update via WebSocket
- [ ] Learner receives email for: signup, payment, agreement reminder, step unlocked, batch welcome
- [ ] Learner can toggle off non-essential email notifications
- [ ] Admin dashboard shows: active learners, revenue, enrolments, pending certs count
- [ ] Admin can view complete learner profile (all data in one place)
- [ ] Admin can create a batch, assign manager, set capacity
- [ ] Admin can move a learner between batches without losing progress
- [ ] Admin can send a batch announcement (email + in-app)
- [ ] Manager can only see learners in their assigned batches (403 for others)
- [ ] Audit log records all admin state-change actions
- [ ] **END-TO-END TEST:** Visitor → signup → verify email → login → select batch → pay (Stripe test) → sign agreement → view Step 1 → complete lessons → pass quiz → Step 2 unlocks → see dashboard progress at ~9%

---

## 3. Phase 2 — Certification Complete (Sprints 9–14)

> **Phase Goal:** First batch can fully complete the program — live sessions, attendance tracking, final exam, oral assessment, certificates, resource library, and admin reports are all functional.

---

### Sprint 9–10 — Live Sessions, Zoom/Meet & Calendar (Weeks 11–12)

**Goal:** Admin/manager can schedule live sessions, Zoom/Meet links auto-created, sessions on Roweena's Outlook calendar, learners can book 1:1 slots.

> **Dependencies:** Zoom credentials (C8), MS Graph credentials (C9)

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S9-1 | **Build Sessions module** | `modules/sessions/` | `POST /api/admin/sessions` (create), `PATCH /api/admin/sessions/:id`, `DELETE /api/admin/sessions/:id`, `GET /api/sessions` (learner — batch sessions), `GET /api/admin/sessions` (all) | §7 Sessions |
| S9-2 | **Meeting provider abstraction** | `modules/integrations/meeting/` | `MeetingProvider` interface. `ZoomProvider` and `GoogleMeetProvider` implementations. Config-driven switch. | §7, Third-Party |
| S9-3 | **Zoom integration** | — | Create meeting, get recording, get participants. Uses Server-to-Server OAuth. | §7 Zoom |
| S9-4 | **Google Meet integration** | — | Create meeting via Google Calendar API. Get participant report. | §7 Meet |
| S9-5 | **Outlook calendar sync** | `modules/integrations/outlook/` | Add session to Roweena's calendar (MS Graph). Read busy times for booking slot availability. Two-way: Outlook clash blocks site slot. | §7 Calendar |
| S9-6 | **Session booking (1:1)** | `modules/sessions/booking/` | `GET /api/sessions/availability?date=x` (learner — available slots in their timezone), `POST /api/sessions/book` (book a slot), `POST /api/sessions/:id/reschedule`, `POST /api/sessions/:id/cancel` | §7 Booking |
| S9-7 | **Session types** | — | Predefined types: Welcome Call, Closing Call, 1:1 with Ro, Vision Board Workshop, Speaker Discovery Call. Each with fixed duration and auto-naming. | §7 Booking Types |
| S9-8 | **Session reminders (cron)** | — | BullMQ scheduled job: check for sessions starting in 24h → queue reminder email + notification. Check again at 1h before. | Notifications |
| S9-9 | **Recording upload / auto-pull** | — | After session: admin uploads recording manually OR Zoom webhook delivers recording URL. Store/link to batch for view-only playback. | §7 Recordings |
| S9-10 | **Zoom webhook handler** | — | `POST /webhooks/zoom` — handle `recording.completed`, `meeting.ended`. Auto-fetch participant list. | Third-Party |
| S9-11 | **Email — Session reminder** | — | Template: "{session} starts in 24 hours. Join link: {url}" (respects learner timezone) | Notifications |
| S9-12 | **Email — Booking confirmed/cancelled** | — | Templates for confirmed, rescheduled, and cancelled bookings | Notifications |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S9-13 | **Admin — Session scheduler** | `/admin/sessions/new` — Select type, batch (or 1:1), date/time, auto-creates Zoom/Meet link | §7 Sessions |
| S9-14 | **Admin — Sessions list** | `/admin/sessions` — Calendar view (monthly/weekly) + list view with filters | §7 Sessions |
| S9-15 | **Portal — Session page** | `/portal/sessions/:id` — Join button (active 5 min before start), agenda, materials, recording (after session) | §7 Session Page |
| S9-16 | **Portal — Booking page** | `/portal/booking` — Calendar with available slots in learner's timezone. Select slot → confirm → Zoom link created | §7 Booking |
| S9-17 | **Portal — Sessions list** | `/portal/sessions` — Upcoming sessions for learner's batch, with countdown timers | §7 Sessions |
| S9-18 | **Admin — Recording management** | Inside session detail: upload recording or view auto-pulled Zoom recording | §7 Recordings |

#### Sprint 9–10 — Acceptance Criteria

- [ ] Admin creates a session for a batch → Zoom link auto-created → appears on Roweena's Outlook
- [ ] Learner sees session in their dashboard with correct timezone
- [ ] Session reminder email sent 24h and 1h before (in learner's timezone)
- [ ] Learner books a 1:1 slot from Roweena's available times
- [ ] Outlook busy times block those slots on the site
- [ ] After session ends, recording available for batch playback (view-only player)
- [ ] Reschedule and cancel work with appropriate notifications

---

### Sprint 11–12 — Attendance, Final Exam & Oral Assessment (Weeks 13–14)

**Goal:** Attendance auto-imported from Zoom/Meet, final written exam with shuffled questions, oral assessment scored by admin.

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S11-1 | **Build Attendance module** | `modules/attendance/` | `GET /api/admin/sessions/:id/attendance` (view), `PATCH /api/admin/attendance/:id` (manual correction with reason), `GET /api/portal/attendance` (learner's own) | §8 Attendance |
| S11-2 | **Auto-import attendance** | — | BullMQ job (`attendance-import`): After meeting ends, pull Zoom/Meet participant report. Match by email. Unmatched → review list for manager. | §8 Auto-Import |
| S11-3 | **Attendance rules** | — | Configurable minimum attendance per session type (e.g., 75% of session time = "present"). Stored in program settings. | §8 Rules |
| S11-4 | **In-person check-in** | — | `POST /api/sessions/:id/checkin` — QR code / check-in link for in-person workshops | §8 In-Person |
| S11-5 | **Final written exam** | `modules/exams/` | `POST /api/exams/:programId/start` — draw 50 questions from bank (shuffled, each retake is different). Time limit enforced server-side. `POST /api/exams/:id/submit` — grade, save attempt. | §6 Final Exam |
| S11-6 | **Oral assessment** | — | `POST /api/admin/oral-assessments` — admin records: rubric scores, total score, pass/fail, notes. Links to enrolment. `GET /api/admin/oral-assessments/:enrolmentId` | §6 Oral Assessment |
| S11-7 | **Certificate eligibility check** | — | Service: `checkCertificateEligibility(enrolmentId)`. Returns boolean + details of what's missing (steps, quizzes, exam, oral, attendance, closing call). | §10 Eligibility |
| S11-8 | **Email — Quiz/exam result** | — | Template: "You scored {score}% on {quiz}. {pass/fail}." | Notifications |
| S11-9 | **Email — Attendance correction** | — | Template: "Your attendance for {session} has been updated by {admin}." | Notifications |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S11-10 | **Admin — Attendance dashboard** | `/admin/sessions/:id/attendance` — Table: learner name, join time, leave time, minutes present, present/absent badge. Manual correction button. | §8 Attendance |
| S11-11 | **Admin — Unmatched participants** | Review list: unmatched Zoom names → dropdown to link to a learner | §8 Matching |
| S11-12 | **Portal — Exam page** | `/portal/exam/:programId` — 50 questions, countdown timer, submit. Results page: score, pass/fail, areas to revisit. | §6 Final Exam |
| S11-13 | **Admin — Oral assessment form** | `/admin/oral-assessment/:enrolmentId` — Rubric score inputs, notes textarea, pass/fail toggle, submit | §6 Oral Assessment |
| S11-14 | **Admin — Exam results** | `/admin/exams/results` — Results per learner and per batch | §6 Results |
| S11-15 | **Portal — My attendance** | `/portal/attendance` — Sessions attended, percentage, missing sessions | §8 Dashboard Feed |

#### Sprint 11–12 — Acceptance Criteria

- [ ] After a Zoom session ends, attendance auto-imported within 15 minutes
- [ ] Unmatched participants appear in manager's review list
- [ ] Manager can manually correct attendance (with logged reason)
- [ ] Final exam draws 50 random questions, shuffled (different per attempt)
- [ ] Timer enforced: auto-submit when time expires
- [ ] Admin can score oral assessment with rubric and notes
- [ ] Certificate eligibility check correctly identifies missing requirements
- [ ] Learner's dashboard shows attendance percentage

---

### Sprint 13–14 — Certificates, Resource Library & Reports (Weeks 15–16)

**Goal:** Certificates generated and issued on admin approval. Resource library available. Admin reports with export.

> **Dependencies:** Certificate template design (C10)

#### Backend Tasks

| # | Task | NestJS Module | API Endpoints | PDF Ref |
|---|------|--------------|---------------|---------|
| S13-1 | **Build Certificates module** | `modules/certificates/` | `GET /api/admin/certificates/pending` (eligible, awaiting approval), `POST /api/admin/certificates/:id/approve`, `POST /api/admin/certificates/:id/reject` | §10 Certificates |
| S13-2 | **Certificate generation** | — | BullMQ job (`certificate-gen`): Render PDF using template + data (learner name, program, date, CPD hours, cert number). Upload to R2. | §10 Certificates |
| S13-3 | **Certificate template management** | — | `POST /api/admin/certificate-templates` (upload), `GET /api/admin/certificate-templates`, `PATCH /api/admin/certificate-templates/:id` | §10 Templates |
| S13-4 | **Certificate public verification** | — | `GET /api/certificates/verify/:certNumber` (public, no auth). Returns: learner name, program, date, CPD hours. | §9 Verify |
| S13-5 | **Certificate download (learner)** | — | `GET /api/certificates/mine`, `GET /api/certificates/:id/download` (signed URL) | §10 |
| S13-6 | **Build Resources module** | `modules/content/resources` | `POST /api/admin/resources` (upload), `GET /api/resources?category=x&stepId=y` (learner, filtered), view-only access with signed URLs | §5 Resource Library |
| S13-7 | **Resource access control** | — | Check: learner has access to this resource's program/batch/step before returning signed URL | §5 Access |
| S13-8 | **Build Reports module** | `modules/reports/` | `GET /api/admin/reports/payments` (filters + aggregate), `GET /api/admin/reports/attendance` (by batch), `GET /api/admin/reports/quiz-results` (by batch), `GET /api/admin/reports/progress` (by batch), `GET /api/admin/reports/certificates` | §13 Reports |
| S13-9 | **Excel export** | — | `GET /api/admin/reports/:type/export` — generates XLSX using `exceljs`, returns download link | §13 Reports |
| S13-10 | **Email — Certificate issued** | — | Template: "Congratulations! Your certificate for {program} has been issued." with download link | Notifications |
| S13-11 | **Revenue summary API** | — | `GET /api/admin/reports/revenue` — by course, batch, and month | Invoices Revenue |

#### Frontend Tasks

| # | Task | Route / Component | PDF Ref |
|---|------|-------------------|---------|
| S13-12 | **Admin — Pending certificates** | `/admin/certificates/pending` — List of eligible learners, review details, approve/reject buttons | §10 Certificates |
| S13-13 | **Admin — Certificate templates** | `/admin/certificate-templates` — Upload/manage templates, preview with sample data | §10 Templates |
| S13-14 | **Portal — My certificates** | `/portal/certificates` — Download certificate PDF, share link, "Add to LinkedIn" button | §10 Certificates |
| S13-15 | **Public — Certificate verification** | `/verify/:certNumber` — Public page showing certificate details. No auth needed. | §9 Verify |
| S13-16 | **Portal — Resource library** | `/portal/resources` — Browse by category, filter by step. View-only (in-app viewer). | §5 Resource Library |
| S13-17 | **Admin — Resource management** | `/admin/resources` — Upload, categorize, tag by step, set access permissions | §5 Resource Library |
| S13-18 | **Admin — Reports page** | `/admin/reports` — Tab view: Payments, Attendance, Quiz Results, Progress, Certificates. Each with filters + "Export to Excel" button | §13 Reports |
| S13-19 | **Admin — Revenue dashboard** | `/admin/reports/revenue` — Charts (recharts): revenue by course, by batch, by month. Summary cards. | Invoices Revenue |

#### Sprint 13–14 — Acceptance Criteria

- [ ] When all requirements met, learner appears in "Pending Certificates" list
- [ ] Admin approves → certificate PDF generated → learner notified
- [ ] Certificate has: learner name, program, date, CPD hours, unique certificate number
- [ ] Public verification page works without login
- [ ] "Add to LinkedIn Profile" button works
- [ ] Resource library shows only resources the learner has access to
- [ ] All 5 report types work with filters and Excel export
- [ ] Revenue summary chart shows data by course, batch, and month
- [ ] **FULL E2E TEST:** Complete all 11 steps + quizzes → pass final exam → pass oral → meet attendance → closing call → certificate pending → admin approves → learner downloads

---

## 4. Phase 3 — Engagement & Polish (Sprints 15–18)

> **Phase Goal:** Chat system, progress sharing, workshops/corporate track, performance optimization, and production launch preparation.

---

### Sprint 15–16 — Chat & Progress Sharing (Weeks 17–18)

#### Backend Tasks

| # | Task | PDF Ref |
|---|------|---------|
| S15-1 | **Build Chat module** — `modules/chat/`. WebSocket events: `chat:send_message`, `chat:typing`, `chat:mark_read`. REST: `GET /api/conversations`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages` (fallback) | §11 Chat |
| S15-2 | **Staff shared inbox** — `GET /api/admin/conversations` (all conversations), `POST /api/admin/conversations/:id/assign` (assign to team member), `POST /api/admin/conversations/:id/resolve` | §11 Inbox |
| S15-3 | **File/image attachments in chat** — Upload to R2, return signed URL. Max 10MB. Types: jpg, png, pdf. | §11 Chat |
| S15-4 | **Unread message email** — If message unread after 30 min, send email notification to recipient | §11 Notifications |
| S15-5 | **Progress sharing** — `POST /api/portal/progress/share` — generate public link or image card showing milestones. `GET /api/share/:token` — public progress view | §9 Sharing |
| S15-6 | **LinkedIn/Instagram/WhatsApp share** — Generate OG image with milestone data. Share URL works on all platforms. | §9 Sharing |
| S15-7 | **Daily summary email (cron)** — Each morning (per timezone): new enrolments, pending certs, unread chats → admin and managers | Notifications |
| S15-8 | **Inactivity nudge (cron)** — If learner has N days with no progress → send nudge email | Notifications |
| S15-9 | **Remaining notification templates** — All remaining notifications from the notification matrix (PRD §19) | Notifications |

#### Frontend Tasks

| # | Task | PDF Ref |
|---|------|---------|
| S15-10 | **Portal — Chat** — `/portal/chat` — conversation list, message thread, typing indicator, file upload, emoji picker, read receipts | §11 Chat |
| S15-11 | **Admin — Shared inbox** — `/admin/chat` — all conversations, assign to team, resolve, filter by batch/status | §11 Inbox |
| S15-12 | **Portal — Progress sharing** — `/portal/progress/share` — preview card, choose what to show, generate link/image, share buttons (LinkedIn, WhatsApp) | §9 Sharing |
| S15-13 | **Admin — Notification template editor** — `/admin/settings/notifications` — edit email templates (subject, body), toggle on/off per notification type | Notifications |

#### Sprint 15–16 — Acceptance Criteria

- [ ] Learner can send message to staff, receive reply in real-time
- [ ] Typing indicator and read receipts work
- [ ] File/image attachments send and display correctly
- [ ] Staff shared inbox shows all conversations, assignable, resolvable
- [ ] Unread message → email after 30 minutes
- [ ] Progress sharing generates a working public link with OG image
- [ ] Daily summary email delivers to admin each morning
- [ ] Inactivity nudge sends after configured days of no progress

---

### Sprint 17–18 — Corporate Track, Polish & Production Launch (Weeks 19–20)

#### Backend Tasks

| # | Task | PDF Ref |
|---|------|---------|
| S17-1 | **Corporate registration flow** — Company registers, pays for N participants, each gets individual login. Uses `Company` model. Invoice issued to company. | §12 Corporate |
| S17-2 | **Workshop program type** — Simple open course (no step locking, no quizzes). One-day format. Certificate of participation (no exam/CPD). | §12 Workshops |
| S17-3 | **In-person check-in** — QR code generation for sessions. Scan → mark attendance. | §8 In-Person |
| S17-4 | **Waitlist auto-advancement** — When seat opens in batch: notify next waitlisted learner → time-limited payment link → if expired, advance to next person | §2 Waitlist |
| S17-5 | **Instalment plans** — `InstalmentPlan` model. Stripe subscription or scheduled payments. Reminders for upcoming dues. Handling failed instalment payments. | Pricing |
| S17-6 | **Admin — Manual announcement** — Send to one learner, one batch, or all learners | Notifications |
| S17-7 | **Email delivery logging** — `NotificationDelivery` model tracks per-channel status (sent, delivered, bounced, failed) via Resend webhooks | Notifications |
| S17-8 | **Performance optimization** — Implement Redis caching (ARCH §20). Lazy-load admin components. Optimize DB queries (add missing indexes). Image optimization. | Non-Functional |
| S17-9 | **Security hardening** — Helmet.js, CORS whitelist, CSRF protection, final rate limiting review per endpoint (ARCH §21) | Security |
| S17-10 | **Stripe live mode setup** — Switch from test keys to live keys. Configure live webhook URL. | Payment |

#### Frontend Tasks

| # | Task | PDF Ref |
|---|------|---------|
| S17-11 | **Corporate registration page** — `/register/corporate` — company info, number of participants, payment for all | §12 Corporate |
| S17-12 | **Workshop pages** — Dynamic program pages for workshop-type courses (no step locking UI) | §12 Workshops |
| S17-13 | **Performance audit** — Lighthouse audit all pages. Target: Performance ≥ 80, SEO ≥ 90, Accessibility ≥ 85. Fix issues. | Non-Functional |
| S17-14 | **Cross-browser testing** — Test on Chrome, Safari, Firefox, Edge (desktop + mobile). Fix rendering issues. | Non-Functional |
| S17-15 | **Admin user guide** — In-app help tooltips + standalone guide document for Roweena's team | Handover |

#### Production Launch Tasks

| # | Task | Details |
|---|------|---------|
| S17-16 | **Data migration** | Migrate existing learner/booking data from GoDaddy (if any) per PRD §15 |
| S17-17 | **DNS cutover** | Point `whatboutme.com` from GoDaddy to AWS CloudFront/Amplify. Configure SSL via ACM. |
| S17-18 | **SPF/DKIM/DMARC** | Email authentication records for `whatboutme.com` sending domain |
| S17-19 | **AWS RDS PITR test** | Restore a backup to a test instance, verify data integrity |
| S17-20 | **Smoke tests on production** | Run the full E2E test suite against production data |
| S17-21 | **Admin training session** | 1-hour video call training Roweena's team on the admin panel |
| S17-22 | **Handover** | Source code access, setup guide, admin guide, architecture overview |

#### Sprint 17–18 — Acceptance Criteria (Production Gate)

- [ ] Corporate registration: company pays for N people, each gets login
- [ ] Workshop program: open course, no locking, participation certificate
- [ ] QR check-in works for in-person events
- [ ] Waitlist auto-advancement sends time-limited payment links
- [ ] Lighthouse: Performance ≥ 80, SEO ≥ 90, Accessibility ≥ 85
- [ ] All pages work on Chrome, Safari, Firefox, Edge (desktop + mobile)
- [ ] Stripe live mode processes real payments
- [ ] DNS cutover complete, SSL working
- [ ] AWS RDS backup restore tested successfully
- [ ] Admin training completed
- [ ] Handover documents delivered

---

## 5. Phase Gates & Review Criteria

### Gate 1: MVP Staging Review (After Sprint 8, ~Week 10)

| # | Test | Pass Criteria |
|---|------|---------------|
| G1-1 | Visitor discovers program on public site | All 7 public pages render, SEO ≥ 90 |
| G1-2 | Learner signs up, verifies email, logs in | Email verification works, session created |
| G1-3 | Learner pays via Stripe and receives invoice | Payment → Enrolment → Invoice PDF emailed |
| G1-4 | Learner signs agreement | Signed PDF stored, Step 1 unlocks |
| G1-5 | Learner completes Step 1 lessons + quiz | Step 2 unlocks, progress updates |
| G1-6 | Admin creates program and manages content | CRUD works, preview-as-learner works |
| G1-7 | Admin views dashboard and learner profile | Stats accurate, all data in one view |
| G1-8 | Manager sees only their batch | 403 for other batches |
| G1-9 | Third device login kicks oldest session | Session limit = 2 enforced |
| G1-10 | Admin 2FA login | TOTP setup + verify works |

### Gate 2: Phase 2 Staging Review (After Sprint 14, ~Week 16)

| # | Test | Pass Criteria |
|---|------|---------------|
| G2-1 | Live session created → Zoom link → Outlook | Auto-creation works |
| G2-2 | Session reminder at 24h and 1h | Emails received in correct timezone |
| G2-3 | Attendance auto-imported from Zoom | Participant matching works |
| G2-4 | Final exam (50 questions, timed, shuffled) | Each attempt has different questions |
| G2-5 | Oral assessment scored by admin | Rubric, notes, pass/fail saved |
| G2-6 | Certificate eligible → pending → approved → PDF | End-to-end cert flow |
| G2-7 | Certificate public verification | `/verify/CERT-001` shows valid cert |
| G2-8 | Reports with Excel export | All 5 report types export correctly |
| G2-9 | Resource library (view-only) | Signed URLs, no download |

### Gate 3: Production Launch (After Sprint 18, ~Week 20)

| # | Test | Pass Criteria |
|---|------|---------------|
| G3-1 | Chat works (real-time, attachments, read receipts) | WebSocket + REST fallback |
| G3-2 | Progress sharing generates working link | Public preview + social sharing |
| G3-3 | Corporate registration + bulk enrolment | Company pays, individuals get logins |
| G3-4 | Performance: < 3s FCP on 3G mobile | Lighthouse ≥ 80 |
| G3-5 | Security: no exposed secrets, rate limiting active | Helmet, CORS, throttle verified |
| G3-6 | Stripe live mode processes real payments | Test with real card |
| G3-7 | DNS cutover complete | `whatboutme.com` serves new site |
| G3-8 | Backup tested: AWS RDS PITR restore | Data integrity verified |
| G3-9 | Admin trained and comfortable | Training session completed |
| G3-10 | All GoDaddy URLs redirect correctly | 301 redirects verified |

---

## 6. Risk Mitigation Schedule

| Risk (from PRD §21.1) | Mitigated In Sprint | How |
|----------------------|:-------------------:|-----|
| R1: SEO ranking drop | Sprint 1–2 | 301 redirects, carry over titles/meta, sitemap submission |
| R2: Stripe webhook delay | Sprint 3–4 | Idempotent handler, client polling fallback, "Processing" state |
| R3: Zoom API rate limits | Sprint 9–10 | BullMQ queue with sequential processing + 1s delay |
| R4: Video piracy | Sprint 5–6 | Mux signed URLs, domain restriction, moving watermark |
| R5: UAE PDPL compliance | Sprint 17–18 | Privacy policy, data deletion flow, retention policy |
| R6: AWS RDS cold connections | Sprint 0 | RDS Proxy handles connection pooling; ECS tasks pre-warmed |
| R7: PDF watermark timeout | Sprint 5–6 | Background job (BullMQ), not request-time |
| R8: Browser PDF viewer | Sprint 5–6 | Test react-pdf on Safari iOS, fallback "view in browser" |
| R9: Quiz double-submit | Sprint 5–6 | Idempotent handler, DB unique constraint |
| R10: Email deliverability | Sprint 1 | SPF/DKIM/DMARC setup, domain warm-up schedule |

---

## 7. PDF Requirement Traceability Matrix

Every requirement from the PDF mapped to the sprint where it's built:

| PDF Section | Requirement | Sprint | Status |
|-------------|-------------|:------:|:------:|
| Overview | Replace GoDaddy with Next.js | S1–2 | ⬜ |
| Overview | Custom LMS for 11 Steps to U | S5–6 | ⬜ |
| Overview | Full learner journey: discover → certificate | ALL | ⬜ |
| Overview | Admin runs everything without developer | S5–8 | ⬜ |
| Guiding | One login, role-determined view | S0 | ⬜ |
| Guiding | Content is view-only | S5–6 | ⬜ |
| Guiding | Every action leaves a record (audit) | S0 | ⬜ |
| Guiding | Admin changes without code | S5–6 | ⬜ |
| Guiding | Build modular | S0 | ⬜ |
| Tech | Next.js frontend | S0 | ⬜ |
| Tech | NestJS backend | S0 | ⬜ |
| Tech | AWS RDS PostgreSQL | S0 | ⬜ |
| Tech | Browser never talks to DB/Stripe/Zoom directly | S0 | ⬜ |
| Tech | Separate job worker | S0 | ⬜ |
| Tech | WebSockets for chat and notifications | S7–8, S15–16 | ⬜ |
| Tech | Webhook endpoints for Stripe, Zoom | S3–4, S9–10 | ⬜ |
| Tech | AWS RDS instances (dev/staging/prod) | S0 | ⬜ |
| Tech | Videos → secure streaming service | S5–6 | ⬜ |
| Tech | PDFs/audio → private signed links | S5–6 | ⬜ |
| Roles | 4 roles, server-checked every request | S0 | ⬜ |
| Roles | Single role per person | S0 | ⬜ |
| Roles | Named permissions, adjustable without code | S0 | ⬜ |
| Roles | Manager scoped to assigned batches | S7–8 | ⬜ |
| Roles | Audit log (who, what, when) | S0, S5–6 | ⬜ |
| Roles | Admin 2FA (email or authenticator) | S0 | ⬜ |
| §1 | Public website full rebuild | S1–2 | ⬜ |
| §1 | Home, About, 11 Steps, Vision Boards, Speaker, Let's Talk, Terms | S1–2 | ⬜ |
| §1 | Program pages pull data from admin panel | S1–2 | ⬜ |
| §1 | Enquiry form saves leads + emails team | S1–2 | ⬜ |
| §1 | Coaching disclaimer footer on every page | S1–2 | ⬜ |
| §1 | Social links, cookie consent, SEO, redirects | S1–2 | ⬜ |
| §2 | Sign up with email/password or one-time code | S0 | ⬜ |
| §2 | Stripe Checkout with coupons, multi-currency | S3–4 | ⬜ |
| §2 | Automatic numbered invoice, emailed and stored | S3–4 | ⬜ |
| §2 | Agreement signing (read, tick, name, signature) | S3–4 | ⬜ |
| §2 | Step 1 locked until agreement signed | S3–4 | ⬜ |
| §2 | Agreement templates versioned in admin | S3–4 | ⬜ |
| §3 | Batch per intake with name, program, start, capacity, manager | S7–8 | ⬜ |
| §3 | Auto or manual batch placement | S3–4, S7–8 | ⬜ |
| §3 | Move learner between batches without progress loss | S7–8 | ⬜ |
| §3 | Batch announcements, export | S7–8 | ⬜ |
| §4 | 11 steps with locked progression | S5–6 | ⬜ |
| §4 | Lesson completion tracking (video %, PDF opened) | S5–6 | ⬜ |
| §4 | Admin manual unlock/lock with logged reason | S5–6 | ⬜ |
| §4 | Roweena's Studio: upload, reorder, preview, publish/draft | S5–6 | ⬜ |
| §5 | Resource library by category, tagged by step | S13–14 | ⬜ |
| §5 | View-only, no download | S13–14 | ⬜ |
| §6 | Question bank tagged by step | S5–6 | ⬜ |
| §6 | Step quizzes: 10 questions, pass mark, retry + wait | S5–6 | ⬜ |
| §6 | Final exam: 50 shuffled questions, time limit | S11–12 | ⬜ |
| §6 | Oral assessment: rubric, notes, scored by admin | S11–12 | ⬜ |
| §7 | Schedule sessions, auto Zoom/Meet links | S9–10 | ⬜ |
| §7 | Outlook calendar sync (two-way) | S9–10 | ⬜ |
| §7 | Booking types with fixed durations | S9–10 | ⬜ |
| §7 | Learner books from available slots (timezone-aware) | S9–10 | ⬜ |
| §7 | Recordings auto-pulled or manually uploaded | S9–10 | ⬜ |
| §8 | Auto attendance from Zoom/Meet participant report | S11–12 | ⬜ |
| §8 | Match by email, review unmatched | S11–12 | ⬜ |
| §8 | Minimum attendance rule (e.g., 75%) | S11–12 | ⬜ |
| §8 | In-person QR check-in | S17–18 | ⬜ |
| §8 | Manual correction with logged reason | S11–12 | ⬜ |
| §9 | Learner dashboard (step, progress, CPD, sessions, quiz, invoices) | S7–8 | ⬜ |
| §9 | Progress sharing (public link/image, LinkedIn/WhatsApp) | S15–16 | ⬜ |
| §9 | Certificate verification page (public, by cert number) | S13–14 | ⬜ |
| §10 | Certificate issued when all requirements met | S11–12 (eligibility), S13–14 (generation) | ⬜ |
| §10 | Pending until admin approves | S13–14 | ⬜ |
| §10 | PDF with name, program, date, CPD hours, cert number | S13–14 | ⬜ |
| §10 | Corporate: certificate of participation (no CPD) | S17–18 | ⬜ |
| §11 | Private 1:1 chat (text, emoji, file, read receipts) | S15–16 | ⬜ |
| §11 | Staff shared inbox, assign, resolve | S15–16 | ⬜ |
| §11 | New message alert (in-app + email if unread) | S15–16 | ⬜ |
| §12 | Vision Board Workshop registration | S17–18 | ⬜ |
| §12 | Corporate workshop: company pays, participants get logins | S17–18 | ⬜ |
| §13 | Admin dashboard: active learners, revenue, enrolments, pending certs, unread chats | S7–8 | ⬜ |
| §13 | Learner profile: everything in one place | S7–8 | ⬜ |
| §13 | Reports with export (payments, attendance, quiz, progress, certificates) | S13–14 | ⬜ |
| Integrations | Stripe (checkout, coupons, invoices, refunds) | S3–4 | ⬜ |
| Integrations | Zoom/Meet (meetings, recordings, attendance) | S9–10 | ⬜ |
| Integrations | Outlook/Graph (calendar, availability) | S9–10 | ⬜ |
| Integrations | Email delivery service (SPF/DKIM) | S1 | ⬜ |
| Integrations | Secure video streaming (Mux) | S5–6 | ⬜ |
| Integrations | Object storage (R2) | S0 | ⬜ |
| Content Protection | Signed URLs (15 min expiry) | S5–6 | ⬜ |
| Content Protection | Video: moving watermark, no download, domain restriction | S5–6 | ⬜ |
| Content Protection | PDF: page-by-page viewer, watermark, no download | S5–6 | ⬜ |
| Content Protection | Session limit (2 devices) | S0 | ⬜ |
| Content Protection | Log unusual login activity | S0 | ⬜ |
| Notifications | All 19 notification types (see matrix) | S0 through S15 | ⬜ |
| Notifications | Editable templates in admin | S15–16 | ⬜ |
| Notifications | Timezone-aware sending | S7–8 | ⬜ |
| Notifications | Email delivery log | S17–18 | ⬜ |
| Notifications | Manual announcement to learner/batch/all | S17–18 | ⬜ |
| Notifications | Non-essential emails toggleable by learner | S7–8 | ⬜ |
| Non-Functional | Passwords hashed, login rate limits | S0 | ⬜ |
| Non-Functional | HTTPS only, secrets in env, input validation | S0, S17–18 | ⬜ |
| Non-Functional | Timezone: store UTC, display user's timezone | S0 | ⬜ |
| Non-Functional | Multi-currency (INR, AED, USD) | S3–4 | ⬜ |
| Non-Functional | Daily backups, PITR, test restore before go-live | S0 (AWS RDS), S17–18 (test) | ⬜ |
| Non-Functional | Error tracking, uptime checks, alerts | S0 (Sentry) | ⬜ |
| Non-Functional | Accessibility (readable fonts, captions, keyboard) | S1–2 (baseline), S17–18 (audit) | ⬜ |
| Non-Functional | Handover (code repo, setup guide, admin guide, training) | S17–18 | ⬜ |

---

## 4. Phase 4 — Production Infrastructure & Cloud Setup (Sprints 19–20)

> **Phase Goal:** Transition the local-first development environment to the robust AWS Enterprise Stack described in the architecture. This occurs ONLY after the frontend and backend are fully built and tested locally.

| # | Task | Details |
|---|------|---------|
| S19-1 | **Configure CI/CD pipeline** | GitHub Actions: lint → type-check → unit tests → build → deploy. Staging auto-deploy on `develop` branch, production on `main`. |
| S19-2 | **Set up AWS RDS** | Provision PostgreSQL instance in private VPC, configure security groups, apply Prisma migrations to production. |
| S19-3 | **Set up AWS ElastiCache** | Provision Redis cluster, configure VPC access for sessions and BullMQ in production. |
| S19-4 | **Set up AWS S3** | Create `whatboutme-storage` bucket, enable CORS, configure IAM policies for file uploads. |
| S19-5 | **Set up AWS ECS (Fargate)** | Create task definitions for API and Worker with Dockerfiles, configure load balancer. |
| S19-6 | **Set up AWS Amplify / CloudFront** | Connect frontend repos, configure global edge caching, environment variables. |
| S19-7 | **Set up Sentry** | Create frontend + backend projects, install SDKs, configure source maps for error tracking. |

---

> [!NOTE]
> This implementation plan is derived from the PRD and ARCHITECTURE documents. Every task traces back to a specific requirement from the original development plan PDF. The plan should be reviewed and approved before Sprint 0 begins.
