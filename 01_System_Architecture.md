# WhatBoutMe LMS — Architecture Document

> **Version:** 1.1  
> **Date:** September 29, 2026  
> **Companion to:** [PRD.md](file:///c:/Users/lenovo/Desktop/whataboutme/PRD.md)  
> **Status:** Draft  

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Architecture Decision Records (ADRs)](#2-architecture-decision-records-adrs)
3. [Frontend Architecture (Next.js)](#3-frontend-architecture-nextjs)
4. [Backend Architecture (NestJS)](#4-backend-architecture-nestjs)
5. [Database Schema (PostgreSQL)](#5-database-schema-postgresql)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [API Design & Contracts](#7-api-design--contracts)
8. [Real-Time Architecture (WebSockets)](#8-real-time-architecture-websockets)
9. [Background Jobs & Queue System](#9-background-jobs--queue-system)
10. [Third-Party Integration Architecture](#10-third-party-integration-architecture)
11. [Content Protection Architecture](#11-content-protection-architecture)
12. [File Storage & Media Pipeline](#12-file-storage--media-pipeline)
13. [Data Flow Diagrams](#13-data-flow-diagrams)
14. [Security Architecture](#14-security-architecture)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)
16. [Monitoring & Observability](#16-monitoring--observability)
17. [Performance Strategy](#17-performance-strategy)
18. [Testing Strategy](#18-testing-strategy)
19. [Scalability Strategy](#19-scalability-strategy)
20. [Caching Strategy](#20-caching-strategy)
21. [Rate Limiting Configuration](#21-rate-limiting-configuration)
22. [Environment Variable Catalogue](#22-environment-variable-catalogue)
23. [Backup & Disaster Recovery](#23-backup--disaster-recovery)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
                        ┌─────────────────────────────────┐
                        │           CLIENTS                │
                        │  ┌─────────┐  ┌──────────────┐  │
                        │  │ Browser │  │ Mobile (PWA) │  │
                        │  └────┬────┘  └──────┬───────┘  │
                        └───────┼──────────────┼──────────┘
                                │              │
                        ┌───────▼──────────────▼──────────┐
                        │      CDN / Edge Network          │
                        │  (AWS CloudFront / Amplify)      │
                        └──────────────┬──────────────────┘
                                       │
                 ┌─────────────────────▼─────────────────────┐
                 │       TURBOREPO MONOREPO WORKSPACE         │
                 │                                            │
                 │  ┌──────────────────────────────────────┐  │
                 │  │             APPS (FRONTEND)          │  │
                 │  │                                      │  │
                 │  │  apps/lms         → Learner Portal   │  │
                 │  │  apps/marketing   → Public/Reg       │  │
                 │  │  apps/admin       → Admin Panel      │  │
                 │  └──────────────────┬───────────────────┘  │
                 │                     │                      │
                 │  ┌──────────────────▼───────────────────┐  │
                 │  │              APPS (API)              │  │
                 │  │                                      │  │
                 │  │  apps/api-gateway → NestJS Entry     │  │
                 │  └──────────────────┬───────────────────┘  │
                 │                     │                      │
                 │  ┌──────────────────▼───────────────────┐  │
                 │  │          PACKAGES (SHARED DOMAINS)   │  │
                 │  │                                      │  │
                 │  │  packages/core-lms                   │  │
                 │  │  packages/core-registration          │  │
                 │  │  packages/core-certification         │  │
                 │  │  packages/core-invoice               │  │
                 │  │  packages/shared (Types/UI)          │  │
                 │  └──────────────────────────────────────┘  │
                 └─────────────────────┬─────────────────────┘
                                       │
                  ┌────────────────────▼───────────────────────┐
                  │            INFRASTRUCTURE                  │
                  │  - AWS RDS (PostgreSQL Database)           │
                  │  - AWS ElastiCache (Redis Cache & Queues)  │
                  │  - AWS S3 (Object Storage for files)       │
                  │  - Mux (Specialized Video CDN)             │
                  └────────────────────────────────────────────┘
```

### 1.2 Communication Patterns

| Pattern | Used For | Technology |
|---------|----------|------------|
| **Request-Response** | All CRUD operations, queries | REST API (HTTPS) |
| **Real-time Push** | Chat messages, live notifications | WebSocket (Socket.IO) |
| **Webhooks (Inbound)** | Stripe payment events, Zoom recordings, Meet attendance | HTTPS POST with signature verification |
| **Async Jobs** | Emails, PDF generation, calendar sync, attendance import | BullMQ job queues (Redis-backed) |
| **Scheduled Jobs** | Daily summary, inactivity nudges, instalment reminders | BullMQ repeatable jobs (cron) |

---

## 2. Architecture Decision Records (ADRs)

ADRs document **why** key technology choices were made, what alternatives were considered, and what trade-offs were accepted. These are essential for onboarding new developers and avoiding repeated debates.

### ADR-001: Domain-Driven Modular Monorepo (Turborepo)

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Context** | The platform needs to be highly reusable and scalable. A standard monolith tightly couples domains (e.g., LMS logic with Marketing/Registration logic), making it hard to reuse certification or invoice logic across different potential frontend clients or services. |
| **Decision** | **Turborepo** workspace with strict domain separation. Frontend is split into distinct apps (`apps/lms`, `apps/marketing`, `apps/admin`). Backend logic is isolated into shared NestJS packages (`packages/core-lms`, `packages/core-registration`, `packages/core-certification`, `packages/core-invoice`) orchestrated by `apps/api-gateway`. |
| **Alternatives Considered** | |
| — Standard Monolith (Single Next.js + Single NestJS) | Easy to start, but becomes a "big ball of mud." Cannot deploy marketing site separately from LMS portal. Cannot reuse Invoice logic easily outside the main API. |
| — Full Microservices | Network latency between internal services, complex orchestration (Kubernetes/Kafka), overkill for a team of 2 developers. |
| **Consequences** | Excellent reusability. The `core-invoice` package can be imported anywhere. Marketing site (`apps/marketing`) can be deployed to the edge for maximum SEO speed without loading heavy LMS bundles. Requires strict discipline to avoid circular dependencies between `packages/*`. |

### ADR-002: AWS RDS (PostgreSQL)

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Context** | The platform needs a highly reliable, enterprise-grade PostgreSQL database with automated backups, scaling capabilities, and tight integration with the rest of our AWS infrastructure. |
| **Decision** | **AWS RDS for PostgreSQL**. |
| **Alternatives Considered** | |
| — Neon (Serverless) | Cost-effective for dev, but introduces vendor sprawl and lacks the deep VPC security integrations available when keeping everything inside the AWS ecosystem. |
| — Supabase | Provides auth and real-time out of the box, but we need custom auth and our own WebSocket gateway. Adds vendor lock-in outside AWS. |
| **Consequences** | AWS RDS requires VPC configuration and carries a fixed monthly baseline cost regardless of usage. However, it provides maximum reliability, Point-in-Time Recovery (PITR), and keeps data transfer (egress) costs between the API (AWS ECS) and the database at $0 since they share the same VPC. |

### ADR-003: Prisma ORM

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Context** | Need a type-safe database client for TypeScript, with migration management, seeding, and good DX for a team of 2-3 developers. |
| **Decision** | **Prisma** with `prisma-client-js` generator. |
| **Alternatives Considered** | |
| — Drizzle ORM | Lighter weight, SQL-like syntax, faster queries. But: less mature migration tooling, smaller community for edge-case debugging. |
| — TypeORM | More "traditional" ORM. Decorator-heavy, harder to debug. Historically has had issues with migrations in production. |
| — Raw SQL + Kysely | Maximum control but no migration management. Too low-level for rapid development with 18 modules. |
| **Consequences** | Prisma's query engine adds ~5ms overhead per query (acceptable). Schema file is single-file which can become large (mitigated with clear section comments). No raw SQL for complex reports — may need `$queryRaw` for advanced aggregation queries. |

### ADR-004: BullMQ for Background Jobs

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Context** | Need async job processing for: email sending, PDF generation (certificates, invoices), calendar sync, attendance import, session reminders, and watermarking. Must support scheduled/repeatable jobs (cron). |
| **Decision** | **BullMQ** backed by AWS ElastiCache (Redis). |
| **Alternatives Considered** | |
| — Agenda.js (MongoDB-backed) | Requires a separate MongoDB instance. Our stack is PostgreSQL + Redis. Adding MongoDB is unnecessary complexity. |
| — pg-boss (PostgreSQL-backed) | Eliminates Redis dependency but adds load to the primary database. Job polling queries compete with application queries. |
| — AWS SQS + Lambda | Fully serverless and scalable but cold starts affect job latency. BullMQ gives more developer control and simpler local development. |
| **Consequences** | Requires AWS ElastiCache (Redis). Redis is also used for caching and session storage, so no additional infrastructure cost. BullMQ has excellent NestJS integration (`@nestjs/bullmq`). |
| **Real-world edge case** | If Redis goes down, all jobs are queued in memory and replayed on reconnect. ElastiCache provides Multi-AZ replication for 99.99% uptime. For critical jobs (payment confirmation), the webhook handler also writes directly to the database as a fallback. |

### ADR-005: Monorepo with Shared Types

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Context** | Frontend (Next.js) and backend (NestJS) both use TypeScript. API response types, enums, and DTOs must stay in sync. Developer changes a DTO on the backend but forgets to update the frontend → runtime type errors in production. |
| **Decision** | **Turborepo monorepo** with three packages: `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared` (types, enums, constants). |
| **Alternatives Considered** | |
| — Separate repos + npm package | Publishing a shared npm package for every type change adds friction. Version mismatches between repos cause subtle bugs. |
| — Separate repos + copy-paste types | No enforcement. Types drift within days. |
| — Nx monorepo | More powerful but heavier setup. Turborepo is simpler for 2-3 developers. |
| **Consequences** | Single `git clone` for everything. Shared types are imported directly: `import { UserRole } from '@whatboutme/shared'`. CI/CD must build both apps. Turborepo's caching speeds up builds. |

---

## 3. Frontend Architecture (Next.js)

### 2.1 Project Structure

```
whatboutme-web/
├── public/
│   ├── images/               # Static images, logos
│   ├── fonts/                # Custom fonts
│   └── favicon.ico
│
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (public)/         # Public website (SSR)
│   │   │   ├── page.tsx              # Home
│   │   │   ├── about/page.tsx        # About Me
│   │   │   ├── programs/
│   │   │   │   ├── [slug]/page.tsx   # Dynamic program page
│   │   │   │   └── page.tsx          # Programs listing
│   │   │   ├── vision-boards/page.tsx
│   │   │   ├── speaker/page.tsx
│   │   │   ├── contact/page.tsx      # Let's Talk
│   │   │   ├── terms/page.tsx
│   │   │   ├── privacy/page.tsx
│   │   │   └── verify/[certNumber]/page.tsx  # Public cert verification
│   │   │
│   │   ├── (auth)/           # Auth pages (no nav)
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   │
│   │   ├── (portal)/         # Learner portal (auth required)
│   │   │   ├── layout.tsx            # Portal layout with sidebar
│   │   │   ├── dashboard/page.tsx    # Learner dashboard
│   │   │   ├── programs/
│   │   │   │   └── [programId]/
│   │   │   │       ├── page.tsx          # Program overview
│   │   │   │       └── steps/
│   │   │   │           └── [stepId]/
│   │   │   │               ├── page.tsx          # Step content
│   │   │   │               └── quiz/page.tsx     # Step quiz
│   │   │   ├── exam/page.tsx         # Final written exam
│   │   │   ├── sessions/page.tsx     # My sessions
│   │   │   ├── booking/page.tsx      # Book a session
│   │   │   ├── chat/page.tsx         # Chat with team
│   │   │   ├── invoices/page.tsx     # My invoices
│   │   │   ├── agreement/page.tsx    # Sign agreement
│   │   │   ├── certificates/page.tsx # My certificates
│   │   │   ├── resources/page.tsx    # Resource library
│   │   │   ├── share/page.tsx        # Progress sharing
│   │   │   └── settings/page.tsx     # Profile settings
│   │   │
│   │   ├── (admin)/          # Admin panel (admin/super-admin only)
│   │   │   ├── layout.tsx            # Admin layout with sidebar
│   │   │   ├── dashboard/page.tsx    # Admin dashboard
│   │   │   ├── programs/
│   │   │   │   ├── page.tsx          # Program list
│   │   │   │   ├── new/page.tsx      # Create program
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Edit program
│   │   │   │       └── studio/page.tsx  # Roweena's Studio
│   │   │   ├── batches/
│   │   │   │   ├── page.tsx          # Batch list
│   │   │   │   └── [id]/page.tsx     # Batch detail
│   │   │   ├── learners/
│   │   │   │   ├── page.tsx          # Learner list
│   │   │   │   └── [id]/page.tsx     # Learner profile
│   │   │   ├── question-bank/page.tsx
│   │   │   ├── sessions/page.tsx
│   │   │   ├── attendance/page.tsx
│   │   │   ├── payments/page.tsx
│   │   │   ├── invoices/page.tsx
│   │   │   ├── certificates/page.tsx
│   │   │   ├── agreements/page.tsx
│   │   │   ├── chat/page.tsx         # Shared inbox
│   │   │   ├── leads/page.tsx        # Enquiry leads
│   │   │   ├── coupons/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── notifications/page.tsx
│   │   │   ├── audit-log/page.tsx    # Super Admin only
│   │   │   └── settings/
│   │   │       ├── page.tsx          # General settings
│   │   │       ├── invoice/page.tsx  # Invoice settings
│   │   │       ├── integrations/page.tsx  # API keys
│   │   │       └── templates/page.tsx     # Cert/agreement templates
│   │   │
│   │   ├── api/              # Next.js API routes (proxy if needed)
│   │   │   └── proxy/[...path]/route.ts
│   │   │
│   │   ├── layout.tsx        # Root layout
│   │   ├── not-found.tsx     # 404 page
│   │   └── error.tsx         # Error boundary
│   │
│   ├── components/           # Shared React components
│   │   ├── ui/               # Base UI components (Button, Input, Modal, etc.)
│   │   ├── layout/           # Header, Footer, Sidebar, etc.
│   │   ├── forms/            # Form components
│   │   ├── data-display/     # Tables, Cards, Charts
│   │   ├── media/            # Video player, PDF viewer, Audio player
│   │   ├── chat/             # Chat components
│   │   └── shared/           # Shared utility components
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useSocket.ts
│   │   ├── useProgram.ts
│   │   └── ...
│   │
│   ├── lib/                  # Utilities and helpers
│   │   ├── api-client.ts     # Axios/fetch wrapper with auth
│   │   ├── socket-client.ts  # Socket.IO client
│   │   ├── validators.ts     # Form validation (Zod schemas)
│   │   ├── formatters.ts     # Date, currency, timezone formatters
│   │   └── constants.ts      # App-wide constants
│   │
│   ├── stores/               # Client-side state (Zustand or Context)
│   │   ├── auth-store.ts
│   │   ├── notification-store.ts
│   │   └── chat-store.ts
│   │
│   ├── styles/               # Global styles
│   │   ├── globals.css
│   │   ├── variables.css     # CSS custom properties / design tokens
│   │   └── components/       # Component-specific styles (CSS Modules)
│   │
│   ├── types/                # TypeScript type definitions
│   │   ├── api.ts            # API response types
│   │   ├── models.ts         # Domain model types
│   │   └── enums.ts          # Shared enums
│   │
│   └── middleware.ts         # Next.js middleware (auth redirect, role check)
│
├── next.config.js
├── tsconfig.json
├── package.json
└── .env.local
```

### 2.2 Rendering Strategy

| Route Group | Rendering | Caching | Auth |
|-------------|-----------|---------|------|
| `(public)/*` | **SSR** (Server Components) | ISR with revalidation (program data refreshes every 60s) | None |
| `(auth)/*` | **CSR** (Client Components) | No cache | None (redirect if logged in) |
| `(portal)/*` | **CSR** (Client Components) | SWR for data fetching | JWT required (Learner+) |
| `(admin)/*` | **CSR** (Client Components) | SWR for data fetching | JWT required (Admin+ / Manager scoped) |

### 2.3 State Management

| Concern | Solution |
|---------|----------|
| Server state (API data) | **SWR** or **TanStack Query** with automatic revalidation |
| Auth state | **Zustand** store + HTTP-only cookies for JWT |
| Real-time state (chat, notifications) | **Zustand** store updated via Socket.IO events |
| Form state | **React Hook Form** + **Zod** for validation |
| URL state (filters, pagination) | **Next.js searchParams** |

### 2.4 Key Frontend Libraries

| Library | Purpose |
|---------|---------|
| `swr` or `@tanstack/react-query` | Data fetching and caching |
| `react-hook-form` + `zod` | Form handling and validation |
| `zustand` | Lightweight global state |
| `socket.io-client` | WebSocket client for chat and notifications |
| `date-fns` + `date-fns-tz` | Date formatting with timezone support |
| `react-dnd` | Drag-and-drop for Roweena's Studio |
| `signature_pad` | Drawing signatures for agreement signing |
| `react-pdf` | PDF viewer (page-by-page, no download) |
| `hls.js` | Video streaming with HLS protocol |
| `recharts` | Admin dashboard charts |
| `xlsx` or `exceljs` | Client-side Excel export (or server-side) |

---

## 3. Backend Architecture (NestJS)

### 3.1 Project Structure

```
whatboutme-api/
├── src/
│   ├── main.ts                    # Entry point
│   ├── app.module.ts              # Root module
│   │
│   ├── common/                    # Shared utilities
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts         # @Roles('admin', 'super_admin')
│   │   │   ├── current-user.decorator.ts  # @CurrentUser()
│   │   │   └── public.decorator.ts        # @Public() to skip auth
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts          # Validates JWT
│   │   │   ├── roles.guard.ts             # Checks role permissions
│   │   │   ├── throttle.guard.ts          # Rate limiting
│   │   │   └── batch-access.guard.ts      # Manager batch scoping
│   │   ├── interceptors/
│   │   │   ├── audit-log.interceptor.ts   # Auto-logs admin actions
│   │   │   ├── transform.interceptor.ts   # Response transformation
│   │   │   └── timeout.interceptor.ts     # Request timeout
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts   # Global error handler
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts         # DTO validation
│   │   ├── dto/
│   │   │   └── pagination.dto.ts          # Shared pagination DTO
│   │   └── utils/
│   │       ├── timezone.util.ts           # UTC conversion helpers
│   │       ├── currency.util.ts           # Currency formatting
│   │       └── signed-url.util.ts         # Generate signed URLs
│   │
│   ├── config/                    # Configuration
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── stripe.config.ts
│   │   ├── zoom.config.ts
│   │   ├── outlook.config.ts
│   │   ├── storage.config.ts
│   │   ├── email.config.ts
│   │   └── video.config.ts
│   │
│   ├── modules/                   # Feature modules
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── local.strategy.ts
│   │   │   ├── dto/
│   │   │   │   ├── signup.dto.ts
│   │   │   │   ├── login.dto.ts
│   │   │   │   └── verify-2fa.dto.ts
│   │   │   └── auth.service.spec.ts
│   │   │
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── programs/
│   │   │   ├── programs.module.ts
│   │   │   ├── programs.controller.ts
│   │   │   ├── programs.service.ts
│   │   │   ├── steps.controller.ts
│   │   │   ├── steps.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── batches/
│   │   │   ├── batches.module.ts
│   │   │   ├── batches.controller.ts
│   │   │   ├── batches.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── content/
│   │   │   ├── content.module.ts
│   │   │   ├── lessons.controller.ts
│   │   │   ├── lessons.service.ts
│   │   │   ├── resources.controller.ts
│   │   │   ├── resources.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── quizzes/
│   │   │   ├── quizzes.module.ts
│   │   │   ├── quizzes.controller.ts
│   │   │   ├── quizzes.service.ts
│   │   │   ├── questions.controller.ts
│   │   │   ├── questions.service.ts
│   │   │   ├── attempts.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── exams/
│   │   │   ├── exams.module.ts
│   │   │   ├── exams.controller.ts
│   │   │   ├── exams.service.ts
│   │   │   ├── oral-assessment.controller.ts
│   │   │   └── dto/
│   │   │
│   │   ├── sessions/
│   │   │   ├── sessions.module.ts
│   │   │   ├── sessions.controller.ts
│   │   │   ├── sessions.service.ts
│   │   │   ├── booking.controller.ts
│   │   │   ├── booking.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── attendance/
│   │   │   ├── attendance.module.ts
│   │   │   ├── attendance.controller.ts
│   │   │   ├── attendance.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── payments/
│   │   │   ├── payments.module.ts
│   │   │   ├── payments.controller.ts
│   │   │   ├── payments.service.ts
│   │   │   ├── invoices.controller.ts
│   │   │   ├── invoices.service.ts
│   │   │   ├── coupons.controller.ts
│   │   │   ├── coupons.service.ts
│   │   │   ├── stripe-webhook.controller.ts
│   │   │   └── dto/
│   │   │
│   │   ├── agreements/
│   │   │   ├── agreements.module.ts
│   │   │   ├── agreements.controller.ts
│   │   │   ├── agreements.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── chat/
│   │   │   ├── chat.module.ts
│   │   │   ├── chat.gateway.ts        # WebSocket gateway
│   │   │   ├── chat.service.ts
│   │   │   ├── conversations.controller.ts
│   │   │   └── dto/
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts
│   │   │   ├── email.service.ts
│   │   │   ├── templates/             # Email templates (Handlebars/MJML)
│   │   │   └── dto/
│   │   │
│   │   ├── certificates/
│   │   │   ├── certificates.module.ts
│   │   │   ├── certificates.controller.ts
│   │   │   ├── certificates.service.ts
│   │   │   ├── pdf-generator.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── reports/
│   │   │   ├── reports.module.ts
│   │   │   ├── reports.controller.ts
│   │   │   ├── reports.service.ts
│   │   │   └── export.service.ts      # Excel/CSV export
│   │   │
│   │   ├── audit/
│   │   │   ├── audit.module.ts
│   │   │   ├── audit.controller.ts
│   │   │   └── audit.service.ts
│   │   │
│   │   ├── leads/
│   │   │   ├── leads.module.ts
│   │   │   ├── leads.controller.ts
│   │   │   └── leads.service.ts
│   │   │
│   │   ├── calendar/
│   │   │   ├── calendar.module.ts
│   │   │   ├── calendar.service.ts    # MS Graph integration
│   │   │   └── outlook-sync.service.ts
│   │   │
│   │   └── storage/
│   │       ├── storage.module.ts
│   │       ├── storage.controller.ts
│   │       ├── storage.service.ts
│   │       └── watermark.service.ts
│   │
│   ├── jobs/                      # Background job processors
│   │   ├── email.processor.ts
│   │   ├── notification.processor.ts
│   │   ├── calendar-sync.processor.ts
│   │   ├── attendance-import.processor.ts
│   │   ├── certificate-gen.processor.ts
│   │   ├── invoice-gen.processor.ts
│   │   ├── watermark.processor.ts
│   │   ├── reminder.processor.ts
│   │   └── cleanup.processor.ts
│   │
│   ├── integrations/              # Third-party service wrappers
│   │   ├── stripe/
│   │   │   ├── stripe.module.ts
│   │   │   └── stripe.service.ts
│   │   ├── meeting-provider/
│   │   │   ├── meeting-provider.module.ts
│   │   │   ├── meeting-provider.interface.ts   # Abstraction layer
│   │   │   ├── zoom.provider.ts
│   │   │   └── google-meet.provider.ts
│   │   ├── microsoft-graph/
│   │   │   ├── ms-graph.module.ts
│   │   │   └── ms-graph.service.ts
│   │   ├── email/
│   │   │   ├── email.module.ts
│   │   │   └── email.service.ts       # SendGrid/Resend/SES wrapper
│   │   ├── video/
│   │   │   ├── video.module.ts
│   │   │   └── video.service.ts       # Mux/Bunny/Cloudflare wrapper
│   │   └── storage/
│   │       ├── storage.module.ts
│   │       └── s3.service.ts          # S3-compatible storage
│   │
│   └── prisma/                    # Database
│       ├── schema.prisma
│       ├── migrations/
│       ├── seed.ts
│       └── prisma.service.ts
│
├── test/                          # E2E tests
│   ├── auth.e2e-spec.ts
│   ├── programs.e2e-spec.ts
│   └── ...
│
├── nest-cli.json
├── tsconfig.json
├── package.json
├── Dockerfile
├── docker-compose.yml             # Local dev (Redis, etc.)
└── .env
```

### 3.2 Module Dependency Graph

```mermaid
graph TD
    APP["AppModule"] --> AUTH["AuthModule"]
    APP --> USERS["UsersModule"]
    APP --> PROGRAMS["ProgramsModule"]
    APP --> BATCHES["BatchesModule"]
    APP --> CONTENT["ContentModule"]
    APP --> QUIZZES["QuizzesModule"]
    APP --> EXAMS["ExamsModule"]
    APP --> SESSIONS["SessionsModule"]
    APP --> ATTENDANCE["AttendanceModule"]
    APP --> PAYMENTS["PaymentsModule"]
    APP --> AGREEMENTS["AgreementsModule"]
    APP --> CHAT["ChatModule"]
    APP --> NOTIFICATIONS["NotificationsModule"]
    APP --> CERTS["CertificatesModule"]
    APP --> REPORTS["ReportsModule"]
    APP --> AUDIT["AuditModule"]
    APP --> LEADS["LeadsModule"]
    APP --> CALENDAR["CalendarModule"]
    APP --> STORAGE["StorageModule"]

    AUTH --> USERS
    BATCHES --> PROGRAMS
    CONTENT --> PROGRAMS
    CONTENT --> STORAGE
    QUIZZES --> PROGRAMS
    EXAMS --> QUIZZES
    SESSIONS --> BATCHES
    SESSIONS --> CALENDAR
    ATTENDANCE --> SESSIONS
    PAYMENTS --> USERS
    AGREEMENTS --> USERS
    CHAT --> USERS
    CHAT --> NOTIFICATIONS
    CERTS --> BATCHES
    CERTS --> QUIZZES
    CERTS --> ATTENDANCE
    REPORTS --> PAYMENTS
    REPORTS --> BATCHES
    REPORTS --> ATTENDANCE
```

### 3.3 Request Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Middleware
    participant G as Guard
    participant P as Pipe
    participant I as Interceptor
    participant Ctrl as Controller
    participant Svc as Service
    participant DB as Database

    C->>M: HTTP Request
    M->>M: CORS, Compression, Helmet
    M->>G: JWT Auth Guard
    G->>G: Validate token, extract user
    G->>G: Roles Guard (check permissions)
    G->>G: Batch Access Guard (if Manager)
    G->>P: Validation Pipe
    P->>P: Validate DTO with class-validator
    P->>I: Audit Log Interceptor (before)
    I->>Ctrl: Route to Controller
    Ctrl->>Svc: Call Service method
    Svc->>DB: Prisma query
    DB-->>Svc: Result
    Svc-->>Ctrl: Processed data
    Ctrl-->>I: Response
    I->>I: Audit Log Interceptor (after - log action)
    I->>I: Transform Interceptor (format response)
    I-->>C: HTTP Response
```

---

## 4. Database Schema (PostgreSQL)

### 4.1 Core Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// ENUMS
// ============================================

enum UserRole {
  SUPER_ADMIN
  ADMIN
  MANAGER
  LEARNER
}

enum UserStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  DELETED
}

enum ProgramCategory {
  CERTIFICATION
  WORKSHOP
  CORPORATE
}

enum DeliveryMode {
  ONLINE
  IN_PERSON
  HYBRID
}

enum BatchStatus {
  OPEN
  IN_PROGRESS
  CLOSED
  ARCHIVED
}

enum EnrolmentStatus {
  PENDING_PAYMENT
  PENDING_AGREEMENT
  ACTIVE
  COMPLETED
  SUSPENDED
  CANCELLED
  WAITLISTED
}

enum LessonType {
  VIDEO
  PDF
  AUDIO
  TEXT
}

enum CompletionState {
  NOT_STARTED
  IN_PROGRESS
  COMPLETE
}

enum SessionType {
  WELCOME_CALL
  CLOSING_CALL
  ONE_ON_ONE
  BATCH_CLASS
  VISION_BOARD_ONLINE
  VISION_BOARD_IN_PERSON
  SPEAKER_DISCOVERY
}

enum AttendanceSource {
  AUTO_ZOOM
  AUTO_MEET
  MANUAL
  QR_CHECKIN
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum PaymentMethod {
  STRIPE
  BANK_TRANSFER
  CASH
  COMPLIMENTARY
}

enum InvoiceStatus {
  DRAFT
  ISSUED
  PAID
  CANCELLED
  REFUNDED
}

enum AgreementStatus {
  PENDING
  SIGNED
}

enum CertificateStatus {
  PENDING
  APPROVED
  REVOKED
}

enum CertificateType {
  CERTIFICATION
  PARTICIPATION
}

enum ConversationStatus {
  OPEN
  RESOLVED
}

enum NotificationChannel {
  EMAIL
  IN_APP
  BOTH
}

enum DeliveryStatus {
  QUEUED
  SENT
  DELIVERED
  BOUNCED
  FAILED
}

enum LeadStatus {
  NEW
  CONTACTED
  CONVERTED
  CLOSED
}

enum CouponType {
  PERCENTAGE
  FIXED
}

// ============================================
// MODELS
// ============================================

model User {
  id                String         @id @default(cuid())
  email             String         @unique
  passwordHash      String?
  name              String
  phone             String?
  country           String?
  timezone          String         @default("UTC")
  role              UserRole       @default(LEARNER)
  status            UserStatus     @default(PENDING_VERIFICATION)
  avatarUrl         String?
  emailVerified     Boolean        @default(false)
  twoFactorEnabled  Boolean        @default(false)
  twoFactorSecret   String?
  notificationPrefs Json?          // { email_step_unlock: true, ... }
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  // Relations
  enrolments        Enrolment[]
  payments          Payment[]
  agreements        Agreement[]
  attendances       Attendance[]
  sentMessages      Message[]      @relation("sender")
  notifications     Notification[]
  sessions          Session[]      @relation("host")
  managedBatches    Batch[]        @relation("manager")
  auditLogsActed    AuditLog[]     @relation("actor")
  activeSessions    UserSession[]
  conversationParts ConversationParticipant[]

  @@index([email])
  @@index([role])
}

model UserSession {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  deviceInfo  String?
  ipAddress   String?
  country     String?
  lastActiveAt DateTime @default(now())
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  @@index([userId])
}

model Program {
  id                String          @id @default(cuid())
  name              String
  slug              String          @unique
  shortDescription  String
  longDescription   String
  coverImageUrl     String?
  category          ProgramCategory
  deliveryMode      DeliveryMode
  duration          String?
  cpdHours          Float?
  language          String          @default("en")
  isPublished       Boolean         @default(false)
  isArchived        Boolean         @default(false)

  // Feature toggles
  hasQuizzes        Boolean         @default(true)
  hasFinalExam      Boolean         @default(true)
  hasOralAssessment Boolean         @default(false)
  hasAttendanceReq  Boolean         @default(true)
  hasAgreement      Boolean         @default(true)
  certificateType   CertificateType @default(CERTIFICATION)
  stepUnlockEnabled Boolean         @default(true)

  // Pricing
  priceINR          Float?
  priceAED          Float?
  priceUSD          Float?
  earlyBirdPriceINR Float?
  earlyBirdPriceAED Float?
  earlyBirdPriceUSD Float?
  earlyBirdEndDate  DateTime?

  // Templates
  certificateTemplateId String?
  agreementTemplateId   String?

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  // Relations
  steps             Step[]
  batches           Batch[]
  coupons           Coupon[]
  registrationFields RegistrationField[]

  @@index([slug])
  @@index([isPublished])
}

model Step {
  id            String    @id @default(cuid())
  programId     String
  program       Program   @relation(fields: [programId], references: [id])
  title         String
  description   String?
  order         Int
  cpdHours      Float?
  unlockRule    String?   // "previous_complete" | "date_based" | "manual"
  unlockDate    DateTime? // For date-based unlock per batch
  isPublished   Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  lessons       Lesson[]
  quiz          Quiz?
  resourceTags  Resource[]

  @@unique([programId, order])
  @@index([programId])
}

model Lesson {
  id               String        @id @default(cuid())
  stepId           String
  step             Step          @relation(fields: [stepId], references: [id])
  title            String
  type             LessonType
  fileUrl          String?       // Signed URL generated on access
  fileKey          String?       // Storage key for the file
  videoPlaybackId  String?       // Mux/video service ID
  duration         Int?          // Duration in seconds
  order            Int
  completionRule   String?       // e.g., "watch_80_pct", "open", "play_80_pct", "mark_read"
  isPublished      Boolean       @default(false)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  // Relations
  completions      LessonCompletion[]

  @@unique([stepId, order])
  @@index([stepId])
}

model LessonCompletion {
  id              String          @id @default(cuid())
  lessonId        String
  lesson          Lesson          @relation(fields: [lessonId], references: [id])
  enrolmentId     String
  enrolment       Enrolment       @relation(fields: [enrolmentId], references: [id])
  state           CompletionState @default(NOT_STARTED)
  progressPct     Float           @default(0)
  completedAt     DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([lessonId, enrolmentId])
  @@index([enrolmentId])
}

model Batch {
  id            String      @id @default(cuid())
  programId     String
  program       Program     @relation(fields: [programId], references: [id])
  name          String
  startDate     DateTime
  endDate       DateTime?
  capacity      Int
  status        BatchStatus @default(OPEN)
  managerId     String?
  manager       User?       @relation("manager", fields: [managerId], references: [id])
  schedule      Json?       // Weekly schedule template
  priceOverride Json?       // { inr: 9999, aed: 499, usd: 139 }
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  // Relations
  enrolments    Enrolment[]
  sessions      Session[]
  announcements Announcement[]

  @@index([programId])
  @@index([managerId])
  @@index([status])
}

model Enrolment {
  id              String          @id @default(cuid())
  userId          String
  user            User            @relation(fields: [userId], references: [id])
  batchId         String
  batch           Batch           @relation(fields: [batchId], references: [id])
  status          EnrolmentStatus @default(PENDING_PAYMENT)
  progressPct     Float           @default(0)
  currentStepOrder Int            @default(1)
  cpdHoursEarned  Float           @default(0)
  waitlistPosition Int?
  enrolledAt      DateTime?
  completedAt     DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  attempts        Attempt[]
  payments        Payment[]
  invoices        Invoice[]
  agreement       Agreement?
  certificate     Certificate?
  lessonCompletions LessonCompletion[]

  @@unique([userId, batchId])
  @@index([userId])
  @@index([batchId])
  @@index([status])
}

model Quiz {
  id              String    @id @default(cuid())
  stepId          String    @unique
  step            Step      @relation(fields: [stepId], references: [id])
  passMark        Float     @default(70) // Percentage
  retryLimit      Int       @default(3)
  retryWaitHours  Int       @default(24)
  questionCount   Int       @default(10)
  timeLimitMins   Int?      // null = no time limit
  isFinalExam     Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  questions       QuizQuestion[]
  attempts        Attempt[]
}

model Question {
  id              String    @id @default(cuid())
  text            String
  options         Json      // ["Option A", "Option B", "Option C", "Option D"]
  correctAnswer   Int       // Index of correct option
  type            String    @default("MCQ") // MCQ, TRUE_FALSE, etc.
  stepTags        String[]  // Tags linking to step IDs
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  quizQuestions   QuizQuestion[]
}

model QuizQuestion {
  quizId     String
  quiz       Quiz     @relation(fields: [quizId], references: [id])
  questionId String
  question   Question @relation(fields: [questionId], references: [id])

  @@id([quizId, questionId])
}

model Attempt {
  id              String    @id @default(cuid())
  enrolmentId     String
  enrolment       Enrolment @relation(fields: [enrolmentId], references: [id])
  quizId          String
  quiz            Quiz      @relation(fields: [quizId], references: [id])
  questionsShown  Json      // Array of question IDs
  answers         Json      // { questionId: selectedOptionIndex }
  score           Float
  passed          Boolean
  startedAt       DateTime  @default(now())
  finishedAt      DateTime?
  timedOut        Boolean   @default(false)

  @@index([enrolmentId])
  @@index([quizId])
}

model Session {
  id              String      @id @default(cuid())
  type            SessionType
  title           String
  batchId         String?
  batch           Batch?      @relation(fields: [batchId], references: [id])
  hostId          String
  host            User        @relation("host", fields: [hostId], references: [id])
  scheduledAt     DateTime
  duration        Int         // Duration in minutes
  meetingLink     String?
  meetingId       String?     // Zoom/Meet meeting ID
  recordingUrl    String?
  agenda          String?
  materials       Json?       // Array of material links
  calendarEventId String?     // Outlook calendar event ID
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  attendances     Attendance[]
  bookings        SessionBooking[]

  @@index([batchId])
  @@index([hostId])
  @@index([scheduledAt])
}

model SessionBooking {
  id              String    @id @default(cuid())
  sessionId       String
  session         Session   @relation(fields: [sessionId], references: [id])
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  status          String    @default("confirmed") // confirmed, cancelled, rescheduled
  bookedAt        DateTime  @default(now())
  cancelledAt     DateTime?
  cancelReason    String?

  @@unique([sessionId, userId])
  @@index([userId])
}

model Attendance {
  id              String           @id @default(cuid())
  sessionId       String
  session         Session          @relation(fields: [sessionId], references: [id])
  userId          String
  user            User             @relation(fields: [userId], references: [id])
  joinTime        DateTime?
  leaveTime       DateTime?
  minutesPresent  Int              @default(0)
  isPresent       Boolean          @default(false)
  source          AttendanceSource @default(MANUAL)
  manualReason    String?          // Reason if manually corrected
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@unique([sessionId, userId])
  @@index([sessionId])
  @@index([userId])
}

model Payment {
  id                String        @id @default(cuid())
  userId            String
  user              User          @relation(fields: [userId], references: [id])
  enrolmentId       String?
  enrolment         Enrolment?    @relation(fields: [enrolmentId], references: [id])
  stripePaymentId   String?       @unique
  stripeSessionId   String?       @unique
  amount            Float
  currency          String        // INR, AED, USD
  method            PaymentMethod @default(STRIPE)
  status            PaymentStatus @default(PENDING)
  couponId          String?
  coupon            Coupon?       @relation(fields: [couponId], references: [id])
  refundAmount      Float?
  refundedAt        DateTime?
  instalmentNumber  Int?          // null = full payment
  totalInstalments  Int?
  paidAt            DateTime?
  createdAt         DateTime      @default(now())

  // Relations
  invoice           Invoice?

  @@index([userId])
  @@index([status])
}

model Invoice {
  id              String        @id @default(cuid())
  invoiceNumber   String        @unique
  paymentId       String        @unique
  payment         Payment       @relation(fields: [paymentId], references: [id])
  enrolmentId     String?
  enrolment       Enrolment?    @relation(fields: [enrolmentId], references: [id])
  amount          Float
  currency        String
  taxAmount       Float?
  taxType         String?       // VAT, GST
  companyDetails  Json          // Name, address, reg number
  footerNotes     String?
  pdfUrl          String?
  status          InvoiceStatus @default(ISSUED)
  creditNoteId    String?       // Link to credit note if refunded
  issuedAt        DateTime      @default(now())

  @@index([enrolmentId])
}

model Agreement {
  id              String          @id @default(cuid())
  enrolmentId     String          @unique
  enrolment       Enrolment       @relation(fields: [enrolmentId], references: [id])
  userId          String
  user            User            @relation(fields: [userId], references: [id])
  templateVersion String
  templateContent String          // HTML content at time of signing
  signedPdfUrl    String?
  signerFullName  String?
  signatureData   String?         // Base64 signature image
  signerIp        String?
  status          AgreementStatus @default(PENDING)
  signedAt        DateTime?
  createdAt       DateTime        @default(now())

  @@index([userId])
}

model Certificate {
  id                String            @id @default(cuid())
  enrolmentId       String            @unique
  enrolment         Enrolment         @relation(fields: [enrolmentId], references: [id])
  certificateNumber String            @unique
  templateId        String?
  type              CertificateType   @default(CERTIFICATION)
  status            CertificateStatus @default(PENDING)
  cpdHours          Float?
  pdfUrl            String?
  shareLink         String?           @unique
  issuedAt          DateTime?
  approvedAt        DateTime?
  approvedBy        String?           // Admin user ID
  revokedAt         DateTime?
  revokeReason      String?
  createdAt         DateTime          @default(now())

  @@index([certificateNumber])
  @@index([status])
}

model Conversation {
  id              String                @id @default(cuid())
  status          ConversationStatus    @default(OPEN)
  assignedTo      String?               // Staff user ID
  lastMessageAt   DateTime?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  // Relations
  participants    ConversationParticipant[]
  messages        Message[]
}

model ConversationParticipant {
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  userId          String
  user            User         @relation(fields: [userId], references: [id])
  lastReadAt      DateTime?

  @@id([conversationId, userId])
}

model Message {
  id              String       @id @default(cuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  senderId        String
  sender          User         @relation("sender", fields: [senderId], references: [id])
  content         String
  attachments     Json?        // [{ name, url, type, size }]
  sentAt          DateTime     @default(now())

  @@index([conversationId])
  @@index([senderId])
}

model Notification {
  id              String             @id @default(cuid())
  userId          String
  user            User               @relation(fields: [userId], references: [id])
  type            String             // signup, payment, step_unlock, etc.
  title           String
  body            String
  channel         NotificationChannel @default(BOTH)
  deliveryStatus  DeliveryStatus     @default(QUEUED)
  readAt          DateTime?
  sentAt          DateTime?
  scheduledFor    DateTime?
  metadata        Json?              // { enrolmentId, stepId, etc. }
  createdAt       DateTime           @default(now())

  @@index([userId])
  @@index([deliveryStatus])
}

model AuditLog {
  id              String   @id @default(cuid())
  actorId         String
  actor           User     @relation("actor", fields: [actorId], references: [id])
  action          String   // e.g., "unlock_step", "approve_certificate"
  targetEntity    String   // e.g., "Enrolment", "Certificate"
  targetId        String
  details         Json?    // { reason: "...", previousValue: "...", newValue: "..." }
  ipAddress       String?
  createdAt       DateTime @default(now())

  @@index([actorId])
  @@index([targetEntity, targetId])
  @@index([createdAt])
}

model Coupon {
  id              String     @id @default(cuid())
  code            String     @unique
  type            CouponType
  value           Float      // Percentage or fixed amount
  currency        String?    // For fixed: INR, AED, USD
  programId       String?    // null = applies to all programs
  program         Program?   @relation(fields: [programId], references: [id])
  usageLimit      Int?       // null = unlimited
  usedCount       Int        @default(0)
  expiresAt       DateTime?
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())

  // Relations
  payments        Payment[]

  @@index([code])
}

model Announcement {
  id        String   @id @default(cuid())
  batchId   String?
  batch     Batch?   @relation(fields: [batchId], references: [id])
  title     String
  body      String
  sentBy    String
  scope     String   // "batch", "all", "user:{id}"
  sentAt    DateTime @default(now())
}

model Lead {
  id          String     @id @default(cuid())
  name        String
  email       String
  phone       String?
  message     String
  source      String     @default("contact_form") // contact_form, program_page
  programSlug String?    // Which program they enquired about
  status      LeadStatus @default(NEW)
  notes       String?    // Admin notes
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status])
  @@index([email])
}

model RegistrationField {
  id          String  @id @default(cuid())
  programId   String
  program     Program @relation(fields: [programId], references: [id])
  fieldName   String  // e.g., "company_name", "city"
  fieldLabel  String
  fieldType   String  // text, select, checkbox
  isRequired  Boolean @default(false)
  options     Json?   // For select fields
  order       Int

  @@index([programId])
}

model Resource {
  id          String  @id @default(cuid())
  title       String
  type        LessonType
  fileKey     String
  category    String
  stepId      String?
  step        Step?   @relation(fields: [stepId], references: [id])
  programId   String?
  batchId     String?
  order       Int     @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model InvoiceSettings {
  id                String @id @default(cuid())
  companyName       String
  companyAddress    String
  companyRegNumber  String?
  logoUrl           String?
  invoicePrefix     String @default("WBM")
  nextSequence      Int    @default(1)
  taxLabel          String? // "VAT" or "GST"
  taxRate           Float?
  footerNotes       String?
  updatedAt         DateTime @updatedAt
}

model AgreementTemplate {
  id          String  @id @default(cuid())
  programId   String?
  version     String
  title       String
  content     String  // HTML content
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
}

model CertificateTemplate {
  id          String  @id @default(cuid())
  programId   String?
  name        String
  templateData Json   // Layout, fonts, positions
  previewUrl  String?
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
}

// ============================================
// MISSING MODELS — Added after edge-case audit
// ============================================

// Real-world scenario: Roweena offers 3 instalments of ₹5000 each.
// Without this model, only individual payments are tracked but not the plan itself.
model InstalmentPlan {
  id              String    @id @default(cuid())
  enrolmentId     String    @unique
  totalInstalments Int
  amounts         Json      // [5000, 5000, 5000] — per instalment
  dueDates        Json      // ["2026-10-01", "2026-11-01", "2026-12-01"]
  currency        String
  status          String    @default("active") // active, completed, defaulted
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// Real-world scenario: Corporate workshop requires "company name" field.
// Learner fills it in during registration. Without this, custom form data is lost.
model RegistrationResponse {
  id              String    @id @default(cuid())
  enrolmentId     String
  fieldId         String    // References RegistrationField.id
  value           String    // The learner's answer
  createdAt       DateTime  @default(now())

  @@unique([enrolmentId, fieldId])
  @@index([enrolmentId])
}

// Real-world scenario: Batch is full, 5 people on waitlist. Seat opens.
// Next person needs a time-limited payment link. Must track: when notified, when link expires,
// whether they paid or the seat moved to the next person.
model WaitlistEntry {
  id              String    @id @default(cuid())
  userId          String
  batchId         String
  position        Int
  status          String    @default("waiting") // waiting, notified, converted, expired, cancelled
  notifiedAt      DateTime?
  paymentLinkExpiresAt DateTime?
  convertedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([userId, batchId])
  @@index([batchId, position])
}

// Real-world scenario: Roweena conducts oral assessment, scores against a rubric,
// writes notes. The existing Attempt model is for MCQ quizzes — it has questionsShown/answers
// which don't map to a rubric-based assessment.
model OralAssessment {
  id              String    @id @default(cuid())
  enrolmentId     String    @unique
  sessionId       String?   // The 1:1 session where assessment was conducted
  assessorId      String    // Admin/Roweena who conducted it
  rubricScores    Json      // { "communication": 8, "understanding": 9, "application": 7 }
  totalScore      Float
  passMark        Float
  passed          Boolean
  notes           String?   // Assessor's written feedback
  assessedAt      DateTime  @default(now())

  @@index([enrolmentId])
}

// Real-world scenario: PDF says "date-based release per batch".
// Step.unlockDate is program-level, but two batches of the same program
// need different unlock dates (Oct batch starts Oct 1, Jan batch starts Jan 1).
model BatchStepOverride {
  batchId         String
  stepId          String
  unlockDate      DateTime?   // Override the step's default unlock date for this batch
  manualUnlock    Boolean     @default(false)  // Admin manually unlocked this step for the entire batch
  notes           String?
  updatedBy       String?     // Admin user ID who set the override
  updatedAt       DateTime    @updatedAt

  @@id([batchId, stepId])
  @@index([batchId])
}

// Real-world scenario: "Acme Corp pays for 10 employees."
// Need to track: company name for invoice, billing contact, which learners belong to the company.
model Company {
  id              String    @id @default(cuid())
  name            String
  contactName     String
  contactEmail    String
  contactPhone    String?
  address         String?
  taxId           String?   // VAT/GST number
  country         String?
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([contactEmail])
}

// Real-world scenario: A single notification can trigger both email AND in-app.
// If the email bounces but in-app works, what's the deliveryStatus on Notification?
// This model tracks each delivery channel separately.
model NotificationDelivery {
  id              String         @id @default(cuid())
  notificationId  String
  channel         String         // "email" or "in_app"
  status          DeliveryStatus @default(QUEUED)
  providerMessageId String?      // SendGrid/Resend message ID for tracking
  sentAt          DateTime?
  deliveredAt     DateTime?
  bouncedAt       DateTime?
  failureReason   String?

  @@unique([notificationId, channel])
  @@index([notificationId])
  @@index([status])
}
```

### 4.2 Indexes & Performance Notes

- All foreign keys are indexed.
- Composite unique constraints prevent duplicate enrolments, attendances, and lesson completions.
- Audit logs indexed by `createdAt` for time-range queries.
- `Program.slug` indexed for fast public page lookups.
- `Invoice.invoiceNumber` is unique for sequential numbering.

---

## 5. Authentication & Authorization

### 5.1 Auth Flow

```mermaid
sequenceDiagram
    participant L as Learner
    participant FE as Frontend
    participant API as NestJS API
    participant DB as Database
    participant Redis as Redis

    L->>FE: Enter email + password
    FE->>API: POST /api/auth/login
    API->>DB: Find user by email, verify password hash
    DB-->>API: User found

    alt Role is Admin/Super Admin
        API->>API: Check if 2FA is enabled
        API-->>FE: { requires2FA: true, tempToken }
        FE->>L: Show 2FA input
        L->>FE: Enter TOTP code
        FE->>API: POST /api/auth/2fa/verify { tempToken, code }
        API->>API: Verify TOTP
    end

    API->>API: Generate JWT (access + refresh)
    API->>Redis: Store session { userId, deviceInfo, ip }
    API->>Redis: Check active sessions count
    
    alt More than 2 active sessions
        API->>Redis: Invalidate oldest session
    end

    API-->>FE: Set HTTP-only cookies (accessToken, refreshToken)
    FE-->>L: Redirect to dashboard
```

### 5.2 Token Strategy

| Token | Type | Lifetime | Storage |
|-------|------|----------|---------|
| **Access Token** | JWT | 15 minutes | HTTP-only, Secure, SameSite cookie |
| **Refresh Token** | JWT (opaque) | 7 days | HTTP-only, Secure, SameSite cookie |
| **Temp Token** | JWT | 5 minutes | Response body (for 2FA flow) |
| **Email Verification** | UUID | 24 hours | Database |
| **Password Reset** | UUID | 1 hour | Database |

### 5.3 Role-Based Access Control (RBAC)

```typescript
// Example usage in a controller
@Controller('certificates')
export class CertificatesController {
  
  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)  // Only admins
  async approve(@Param('id') id: string, @CurrentUser() user: User) {
    return this.certsService.approve(id, user.id);
  }

  @Get('mine')
  @Roles(UserRole.LEARNER)  // Only the learner
  async getMyCertificates(@CurrentUser() user: User) {
    return this.certsService.findByUser(user.id);
  }
}
```

---

## 6. API Design & Contracts

### 6.1 Response Format

All API responses follow a consistent format:

```json
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "QUIZ_RETRY_WAIT",
    "message": "You must wait 24 hours before retrying this quiz",
    "details": {
      "retryAvailableAt": "2026-10-01T14:30:00Z"
    }
  }
}
```

### 6.2 Pagination

All list endpoints support:

```
GET /api/programs?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc&search=brain
```

### 6.3 Key Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | Email not yet verified |
| `AUTH_2FA_REQUIRED` | 403 | 2FA code needed |
| `AUTH_SESSION_LIMIT` | 401 | Too many active sessions |
| `ROLE_FORBIDDEN` | 403 | Role doesn't have permission |
| `BATCH_FULL` | 409 | Batch at capacity |
| `STEP_LOCKED` | 403 | Step not yet unlocked |
| `QUIZ_RETRY_WAIT` | 429 | Must wait before retrying |
| `QUIZ_RETRIES_EXHAUSTED` | 403 | No retries left |
| `AGREEMENT_REQUIRED` | 403 | Must sign agreement first |
| `COUPON_INVALID` | 400 | Coupon expired or overused |
| `PAYMENT_FAILED` | 402 | Stripe payment failed |

---

## 7. Real-Time Architecture (WebSockets)

### 7.1 Socket.IO Events

```typescript
// Client → Server events
interface ClientToServerEvents {
  'chat:send_message': (data: { conversationId: string; content: string; attachments?: any[] }) => void;
  'chat:typing': (data: { conversationId: string; isTyping: boolean }) => void;
  'chat:mark_read': (data: { conversationId: string }) => void;
}

// Server → Client events
interface ServerToClientEvents {
  'chat:new_message': (data: { message: Message; conversationId: string }) => void;
  'chat:typing_status': (data: { conversationId: string; userId: string; isTyping: boolean }) => void;
  'chat:read_receipt': (data: { conversationId: string; userId: string; readAt: string }) => void;
  'notification:new': (data: { notification: Notification }) => void;
  'step:unlocked': (data: { stepId: string; stepOrder: number }) => void;
  'session:starting_soon': (data: { sessionId: string; title: string; startsIn: number }) => void;
}
```

### 7.2 Connection Management

- Socket authenticated via JWT token sent in handshake.
- Each user joins a personal room: `user:{userId}`.
- Chat conversations create rooms: `conversation:{conversationId}`.
- Admin/Manager join additional rooms: `staff:inbox`, `batch:{batchId}`.

---

## 8. Background Jobs & Queue System

### 8.1 Queue Definitions

| Queue Name | Purpose | Concurrency | Retry Strategy |
|------------|---------|-------------|----------------|
| `email` | Transactional and reminder emails | 5 | 3 retries, exponential backoff |
| `notification` | In-app notifications | 10 | 2 retries |
| `calendar-sync` | Outlook calendar create/update/delete | 2 | 3 retries |
| `attendance-import` | Pull Zoom/Meet participant reports | 2 | 3 retries |
| `certificate-gen` | Generate certificate PDFs | 2 | 3 retries |
| `invoice-gen` | Generate invoice PDFs | 3 | 3 retries |
| `watermark` | Apply watermarks to PDFs/videos | 2 | 2 retries |
| `reminder` | Session reminders (24h, 1h before) | 5 | 2 retries |
| `cleanup` | Expired tokens, old sessions | 1 | 1 retry |

### 8.2 Scheduled (Cron) Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Daily summary email | `0 7 * * *` (7am, per timezone) | New enrolments, pending certs, unread chats |
| Inactivity nudge | `0 10 * * *` | Check learners with N days of no progress |
| Instalment reminders | `0 9 * * *` | Remind learners of upcoming instalment dues |
| Session reminders | `*/5 * * * *` | Check for sessions starting in 24h or 1h |
| Attendance sync | `*/15 * * * *` | Pull participant data from recently ended meetings |
| Token cleanup | `0 3 * * *` | Remove expired tokens and sessions |

---

## 9. Third-Party Integration Architecture

### 9.1 Meeting Provider Abstraction

```typescript
// The "meeting provider" abstraction layer from the PDF
interface MeetingProvider {
  createMeeting(params: CreateMeetingParams): Promise<MeetingResult>;
  getMeeting(meetingId: string): Promise<MeetingDetails>;
  getRecording(meetingId: string): Promise<RecordingResult>;
  getParticipants(meetingId: string): Promise<Participant[]>;
  deleteMeeting(meetingId: string): Promise<void>;
}

// Switch providers via config, not code changes
class ZoomProvider implements MeetingProvider { ... }
class GoogleMeetProvider implements MeetingProvider { ... }
```

### 9.2 Stripe Payment Flow

```mermaid
sequenceDiagram
    participant L as Learner
    participant FE as Frontend
    participant API as NestJS
    participant S as Stripe
    participant DB as Database
    participant Q as Job Queue

    L->>FE: Click "Pay Now"
    FE->>API: POST /api/payments/checkout
    API->>API: Validate coupon, calculate price
    API->>S: Create Checkout Session
    S-->>API: Checkout URL
    API-->>FE: { checkoutUrl }
    FE->>S: Redirect to Stripe Checkout
    L->>S: Enter card details, pay
    S->>API: POST /webhooks/stripe (checkout.session.completed)
    API->>API: Verify webhook signature
    API->>DB: Create Payment record (status: COMPLETED)
    API->>DB: Update Enrolment (status: PENDING_AGREEMENT)
    API->>Q: Queue invoice generation job
    API->>Q: Queue welcome email
    Q->>Q: Generate invoice PDF
    Q->>Q: Send invoice email to learner
    S-->>FE: Redirect to success page
```

---

## 10. Content Protection Architecture

```mermaid
flowchart LR
    subgraph "Content Request Flow"
        A["Learner requests<br/>lesson content"] --> B{"Authenticated?"}
        B -- No --> C["401 Unauthorized"]
        B -- Yes --> D{"Has access<br/>to this step?"}
        D -- No --> E["403 Step Locked"]
        D -- Yes --> F["Generate signed URL<br/>(expires in 15 min)"]
        F --> G{"Content type?"}
        G -- Video --> H["Return Mux/CDN<br/>signed playback URL<br/>+ watermark config"]
        G -- PDF --> I["Serve through<br/>in-app PDF viewer<br/>+ watermark overlay"]
        G -- Audio --> J["Return signed<br/>audio stream URL"]
    end
```

---

## 11. File Storage & Media Pipeline

### 11.1 Storage Organization

```
whatboutme-storage/                    # S3 bucket
├── programs/
│   └── {programId}/
│       └── {stepId}/
│           ├── lessons/
│           │   ├── {lessonId}.pdf
│           │   └── {lessonId}.mp3
│           └── resources/
│               └── {resourceId}.pdf
├── agreements/
│   └── {userId}/
│       └── {agreementId}_signed.pdf
├── certificates/
│   └── {certificateId}.pdf
├── invoices/
│   └── {invoiceId}.pdf
├── templates/
│   ├── certificates/
│   └── agreements/
├── uploads/
│   └── chat/
│       └── {messageId}/
│           └── {filename}
└── images/
    ├── avatars/
    ├── covers/
    └── logos/
```

---

## 12. Data Flow Diagrams

### 12.1 Certificate Eligibility Check

```mermaid
flowchart TD
    START["Check Certificate Eligibility"] --> A{"All steps<br/>completed?"}
    A -- No --> FAIL["Not Eligible"]
    A -- Yes --> B{"All step quizzes<br/>passed?"}
    B -- No --> FAIL
    B -- Yes --> C{"Final exam<br/>passed?"}
    C -- No --> FAIL
    C -- Yes --> D{"Oral assessment<br/>passed?"}
    D -- No --> FAIL
    D -- Yes --> E{"Attendance meets<br/>minimum requirement?"}
    E -- No --> FAIL
    E -- Yes --> F{"Closing call<br/>completed?"}
    F -- No --> FAIL
    F -- Yes --> PASS["ELIGIBLE: Create pending certificate"]
    PASS --> NOTIFY["Notify admin of pending certificate"]
```

### 12.2 Step Unlock Logic

```mermaid
flowchart TD
    A["Learner completes an action<br/>in current step"] --> B{"All lessons<br/>marked complete?"}
    B -- No --> WAIT["Step remains locked.<br/>Show progress."]
    B -- Yes --> C{"Quiz passed?"}
    C -- No --> D{"Retries<br/>remaining?"}
    D -- No --> E["Admin intervention<br/>required"]
    D -- Yes --> F{"Wait time<br/>elapsed?"}
    F -- No --> G["Show countdown<br/>timer to retry"]
    F -- Yes --> H["Allow quiz retry"]
    C -- Yes --> I{"Admin set<br/>date-based unlock?"}
    I -- Yes --> J{"Release date<br/>reached?"}
    J -- No --> K["Step scheduled.<br/>Show date."]
    J -- Yes --> L["UNLOCK next step"]
    I -- No --> L
    L --> M["Send step_unlocked<br/>notification"]
    M --> N["Update enrolment<br/>progress %"]
```

---

## 13. Security Architecture

### 13.1 Security Layers

```
Layer 1: CDN / Edge
├── DDoS protection (AWS CloudFront / WAF)
├── SSL/TLS termination
└── Rate limiting (basic)

Layer 2: Application (NestJS)
├── Helmet.js (security headers)
├── CORS (whitelist whatboutme.com only)
├── Rate limiting (@nestjs/throttler)
├── CSRF protection (double-submit cookie)
├── JWT validation on every request
├── Role-based access guards
├── Input validation (class-validator)
├── SQL injection prevention (Prisma ORM)
└── XSS prevention (output encoding)

Layer 3: Data
├── Passwords: bcrypt (12 rounds)
├── Secrets: Environment variables (never in code)
├── Database: AWS RDS TLS connections only (VPC isolated)
├── File access: Short-lived signed URLs
├── Webhooks: Signature verification
└── 2FA: TOTP (RFC 6238) for admin accounts

Layer 4: Monitoring
├── Suspicious login detection
├── Audit logging (every state change)
├── Active session tracking (2 device limit)
└── Error alerts to Foxwel.AI
```

---

## 14. Deployment & Infrastructure

### 14.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│              AWS Amplify (Frontend)                   │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Next.js Apps (lms, marketing, admin)             │ │
│  │  - SSR for public pages (Edge runtime)           │ │
│  │  - CSR for portal/admin                          │ │
│  │  - Preview deployments per PR                    │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ API calls
┌──────────────────────▼──────────────────────────────┐
│              AWS ECS Fargate (Backend)                │
│  ┌─────────────────────────────────────────────────┐ │
│  │  NestJS API Server (Docker Container)             │ │
│  │  - Auto-scaling via ECS Service                  │ │
│  │  - Health check via ALB target group             │ │
│  │  - Zero-downtime rolling deploy                  │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  BullMQ Worker (same codebase, worker entry)     │ │
│  │  - Separate ECS task for job processing          │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
     ┌─────────────────┼──────────────────┐
     ▼                 ▼                  ▼
┌─────────┐   ┌──────────────┐   ┌───────────────┐
│ AWS RDS │   │ AWS          │   │ AWS S3        │
│ Postgres│   │ ElastiCache  │   │               │
│         │   │ (Redis)      │   │               │
│ Private │   │ - Sessions   │   │ - PDFs        │
│ VPC     │   │ - Job queues │   │ - Audio       │
│ Subnet  │   │ - Rate limit │   │ - Agreements  │
│         │   │ - Cache      │   │ - Certificates│
└─────────┘   └──────────────┘   └───────────────┘
```

### 14.2 CI/CD Pipeline

```mermaid
flowchart LR
    A["Push to<br/>feature branch"] --> B["Run lint<br/>+ type check"]
    B --> C["Run unit<br/>tests"]
    C --> D["Run E2E<br/>tests"]
    D --> E["Deploy to<br/>Staging"]
    E --> F["Roweena<br/>reviews"]
    F --> G["Merge PR<br/>to main"]
    G --> H["Auto-deploy<br/>to Production"]
    H --> I["Run smoke<br/>tests"]
    I --> J{"Pass?"}
    J -- No --> K["Auto-rollback"]
    J -- Yes --> L["Done"]
```

---

## 15. Monitoring & Observability

| Tool | Purpose | Integration |
|------|---------|-------------|
| **Sentry** | Error tracking (frontend + backend) | Automatic error capture, source maps |
| **Uptime Robot / Better Uptime** | Uptime monitoring | Ping `/api/health` every 1 minute |
| **AWS CloudWatch** | Database + ECS metrics | RDS Performance Insights, container monitoring |
| **BullMQ Board** | Job queue monitoring | Failed/completed/delayed jobs |
| **Custom Logs** | Application logging | Structured JSON logs to stdout |
| **Alerts** | Incident notifications | Slack/Email alerts to Foxwel.AI |

### Health Check Endpoint

```
GET /api/health → 200 OK
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "uptime": "48h 32m",
  "version": "1.2.0"
}
```

---

## 16. Performance Strategy

| Concern | Strategy |
|---------|----------|
| **Public pages (SEO)** | SSR with ISR (revalidate every 60s for program data) |
| **Portal/Admin pages** | SWR with stale-while-revalidate |
| **Images** | Next.js Image component (auto WebP, lazy load, CDN) |
| **Videos** | Stream via CDN (Mux); never serve from origin |
| **PDFs** | Render page-by-page in viewer; lazy-load pages |
| **Database** | Connection pooling via RDS Proxy; indexed queries |
| **API responses** | Redis cache for expensive queries (dashboard stats, reports) |
| **Bundle size** | Dynamic imports for admin-only components |
| **Mobile** | Target < 3s first contentful paint on 3G |

---

## 17. Testing Strategy

### 17.1 Test Pyramid

| Level | Tool | Coverage Target | What to Test |
|-------|------|:---------------:|-------------|
| **Unit Tests** | Jest | 80%+ | Services, utilities, business logic |
| **Integration Tests** | Jest + Prisma Test | 60%+ | API endpoints with real DB |
| **E2E Tests** | Playwright | Key flows | Registration, payment, step unlock, certificate |
| **Manual QA** | Staging env | All features | Full regression before launch |

### 17.2 Key E2E Test Scenarios

1. **Complete learner journey:** Sign up → Pay → Sign agreement → Complete Step 1 → Pass quiz → Unlock Step 2
2. **Admin flow:** Create program → Add steps → Add quiz → Create batch → Enrol learner → Approve certificate
3. **Payment edge cases:** Failed payment → Retry → Coupon → Refund
4. **Content protection:** Verify signed URLs expire, verify watermarks present, verify no direct file access
5. **Session management:** Login on 3 devices → Verify oldest is logged out
6. **Role access:** Verify Manager cannot access other Manager's batches

---

> [!NOTE]
> This architecture document is the technical companion to the [PRD.md](file:///c:/Users/lenovo/Desktop/whataboutme/PRD.md). It provides implementation-ready specifications for developers to begin building the WhatBoutMe LMS platform.

---

## 19. Scalability Strategy

> **Sizing assumption:** ~200-500 concurrent users in year one (validated in PRD §21.2 Assumptions). This is a coaching platform, not a MOOC with millions of users. The architecture is designed for this scale with clear upgrade paths.

### 19.1 Current Scale Design

| Component | Year 1 Capacity | Scaling Trigger | Upgrade Path |
|-----------|:---------------:|-----------------|---------------|
| **NestJS API** | 1 ECS task (2 vCPU, 1GB RAM) | >70% CPU sustained | ECS auto-scaling adds tasks behind ALB |
| **BullMQ Worker** | 1 ECS task (1 vCPU, 512MB) | Job queue backlog >100 | Add worker tasks (stateless, safe to scale horizontally) |
| **AWS RDS PostgreSQL** | db.t4g.micro (2 vCPU, 1GB) | >500 concurrent connections | Scale instance class. Add read replicas for reports. |
| **AWS ElastiCache Redis** | cache.t4g.micro | >10K commands/sec | Scale node type or add cluster replicas |
| **WebSocket (Socket.IO)** | Single server, in-memory adapter | >500 concurrent connections | Add **Redis Adapter** (`@socket.io/redis-adapter`) for multi-instance |
| **AWS S3** | No limit | N/A | S3 scales infinitely |
| **Video CDN (Mux)** | Pay-per-minute | N/A | Mux scales infinitely |

### 19.2 Database Connection Management

```typescript
// prisma/schema.prisma — connection pooling for AWS RDS
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // RDS Proxy pooled connection
}
```

- **Pooled connections** via AWS RDS Proxy for API requests (prevents connection exhaustion)
- **Connection limit:** RDS Proxy auto-manages pooling. Each ECS task uses `connection_limit=10`.

### 19.3 What NOT to Over-Engineer

| Temptation | Why We Avoid It |
|---|---|
| Microservices | 2-3 developers, <500 users. Modular monolith provides the same code isolation without network overhead. If a module needs independent scaling later, extract it. |
| Kubernetes (EKS) | ECS Fargate provides Docker deployment with auto-scaling without managing cluster nodes. EKS is overkill for a single API + worker. |
| GraphQL | REST is simpler, better cached, and sufficient for a first-party frontend. GraphQL adds resolver complexity. |
| Event sourcing | CRUD with audit log achieves the same traceability without the complexity of event replay and projections. |

---

## 20. Caching Strategy

### 20.1 What Gets Cached

| Data | Cache Key Pattern | TTL | Invalidation |
|------|-------------------|-----|---------------|
| **Public program pages** (SSR) | Next.js ISR | 60s revalidate | On-demand revalidation when admin publishes/updates a program |
| **Admin dashboard stats** | `dashboard:stats` | 5 min | Time-based expiry. Stats are approximate, not real-time. |
| **User session data** | `session:{userId}:{deviceId}` | 15 min (matches access token) | On logout, token refresh, or session invalidation |
| **Rate limit counters** | `ratelimit:{ip}:{endpoint}` | Sliding window (1 min) | Auto-expires |
| **Roweena's availability slots** | `availability:{date}` | 10 min | Invalidated on new booking or Outlook sync |
| **Active coupon validation** | `coupon:{code}` | 5 min | Invalidated on coupon update/deactivation |

### 20.2 What Does NOT Get Cached

| Data | Why |
|------|-----|
| Learner progress / quiz attempts | Must be real-time accurate. Stale progress could allow step access violations. |
| Payment status | Financial data must always be fresh. Race conditions could cause double-enrolment. |
| Chat messages | Real-time via WebSocket. Caching adds latency and consistency issues. |
| Attendance records | Must reflect latest corrections. Affects certificate eligibility. |

### 20.3 Cache-Aside Pattern

```typescript
// Example: Dashboard stats caching
async getDashboardStats(): Promise<DashboardStats> {
  const cached = await this.redis.get('dashboard:stats');
  if (cached) return JSON.parse(cached);

  const stats = await this.computeStats(); // Expensive DB queries
  await this.redis.setex('dashboard:stats', 300, JSON.stringify(stats));
  return stats;
}
```

> **Edge case:** Admin updates a program price, but the public page shows the old price for up to 60 seconds (ISR TTL). **Acceptable** for price changes (not a flash-sale scenario). Admin can trigger on-demand revalidation via the panel if immediate update is needed.

---

## 21. Rate Limiting Configuration

```typescript
// Rate limiting using @nestjs/throttler
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',   // Burst protection
        ttl: 1000,       // 1 second window
        limit: 10,       // 10 requests per second per IP
      },
      {
        name: 'medium',  // General API
        ttl: 60000,      // 1 minute window
        limit: 100,      // 100 requests per minute per IP
      },
      {
        name: 'long',    // Heavy endpoints
        ttl: 3600000,    // 1 hour window
        limit: 1000,     // 1000 requests per hour per IP
      },
    ]),
  ],
})
```

### Per-Endpoint Overrides

| Endpoint | Limit | Rationale |
|----------|-------|----------|
| `POST /api/auth/login` | 5 per minute per IP | Brute-force protection |
| `POST /api/auth/signup` | 3 per minute per IP | Spam registration prevention |
| `POST /api/auth/forgot-password` | 3 per hour per email | Email bombing prevention |
| `POST /api/payments/checkout` | 10 per minute per user | Prevent accidental double-pay |
| `POST /api/quizzes/:id/attempt` | 1 per `retryWaitHours` per user | Enforced by business logic, not just rate limiter |
| `POST /api/leads/enquiry` | 5 per hour per IP | Contact form spam prevention |
| `POST /webhooks/*` | 100 per minute per IP | Stripe/Zoom webhooks can burst. Don't block. |
| `GET /api/programs/*` (public) | 200 per minute per IP | Higher limit for public browsing |

> **Edge case:** Stripe sends multiple webhooks rapidly for a single payment (e.g., `payment_intent.created`, `checkout.session.completed`, `charge.succeeded`). The webhook rate limit must be high enough to not drop these. 100/min per IP is safe.

---

## 22. Environment Variable Catalogue

### Required Variables

| Variable | Example | Used By | Notes |
|----------|---------|---------|-------|
| `DATABASE_URL` | `postgresql://...@xxx.rds.amazonaws.com/...?sslmode=require` | API, Worker | RDS Proxy pooled connection URL |
| `REDIS_URL` | `rediss://xxx.cache.amazonaws.com:6379` | API, Worker | AWS ElastiCache Redis connection |
| `JWT_SECRET` | `<random 64-char string>` | API | Access token signing |
| `JWT_REFRESH_SECRET` | `<random 64-char string>` | API | Refresh token signing |
| `STRIPE_SECRET_KEY` | `sk_live_...` | API | Stripe API (server-side only) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | API | Webhook signature verification |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Frontend | Stripe.js (client-side) |
| `ZOOM_CLIENT_ID` | `...` | API | Zoom OAuth app |
| `ZOOM_CLIENT_SECRET` | `...` | API | Zoom OAuth app |
| `ZOOM_ACCOUNT_ID` | `...` | API | Zoom Server-to-Server OAuth |
| `MS_GRAPH_CLIENT_ID` | `...` | API | Azure AD app registration |
| `MS_GRAPH_CLIENT_SECRET` | `...` | API | Azure AD app registration |
| `MS_GRAPH_TENANT_ID` | `...` | API | Azure AD tenant |
| `EMAIL_API_KEY` | `re_...` | API, Worker | Resend/SendGrid API key |
| `EMAIL_FROM` | `noreply@whatboutme.com` | Worker | Sending address |
| `MUX_TOKEN_ID` | `...` | API | Mux video API |
| `MUX_TOKEN_SECRET` | `...` | API | Mux video API |
| `MUX_SIGNING_KEY_ID` | `...` | API | Mux signed playback URLs |
| `MUX_SIGNING_PRIVATE_KEY` | `...` | API | Mux signed playback URLs |
| `S3_ENDPOINT` | `https://s3.us-east-1.amazonaws.com` | API, Worker | AWS S3 endpoint |
| `S3_ACCESS_KEY_ID` | `...` | API, Worker | R2/S3 credentials |
| `S3_SECRET_ACCESS_KEY` | `...` | API, Worker | R2/S3 credentials |
| `S3_BUCKET_NAME` | `whatboutme-storage` | API, Worker | Bucket name |
| `FRONTEND_URL` | `https://whatboutme.com` | API | CORS whitelist, email links |
| `SENTRY_DSN` | `https://xxx@sentry.io/xxx` | API, Frontend | Error tracking |
| `NODE_ENV` | `production` | All | Environment flag |

### Per-Environment Differences

| Variable | Development | Staging | Production |
|----------|------------|---------|------------|
| `DATABASE_URL` | RDS `dev` instance | RDS `staging` instance | RDS `prod` instance |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_test_...` | `sk_live_...` |
| `FRONTEND_URL` | `http://localhost:3000` | `https://staging.whatboutme.com` | `https://whatboutme.com` |
| `NODE_ENV` | `development` | `staging` | `production` |

---

## 23. Backup & Disaster Recovery

### 23.1 Recovery Objectives

| Metric | Target | Rationale |
|--------|--------|----------|
| **RPO** (Recovery Point Objective) | 1 hour | Maximum acceptable data loss. AWS RDS supports automated backups and point-in-time restore (PITR) to any point in the last 35 days. |
| **RTO** (Recovery Time Objective) | 4 hours | Maximum acceptable downtime. Includes: diagnosis (1h), restore (1h), verification (1h), DNS propagation (1h). |

### 23.2 Backup Strategy

| Component | Backup Method | Frequency | Retention |
|-----------|--------------|-----------|----------|
| **Database (AWS RDS)** | RDS automated backups + PITR | Continuous (WAL-based) | 35 days (configurable) |
| **Object Storage (S3)** | S3 versioning enabled | Continuous | 90 days for deleted objects |
| **Redis (ElastiCache)** | ElastiCache automatic backup | Daily snapshot | 35 days |
| **Video assets (Mux)** | Mux retains source files | Permanent | Until deleted via API |
| **Source code** | Git (GitHub/GitLab) | Every push | Indefinite |
| **Environment variables** | Secrets manager export | Monthly manual export | 12 months |

### 23.3 Disaster Scenarios

| Scenario | Recovery Procedure | Estimated Downtime |
|----------|-------------------|-------------------|
| **AWS RDS database outage** | RDS Multi-AZ failover triggers automatically within 60 seconds. If region-wide, restore from automated backup to a new region. Update `DATABASE_URL`. | 1-5 minutes (Multi-AZ) |
| **API server crash** | ECS auto-restarts failed tasks. ALB health checks route traffic to healthy tasks only. | 1-5 minutes |
| **Redis (ElastiCache) outage** | ElastiCache Multi-AZ replica promotes automatically. Sessions expire (users re-login). Jobs queue in memory and replay on reconnect. | 0 min (degraded mode) |
| **Accidental data deletion** | RDS PITR restore to 1 minute before deletion. | 1-2 hours |
| **Domain DNS issue** | Cloudflare DNS has 100% SLA. If registrar issue, contact GoDaddy/registrar support. | Variable |
| **Mux video service outage** | Videos unavailable. Learners see "Video temporarily unavailable" message. Progress tracking still works. | 0 min (degraded mode) |

### 23.4 Pre-Launch Checklist

- [ ] Test RDS PITR restore to a new instance — verify data integrity
- [ ] Test Docker image deployment to ECS with rolling update
- [ ] Verify S3 versioning is enabled on the production bucket
- [ ] Document runbook for each disaster scenario above
- [ ] Set up uptime monitoring alerts (5-minute check interval)

> **Edge case:** Roweena accidentally deletes a published course with 50 enrolled learners. **Recovery:** RDS PITR restores the course record. Enrolments and progress are intact because they're in the same database. S3 files (PDFs, certificates) are unaffected (separate system with versioning). Estimated recovery: 30 minutes.

---

> [!NOTE]
> This architecture document is the technical companion to the [PRD.md](file:///c:/Users/lenovo/Desktop/whataboutme/PRD.md). It provides implementation-ready specifications for developers to begin building the WhatBoutMe LMS platform.
