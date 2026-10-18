<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- baton:coordination -->
## Multi-agent coordination (Baton)

Baton coordinates the agent sessions in this repo via the `baton` MCP tools.

- Orient first: read this authoritative `AGENTS.md` and live codebase files.
- Before editing shared files: `check_files` with the paths. Busy → prefer other work and re-check later.
- While working: call `touch_files` when you start editing shared files and keep `report_progress` fresh.
- Learned a decision, gotcha, or convention? `save_memory` it (1–3 sentences + the files it is about).
- Near your usage/context limit, or blocked? `create_handoff` (done, pending, next step, decisions).
<!-- /baton:coordination -->

# WhatBoutMe LMS — Authoritative Master Specification (Single Source of Truth)

> **Document Version:** 2.0 (Audio-Verified Audit Copy)  
> **Source Documents:** `WhatBoutMe LMS Development Plan (1).pdf` & `Developer note.pdf`  
> **Status:** Canonical & Active. All legacy Markdown specs have been purged.

---

## 1. System Architecture & Tech Stack

The `WhatBoutMe.com` platform is organized as a Turborepo monorepo:

- **Public Marketing Website** (`apps/marketing`): Next.js App Router (port 3000) for course browsing, event registrations, public gallery, lead capture, and public certificate verification.
- **Learner Portal** (`apps/lms`): Next.js App Router (port 3003) for authenticated learners: onboarding, step unlocking, anti-skip video player, quizzes, final exams, 1-on-1 discovery & session bookings, notes, in-app bell notifications, and chat.
- **Admin & Studio Portal** (`apps/admin`): Next.js App Router (port 3002) for staff: course builder (11 steps), visual question bank, batch management, session attendance & reconciliation, manual overrides, lead conversion, certificate approvals, and revenue analytics.
- **Backend API Gateway & Core Engine** (`apps/api`): NestJS 12 (port 4000) REST & WebSocket API, modular domain architecture, BullMQ background job queues, Passport JWT authentication with refresh token rotation.
- **Database**: PostgreSQL (Neon Serverless) managed via Prisma ORM (`apps/api/prisma/schema.prisma`). All entities use UUID v4 primary keys.
- **Media & Storage Pipeline**: Private Object Storage for signed PDFs, audio, worksheets, and agreement scans; Secure Streaming Service (Cloudinary) for DRM-deterrent video with dynamic watermarking.

---

## 2. Server-Enforced RBAC (Role-Based Access Control)

Access control is strictly enforced on the NestJS backend for every API endpoint:

| Role | Scope | Permitted Capabilities |
|------|-------|------------------------|
| `SUPER_ADMIN` | Global (Full System) | Foxwel.AI & Roweena: Full administrative control, system config, staff role assignments, destructive operations, system audit logs, and bypass tools. |
| `ADMIN` | Global (Operations) | Roweena & senior staff: Programs & curriculum (11 steps), visual question bank, batches, pricing & coupons, certificate issue/approval, oral assessment grading, lead management, and revenue analytics. |
| `MANAGER` | Batch-Scoped | Batch managers / trainers: Can ONLY view and act upon batches explicitly assigned to them (`batch.managerId === user.id`). Attendance marking & reconciliation, session hosting, 1:1 chat with batch learners, and batch announcements. Restrained from modifying global program curriculum, pricing, or system settings. |
| `USER` | Self (Learner) | Dashboard, unlocked lessons/steps, video playback, quizzes, student notes & highlights, 15-min discovery & session bookings, chat with staff, personal invoices, and certificate sharing. Restrained by agreement gate and step lock progression. |

---

## 3. Mandatory Audit Logging

Every admin or manager mutation that alters a learner's progression or account state must create an immutable `AuditLog` row:
- **Logged Actions**: Unlocking a step (`STEP_UNLOCK_OVERRIDE`), overriding quiz or exam score (`QUIZ_OVERRIDE`), manual attendance marking or status reconciliation (`ATTENDANCE_OVERRIDE`), certificate approval or revocation (`CERTIFICATE_STATUS_CHANGE`), lead conversion (`LEAD_CONVERT`), and invoice/refund actions (`REFUND_ISSUED`).
- **Required Metadata**: `actorId` (who), `action` (what), `timestamp` (when), `targetUserId` / `enrolmentId`, and explicit `reason` string.

---

## 4. Payment Testing Mode (`TEST_BYPASS`)

- **Current Operational Mode**: Active `TEST_BYPASS` payment service.
- **Rule**: Do NOT use or require live Razorpay or Stripe production secret keys during development and staging verification.
- **Workflow**: All checkout flows (program enrolment, event ticketing, post-call payment links) simulate an immediate, verified server-to-server webhook transition (`PENDING` $\rightarrow$ `PAID` / `REGISTERED` / `PENDING_AGREEMENT`) allowing complete end-to-end testing of certificates, emails, invoices, and step progression.
- **Multi-Currency**: Supports `USD`, `AED`, and `INR` deterministically across checkout, invoices, and reporting.

---

## 5. The 14 Active Feature Mandates (v2.0 Audio-Verified)

### 1. Payment Abstraction Layer
- Unified interface for checkout: `TEST_BYPASS` active now.
- Modular architecture with clean adapter stubs for Razorpay (Phase 1) and Stripe (Phase 2).
- Deterministic webhook simulation with signature emulation for testing failure, retry, and success paths.

### 2. Multi-Currency Engine (`USD`, `AED`, `INR`)
- First-class multi-currency support across:
  - Course pricing and payment plan options (`USD`, `AED`, `INR`).
  - Event ticketing pricing.
  - Public checkout and payment bypass modals.
  - WhatBoutMe FZE automated PDF invoices (`apps/api/src/modules/invoices`).
  - Financial reports and revenue analytics (`apps/admin/app/revenue`).

### 3. Digital Workshop Consent & Dual-Mode E-Signature
- **Step 1 Pre-Condition**: Step 1 remains strictly locked until the learner signs the agreement post-payment.
- **Consent Gate**: Explicit workshop digital consent checkbox with immutable consent statement and timestamping.
- **Dual-Mode Signature**:
  1. *Draw Mode*: HTML5 Canvas smooth vector drawing with high-DPI scaling.
  2. *Upload Mode*: PNG/JPEG signature image upload with preview and validation.
- **Profile Persistence**: Option to save signature to learner profile (`savedSignature`) for 1-click re-signing in future enrollments.
- **Server Verification**: Backend merges signature, IP address, user-agent, and agreement template snapshot into an immutable PDF stored in private storage.

### 4. Compulsory Video Player (Content Protection & Anti-Cheat)
- **Controls**: Stripped-down playback controls. 10-second forward and backward skip buttons are permanently removed.
- **Scrub Bar Locked**: Seeking ahead beyond watched progress is blocked; timeline scrub bar is locked.
- **Moving Watermark**: Dynamic, moving canvas/DOM watermark displaying learner name and email to deter screen recording and leaks.
- **Server-Side Validation**: Lesson completion requires heartbeat or watched duration threshold verification before updating `UserLessonProgress`.

### 5. Configurable Quiz Placement
- Configured inside Admin Course Builder (`Step7QuizBuilder.tsx`).
- Allows instructors to set quiz execution timing per module/step:
  - `BEFORE_VIDEO` (Diagnostic / Pre-Assessment First).
  - `AFTER_VIDEO` (Comprehension / Post-Assessment Last).

### 6. Visual Question Bank (Google Forms Style)
- Reusable question bank management across multiple quizzes and exams.
- **Media Support**: Question prompts support direct PNG/JPEG image uploads.
- **Option Media**: Individual answer option cards support image attachments.
- **Dynamic Options**: Dynamic answer option count (default: 4 options, expandable).
- **3 Question Types**:
  1. `MULTIPLE_CHOICE` (Single correct option).
  2. `MULTI_SELECT` (Multiple checkboxes with partial/all-correct rules).
  3. `SHORT_ANSWER` (Text box with keyword / regex matching or manual grading).

### 7. Student Notes & Highlights
- **In-Lesson Note Taking**: Floating/sidebar note editor available during video and reading lessons.
- **Chronological "My Notes" Tab**: Dedicated learner portal view displaying:
  - Note and highlight text content.
  - Creation and update timestamps.
  - Associated Program, Step, and Lesson breadcrumbs with direct jump link.

### 8. Course-Specific FAQs
- Repeatable FAQ builder in Course Studio (`Step1CourseSetup.tsx`).
- Structured `question` and `answer` pairs stored with the Program entity.
- Rendered dynamically in an accessible accordion on the public course details page (`apps/marketing/src/app/courses/[slug]`).

### 9. Public Website Photo Gallery
- **Admin CMS**: Dedicated gallery manager at `apps/admin/app/website/page.tsx` for creating, ordering, and tagging photo items.
- **Public Showcase**: Responsive grid at `apps/marketing/src/app/gallery` featuring high-res imagery, captions, tags, and context descriptions.

### 10. Dynamic Events & Ticketing (GSB Style)
- **Two Location Modes**:
  - `ONLINE`: Meeting link remains private until payment is confirmed; automatically revealed in ticket and emailed.
  - `PHYSICAL`: Venue/Hall name, physical street address, and Google Maps pin link.
- **Pricing & Currency**: Dynamic ticket pricing in `USD`, `AED`, or `INR` (with Free RSVP support).
- **Simulated Checkout**: `Pay Now` test checkout with instant status confirmation and seat availability decrement.
- **Viral Sharing**: `Share Event Link` button with 1-click clipboard copy and social sharing dialogs.

### 11. Multi-Channel Notifications & Push
- Service worker implementation (`public/sw.js`) for browser Web Push notifications.
- In-app notification bell with unread badge counter and real-time WebSocket updates.
- Centralized `EmailDeliveryLog` tracking delivery status (`QUEUED` $\rightarrow$ `SENT` $\rightarrow$ `DELIVERED`).

### 12. "Let's Talk" Contact Us Flow
- **Privacy Rule**: Company mobile phone numbers are strictly removed from the public UI.
- **Lead Capture Form**: Name, Email, Phone number, and inquiry category toggle:
  - `General Inquiry`: Sent directly to staff inbox.
  - `Course Inquiry`: Dynamically reveals an active course dropdown selector.

### 13. 1-to-1 15-Minute Discovery Call Booking
- Triggered immediately upon submitting a `Course Inquiry`.
- Integrated with Roweena's unified availability calendar (preventing clashes with active batch workshops and coaching slots).
- Automatically generates a Zoom meeting link (utilizing developer S2S Zoom API keys in staging).

### 14. Post-Call Lead Conversion
- Admin Leads Management panel (`apps/admin/app/leads/page.tsx`).
- One-click `Convert & Send Payment Link` action.
- Automatically transitions lead status to `CONVERTED`, provisions a pending enrollment, and sends a pre-filled, personalized checkout link to the prospect via email.

---

## 6. Monorepo Map & Verified Directory Structure

```
WhatBoutMe.com/
├── apps/
│   ├── admin/             # Next.js 16 (Port 3002) - Staff & Instructor Admin Portal
│   │   ├── app/           # App Router pages (programs, batches, quizzes, leads, website, revenue)
│   │   │   ├── components/# Reusable UI (Modal, ConfirmDialog, InputDialog, CustomSelect, StatusBadge, Toast)
│   │   │   └── lib/       # api.ts (SWR cache, in-flight deduplication, autoInvalidate), timezone.ts
│   │   └── package.json
│   ├── api/               # NestJS 12 (Port 4000) - Core Backend API & Queues
│   │   ├── prisma/        # schema.prisma (Single source of truth for database models)
│   │   └── src/           # Modular services: auth, enrollments, programs, events, quizzes, etc.
│   ├── lms/               # Next.js 16 (Port 3003) - Learner Portal
│   │   └── app/           # Agreement signing, dashboard, anti-skip player, notes, exams
│   └── marketing/         # Next.js 16 (Port 3000) - Public Marketing Website
│       └── src/app/       # Landing, course catalog, event ticketing, gallery, contact us
├── packages/
│   ├── eslint-config/     # Shared ESLint configuration
│   └── typescript-config/ # Shared tsconfig bases
├── AGENTS.md              # THIS FILE: Root authoritative specification
└── package.json           # Turborepo root scripts (build, dev, lint, check-types)
```

---

## 7. Developer Execution Loop (Non-Negotiable)

1. **Ground Before Mutating**: Inspect real codebase files before writing or proposing code. Never invent non-existent packages, mock models, or unverified endpoints.
2. **Reuse Existing UI**: In `apps/admin`, always reuse existing UI components (`Modal`, `ConfirmDialog`, `InputDialog`, `CustomSelect`, `StatusBadge`, `Toast`, `ActionMenu`).
3. **Typecheck Rigor**: Ensure `turbo run check-types` and `apps/api` `npx tsc --noEmit` pass with **0 errors**.
4. **Timezone Awareness**: All database timestamps are UTC. Display formatting and wall-clock inputs must use `apps/admin/app/lib/timezone.ts`.
