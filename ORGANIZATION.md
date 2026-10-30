# WhatBoutMe LMS — Organizations, Batch Slot Licensing & B2B2C Reseller Engine
## Authoritative Master Specification & Principal Engineering Blueprint

> **Document Version:** 3.0 (Principal Architect, Business Analyst & Client-Aligned Master Specification)  
> **Status:** Canonical & Production-Ready Blueprint  
> **Scope:** `apps/api`, `apps/admin`, `apps/lms`, `apps/marketing`, `apps/api/prisma/schema.prisma`  
> **Authoritative Root Standard:** Extends `AGENTS.md` (Strict server-side RBAC, immutable Audit Logging, `TEST_BYPASS` & Gateway multi-currency payment abstraction, UTC timestamps, 0 TypeScript errors).

---

## 0. Principal Architect & Business Analyst Audit of Version 2.0

Your agent's **Version 2.0** plan is a strong foundation (scoring roughly **78/100**), especially in its multi-tenant RBAC matrix, GDPR privacy isolation, and general Prisma structure. However, when evaluated from the combined perspective of a **Principal Distributed Systems Architect**, a **Senior Business Analyst**, and **your Client's exact commercial requirements**, Version 2.0 had **8 critical architectural and business gaps** that would cause real-world bugs during implementation.

**Version 3.0 resolves all 8 gaps below:**

| # | Critical Gap in v2.0 | Why It Matters to the Client & System | How Version 3.0 Fixes It |
|---|---|---|---|
| **1** | **Double-Counting Batch Capacity Bug** | In v2.0, buying a 30-seat pool reserved 30 slots in a Batch. Later, when those 30 students accepted invites, `EnrollmentsService` created 30 `Enrolment` rows on the same Batch. Standard capacity queries (`Enrolments + ReservedPoolSeats`) counted **60 seats instead of 30**, locking out the batch! | **Single-Count Slot Reservation Formula:** When an Organization buys 30 slots in Batch X, those 30 slots are immediately materialized as 30 `Seat` rows (`Slot #01` to `Slot #30`). When a student claims `Slot #01`, their `Enrolment` attaches *inside* that pre-reserved `Seat` without decrementing available public batch capacity a second time. |
| **2** | **Missing 1-on-1 Session & Full 6-Gate Academic Pipeline in Org & Admin Views** | Client explicitly requires tracking **Steps, Exam, 1-on-1 Session, and Certificate** issued by WhatBoutMe. Version 2.0 only showed generic "progress %" and "exam score" in tables, missing the **1-on-1 Mentorship Session** and **Live Workshop Attendance** gates completely. | Explicitly models and renders all **6 WhatBoutMe Accreditation Gates** per student in both the Admin Organization Workspace and the Org Portal: (1) Consent Agreement, (2) 11 Video/Quiz Steps, (3) Live Cohort Attendance, (4) **1-on-1 Session Status & Facilitator Notes**, (5) Final Exam, and (6) **WhatBoutMe-Issued Certificate**. |
| **3** | **Missing B2B2C Reseller Tools ("Sell the courses to those 30 students")** | Client stated: *"organization will pay for 30 student slots, after that organization will be able to sell the courses for those 30 students."* In v2.0, seats only had a corporate `department` field and email invites. Resellers selling courses to external students need to track their own buyer receipt/order IDs and optionally issue single-use access vouchers. | Added **Reseller Mode** support on every `Seat` slot: `externalOrderRef` (Org's receipt/invoice #), `resalePrice`, `studentPhone`, and dual redemption modes: **Direct Email Invite** OR **Single-Use Slot Claim Code (`WBM-SLOT-XXXX-XXXX`)** bound to the specific batch. |
| **4** | **No Self-Serve Organization Signup & Instant Batch Slot Purchase** | In v2.0, an organization could *only* submit a Lead form and wait for an Admin to manually create their account. The client wants organizations to have an **Organization Login & Payment Option** to pick a batch, buy 30 slots, pay online, and immediately start enrolling students. | Supports **Dual Acquisition Flows**: **(A) Self-Serve Org Registration & Batch Slot Checkout** (`/org/register` -> Pick Course & Batch -> Buy 30 Slots -> Instant Activation) **AND (B) Sales-Assisted / Admin-Provisioned Enterprise Flow** (Discovery Call -> Custom Price / Net-30 Invoice / Payment Link). |
| **5** | **Lazy Seat Row Creation vs. Pre-Materialized numbered Slots (`Slot #01..#30`)** | In v2.0, `Seat` rows were only created when an email invite was sent. The client and Admin couldn't visually see "Slot 1 to Slot 30" in a table or lock individual slots without race-condition aggregate queries. | Upon `SeatPool` activation, the backend immediately generates $N$ numbered `Seat` rows (`slotNumber: 1..N`, `status: AVAILABLE`). All allocations use PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` on specific `AVAILABLE` slots—eliminating deadlocks and giving a visual 30-slot grid. |
| **6** | **Online Checkout Race Condition (Overbooking During Payment)** | In v2.0 Edge Case E9, `PENDING_PAYMENT` pools did not hold batch capacity for 7 days, meaning two organizations or public buyers could buy the same last 15 batch seats simultaneously while on the payment screen. | Introduces a **15-Minute Soft Reservation Lock (`reservationExpiresAt`)** during online checkout (`PENDING_PAYMENT`). If paid within 15 minutes, the lock becomes permanent (`ACTIVE`). If abandoned, the lock auto-releases back to the Batch. |
| **7** | **Admin Panel `Users & Enrolments -> Organizations` Drill-Down Detail** | Client specifically requested: under `Users & Enrolments`, an `Organizations` section showing the Organization Name, and when clicked, showing all enrolled users and all required academic/slot info in one clear view. | Designed the exact UI layout, component hierarchy, KPI cards, and student progress matrix inside `apps/admin/app/users/organizations/[id]/page.tsx` with direct Admin quick-actions (Book/Complete 1-on-1, Unlock Step, Approve Exam/Certificate, Reclaim Slot). |
| **8** | **Floating-Point Currency Math Risk** | Using raw IEEE-754 floats without deterministic rounding causes cent/fils drift on bulk discounts (e.g., 35 seats with 12.5% discount). | Enforces `roundCurrency(val)` 2-decimal integer-cent math across all pricing, invoice line items, and partial seat refunds. |

---

## 1. Executive Brief & Commercial Operating Model

The **WhatBoutMe Organizations & Batch Slot Licensing Engine** enables B2B and B2B2C partners—including **Schools, Universities, Mental Health Clinics, Coaching Academies, Hospitals, and Corporate HR Teams**—to purchase blocks of student slots in WhatBoutMe batches, distribute or resell those slots to learners, and track their end-to-end academic progression in real time.

### 1.1 The 5 Pillars of the Client Requirement
1. **Batch Slot Purchasing & Organization Payment**:
   - An Organization logs in (or is onboarded by Admin), selects a Program and an upcoming **Batch** (e.g., *"Sigma 1 — April 2027 Cohort"*), chooses the number of student slots (e.g., **30 Student Slots**), and pays WhatBoutMe directly via **Online Payment** (`ONLINE` Card/Gateway/`TEST_BYPASS`) or **Approved Institutional Invoice** (`INVOICE_OFFLINE`).
2. **Course Distribution & Reselling to Students (`B2B` & `B2B2C`)**:
   - Once the 30 slots are paid/activated, the Organization owns the distribution rights to fill those 30 slots.
   - **Reseller Case (B2B2C)**: The Organization sells the course to 30 students outside WhatBoutMe at their own retail price, records their receipt reference in the Org Portal, and assigns each student to one of the 30 paid slots.
   - **Corporate / School Case (B2B)**: The Organization sponsors 30 of its own teachers, nurses, or employees and bulk-assigns them via CSV or single invite.
3. **100% WhatBoutMe Academic & Certification Sovereignty**:
   - Even when an Organization sells the course slot to a student, **WhatBoutMe exclusively conducts and controls the entire educational delivery**:
     - Mandatory Workshop Consent & Data-Sharing Agreement
     - All 11 Anti-Skip Video Steps, Quizzes & Mission Statement Review
     - Live Cohort Workshop Sessions (Zoom Attendance Verification)
     - **1-on-1 Personal Assessment / Mentorship Session** with WhatBoutMe Faculty
     - **Final Accreditation Examination**
     - **Official Certificate Issuance & Public QR Verification** (Issued strictly by WhatBoutMe, with optional *"Sponsored / Partnered with [Organization Name]"* co-branding).
4. **Organization Portal (`/org` inside LMS)**:
   - Gives the Organization person a dedicated dashboard to buy more batch slots, pay invoices, assign/invite students into their 30 slots, and track every student's live progress across Steps, Live Attendance, 1-on-1 Sessions, Final Exam, and Certification.
5. **WhatBoutMe Admin Control Center (`Users & Enrolments -> Organizations`)**:
   - Gives WhatBoutMe Admins a centralized directory of all Organizations under **Users & Enrolments**.
   - Clicking any Organization opens its full command workspace showing the **Organization Profile, Batch Slot Utilization (`28/30 Enrolled`), Payment Ledger, and the Complete Enrolled Students Table** with live status for Steps, Exams, 1-on-1 Sessions, and Certificates.

---

## 2. Real-World Business Scenarios (15 Exhaustive Industry Cases)

| ID | Persona / Industry | Real-World Scenario | End-to-End System Execution Flow |
|---|---|---|---|
| **S1** | **Authorized Reseller Academy (B2B2C)** | *"Mindful Leaders Institute"* buys **30 slots** in *Sigma 1 — May 2027 Batch* for $360/slot ($10,800 total). They market the course to their own audience at $550/student, collect payments directly, and enroll the 30 buyers into WhatBoutMe. | Org logs into `/org/seats` -> Selects *Sigma 1 (May 2027 Batch)* -> Buys 30 slots -> Pays $10,800 online -> System generates `Slot #01` to `Slot #30` (`AVAILABLE`). As each student pays the Institute $550, the Institute Admin clicks **Assign Slot**, enters the student's Name, Email, Phone, and External Receipt `#MLI-1042`. Student gets invite email, signs WhatBoutMe agreement, completes Steps 1–11, attends Live Session, completes 1-on-1 with WhatBoutMe, passes Exam, and receives their official **WhatBoutMe Certificate**. |
| **S2** | **Private School Network (Dubai, UAE)** | *"Bright Minds Academy"* wants to train 35 primary school teachers in emotional resilience before the new academic term. | School submits `/organizations` form or registers directly -> SeatPool created for 35 slots @ AED 1,320/slot = AED 46,200 -> Paid via online checkout -> FZE Tax Invoice with school's UAE TRN auto-generated -> School HR uploads a 35-row CSV -> All 35 teachers receive branded activation links. |
| **S3** | **Mental Health Clinic (Patient Bundling)** | A neurology & wellness clinic buys 20 slots and bundles the WhatBoutMe program into their comprehensive outpatient therapy package. | Clinic tracks each patient's Step 1–11 completion and 1-on-1 session status inside `/org/learners` so the clinic's therapists know which neuroscience modules the patient has completed before their weekly clinic appointment. Meanwhile, the patient's private journal notes (`StudentNote`) remain 100% hidden from the clinic. |
| **S4** | **Multinational Enterprise (Net-30 Purchase Order)** | A corporate bank orders 60 slots across two batches. Corporate procurement requires a formal Purchase Order (`PO-2027-8841`) and Net-30 wire transfer. | WhatBoutMe Admin creates the Organization and issues a 60-slot `SeatPool` with `paymentMethod: INVOICE_OFFLINE`, `purchaseOrderNumber: "PO-2027-8841"`, and `status: ACTIVE_UNPAID`. Official WhatBoutMe FZE Invoice PDF is sent. All 60 slots unlock immediately. When the bank wire arrives 21 days later, Admin clicks **Mark Invoice Paid**, transitioning the pool to `ACTIVE`. |
| **S5** | **1-on-1 Session Coordination & Sign-Off** | Out of 30 students under *"Apex Coaching Org"*, 22 have completed Step 11 and the Live Workshop, and now need their mandatory **1-on-1 Session** with WhatBoutMe before certification. | In Admin (`Users & Enrolments -> Organizations -> Apex Coaching -> Enrolled Students`), WhatBoutMe staff filters by `Stage: Awaiting 1-on-1`. Admin sees which students have booked their 1-on-1 slot, conducts the 1-on-1 session, and marks `oneOnOneStatus: COMPLETED`. The Org Admin immediately sees *"1-on-1 Completed ✓"* in their portal without being able to alter the grade. |
| **S6** | **Student Refunds Reseller Before Starting (`AVAILABLE` Slot Recovery)** | A reseller assigns `Slot #12` to `david@example.com`. Two days later, before David ever signs the WhatBoutMe Workshop Agreement or watches Step 1, David asks the reseller for a refund. | Reseller goes to `/org/learners`, locates `Slot #12` (`status: INVITED` or `ASSIGNED`), and clicks **Revoke & Free Slot**. Because David never signed the agreement (`status != CONSUMED`), `Slot #12` immediately resets to `AVAILABLE`. The reseller can now sell `Slot #12` to another student (`emma@example.com`) at zero extra cost. |
| **S7** | **Emergency Replacement After Course Start (Admin Goodwill Reclaim)** | A corporate employee completes Steps 1 and 2 (`Slot #05` is `CONSUMED`), then suffers a medical emergency and goes on 6-month leave. The company asks WhatBoutMe to let another employee take that slot. | Because `Slot #05` is `CONSUMED`, the Org Admin cannot self-revoke it (preventing resellers from letting one student watch the whole course, revoking them, and putting a second student in the same slot!). The Org contacts WhatBoutMe. WhatBoutMe Admin goes to `Users & Enrolments -> Organizations -> [Org]`, clicks **Reclaim Slot (Goodwill Override)** on `Slot #05`, enters a mandatory audit reason, revokes the old enrolment, and resets `Slot #05` to `AVAILABLE`. |
| **S8** | **Mid-Cohort Self-Serve Slot Top-Up** | An organization bought 30 slots for the *June Batch*, sold all 30 in one week, and has 10 more students waiting on their waitlist. | Org Owner clicks **+ Buy More Batch Slots** in `/org/seats`, selects 10 additional slots in the *June Batch*. System checks real-time remaining batch capacity, applies the cumulative volume tier discount (40 total seats in batch = 30–49 tier rate!), processes payment, and appends `Slot #31` to `Slot #40`. |
| **S9** | **Batch Capacity Split Across Two Cohorts** | A batch has capacity for 40 learners. 22 seats are already taken by individual buyers (18 seats left). An organization wants to buy 30 slots. | During slot selection, the system detects `18 < 30` and presents an intelligent split option: *"Batch 'April 2027' has 18 slots remaining. You can purchase 18 slots in April 2027 and 12 slots in May 2027 at the 30-seat bulk discount rate, or request a dedicated Private Organization Batch."* |
| **S10** | **Private Dedicated Organization Cohort** | A university buys 50 slots and wants a closed cohort exclusively for their faculty with custom live workshop dates. | WhatBoutMe Admin creates a Batch with `isPrivateOrgBatch: true` linked to the University's `organizationId`. Public website learners cannot see or book this batch; all 50 slots are exclusively allocated to the University's `SeatPool`. |
| **S11** | **Single-Use Slot Voucher Codes for External E-Commerce Resellers** | A training partner sells WhatBoutMe seats on their own Shopify store and wants to auto-deliver a claim code upon purchase. | Org Admin generates **Slot Voucher Codes** (`WBM-ORGA-7H2K-99PL`) for `Slot #01` to `Slot #30`. Each buyer visits `/org-invite/claim`, enters their code, creates/logs into their WhatBoutMe account, and claims that exact slot. |
| **S12** | **WhatBoutMe Issues Official Certificate with Partner Co-Branding** | A student enrolled under *"Bright Minds Academy"* finishes all 11 Steps, Live Attendance, 1-on-1 Session, and passes the Final Exam with 91%. | WhatBoutMe's Certificate Engine issues the official accredited certificate PDF and verification URL (`/verify/WBM-2027-88412`). Because the Org enabled `showSponsorOnCertificate`, the certificate displays WhatBoutMe's official seal and signature along with: *"Cohort Sponsored by Bright Minds Academy"*. Both WhatBoutMe Admin and the Org Admin can download the certificate PDF. |
| **S13** | **Automated At-Risk Student Intervention** | 5 students out of an organization's 30 slots are stuck at Step 4 withonly 10 days left before the live workshop. | The system flags them as `AT_RISK` (inactive $\ge 7$ days or behind cohort pace). In `/org/learners`, the Org Admin sees an amber `At-Risk (5)` filter badge and clicks **Send Encouragement Nudge**, triggering a co-branded reminder email. |
| **S14** | **Multi-Batch Organization Management** | A long-term partner organization has bought 30 slots in *Batch 1 (Jan)*, 30 slots in *Batch 2 (Mar)*, and 40 slots in *Batch 3 (Jun)* (100 students total). | Both the Admin Panel (`Users & Enrolments -> Organizations -> [Org]`) and the Org Portal (`/org`) provide a **Batch Filter Selector** (`All Batches (100)` | `Batch 1 - Jan (30)` | `Batch 2 - Mar (30)` | `Batch 3 - Jun (40)`) to inspect slot utilization and student progress per batch or in aggregate. |
| **S15** | **Dual Persona User (Org Admin Who Also Takes the Course)** | The Director of Training at an organization manages the 30 student slots, and also assigns `Slot #01` to herself to experience the program firsthand. | Her single account holds both `OrganizationMember(role: OWNER)` and `Enrolment(fundingSource: ORG_SPONSORED)`. In the LMS sidebar, she seamlessly switches between **"My Learning (11 Steps)"** and **"Organization Portal (30 Slots)"**. |

---

## 3. The 6-Gate WhatBoutMe Academic Sovereignty Pipeline

A core business rule from the client is that **Organizations only purchase and distribute the slots—WhatBoutMe conducts all assessments, 1-on-1 sessions, exams, and certification**.

Every student enrolled under an Organization must pass through the exact same **6 Mandatory Academic Gates** managed by WhatBoutMe:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    WHATBOUTME 6-GATE ACCREDITATION PIPELINE (PER ORG STUDENT)                   │
├────────────────┬────────────────┬────────────────┬────────────────┬──────────────┬──────────────┤
│    GATE 1      │     GATE 2     │     GATE 3     │     GATE 4     │    GATE 5    │    GATE 6    │
│   Agreement    │   11 Steps &   │  Live Cohort   │ 1-on-1 Session │  Final Exam  │  Certificate │
│   & Consent    │  Mission Stmt  │   Workshops    │ with Faculty   │ (Max 3 Tries)│  by WBM      │
├────────────────┼────────────────┼────────────────┼────────────────┼──────────────┼──────────────┤
│ Learner signs  │ Compulsory     │ Zoom live      │ Individual     │ Graded by    │ Official PDF │
│ Digital Consent│ anti-skip      │ session        │ mentorship &   │ WhatBoutMe   │ & QR issued  │
│ & Org Data-    │ videos, step   │ attendance     │ readiness      │ exam engine  │ strictly by  │
│ Sharing Notice │ quizzes, and   │ verified by    │ check led by   │ (e.g. >=75%  │ WhatBoutMe   │
│                │ Mission Stmt   │ WhatBoutMe     │ WhatBoutMe     │ pass mark)   │ Authority    │
├────────────────┼────────────────┼────────────────┼────────────────┼──────────────┼──────────────┤
│ Seat Status:   │ Progress:      │ Status:        │ Status:        │ Status:      │ Status:      │
│ ASSIGNED ->    │ Step 1/11 to   │ 0/N Attended   │ UNBOOKED ->    │ LOCKED ->    │ ELIGIBLE ->  │
│ CONSUMED       │ Step 11/11     │ -> SATISFIED   │ SCHEDULED ->   │ PASSED /     │ ISSUED       │
│ (Non-Revocable)│ (0% -> 100%)   │                │ COMPLETED      │ FAILED       │              │
└────────────────┴────────────────┴────────────────┴────────────────┴──────────────┴──────────────┘
```

### What the Organization Can vs. Cannot Do at Each Gate
- **Gate 1 (Agreement)**: Org can see whether the student has signed (`Signed on 12 Mar 2027`) or is still pending. If pending, Org can resend the invite or revoke the slot.
- **Gate 2 (11 Steps & Mission Statement)**: Org can see exact current step (`Step 7 of 11`), overall completion percentage (`64%`), last active timestamp, and whether the Mission Statement milestone is approved. Org **cannot** read the student's private Mission Statement text or private reflections, and **cannot** unlock locked steps.
- **Gate 3 (Live Cohort Workshops)**: Org can see live session attendance count (e.g., `2 / 2 Sessions Attended`) and upcoming live session dates so they can remind their students to attend.
- **Gate 4 (1-on-1 Session)**: Org can see whether the student's 1-on-1 Session with WhatBoutMe is `Not Booked`, `Scheduled (Date/Time)`, `Completed`, or `Missed / No-Show`. WhatBoutMe Admin schedules/marks the 1-on-1 session complete inside the Admin Panel.
- **Gate 5 (Final Exam)**: Org can see exam status (`Not Started`, `Attempt 1/3 — Passed (88%)`, or `Failed (3/3 Attempts)`). Only WhatBoutMe Admin can grant an extra retake attempt if a student exhausts all 3 tries.
- **Gate 6 (Certificate)**: Only WhatBoutMe issues the certificate (automated upon satisfying Gates 1–5 or triggered by WhatBoutMe Admin). Once issued, both the Student, the Organization Admin, and WhatBoutMe Admin can view/download the verified Certificate PDF.

---

## 4. Single-Count Batch Slot Reservation & Capacity Invariant

To guarantee that batch capacity is **never overbooked** and **never double-counted**, the system enforces a strict mathematical invariant for every `Batch`.

### 4.1 The Batch Capacity Formula
For any `Batch` with maximum capacity $C_{\text{max}}$:

$$C_{\text{occupied}} = E_{\text{individual}} + S_{\text{org\_active}} + S_{\text{org\_checkout\_hold}}$$

Where:
1. $E_{\text{individual}}$ = Count of active `Enrolment` records in this batch where `fundingSource != 'ORG_SPONSORED'` (i.e., `SELF_PAID` and `ADMIN_COMP` individual learners).
2. $S_{\text{org\_active}}$ = Sum of `SeatPool.totalSeats` for this batch where `SeatPool.status IN ('ACTIVE', 'ACTIVE_UNPAID')`.
3. $S_{\text{org\_checkout\_hold}}$ = Sum of `SeatPool.totalSeats` for this batch where `SeatPool.status == 'PENDING_PAYMENT'` AND `SeatPool.reservationExpiresAt > NOW()`.

Therefore, the remaining purchasable capacity for a Batch at any millisecond is:

$$C_{\text{available}} = C_{\text{max}} - \left( E_{\text{individual}} + S_{\text{org\_active}} + S_{\text{org\_checkout\_hold}} \right)$$

### 4.2 Why This Eliminates Double-Counting
- When an Organization buys **30 slots** in *Batch A*, $S_{\text{org\_active}}$ increases by $30$. Those 30 slots are immediately reserved in *Batch A*.
- When the Organization later invites 30 students and those 30 students create `Enrolment` rows with `fundingSource = 'ORG_SPONSORED'`, $E_{\text{individual}}$ **does not change**, because those students are occupying the 30 `Seat` slots already counted in $S_{\text{org\_active}}$!
- Inside the Admin Batch Management view, the Batch capacity bar clearly displays both numbers:
  > **Batch Capacity: 38 / 40 Occupied** *(8 Individual Enrolments + 30 Org Reserved Slots [24 Enrolled, 6 Unassigned])*

---

## 5. Authoritative Database Schema (`apps/api/prisma/schema.prisma`)

The following schema models and extensions provide complete support for Organizations, numbered Batch Slots (`Seat`), 1-on-1 Session tracking, Reseller Voucher Codes, Multi-Currency Invoices, and Admin Audit Logs.

```prisma
// =============================================================================
// ENUMS FOR ORGANIZATIONS, BATCH SLOTS & ACADEMIC GATES
// =============================================================================

enum OrganizationStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  ARCHIVED
}

enum OrganizationType {
  SCHOOL
  UNIVERSITY
  CLINIC
  CORPORATE
  RESELLER_ACADEMY
  NGO
  GOVERNMENT
  OTHER
}

enum OrgMemberRole {
  OWNER   // Full access: buy slots, pay invoices, manage team, assign slots, track students
  ADMIN   // Operational access: assign/invite students, revoke unstarted slots, track students
  VIEWER  // Read-only access: view dashboards, student progress, and export compliance reports
}

enum SeatPoolStatus {
  DRAFT
  PENDING_PAYMENT  // Holds soft batch reservation for 15 minutes (online) or until invoice expiry
  ACTIVE           // Paid and active; all numbered slots ready for assignment
  ACTIVE_UNPAID    // Approved Net-15/30/60 PO invoice; slots unlocked while awaiting wire
  EXPIRED          // Pool validity window ended
  CANCELLED        // Cancelled before payment/consumption
  REFUNDED         // Full refund processed
}

enum SeatPaymentMethod {
  ONLINE           // Instant Checkout (Stripe / Razorpay / TEST_BYPASS)
  INVOICE_OFFLINE  // Institutional Bank Wire / Purchase Order (Net-15, Net-30, Net-60)
  COMPLIMENTARY    // Super Admin Scholarship / Partnership Grant
}

enum SeatStatus {
  AVAILABLE        // Pre-allocated paid slot (e.g. Slot #01), unassigned and ready to use
  INVITED          // Student invited (or voucher issued); waiting for student to claim
  ASSIGNED         // Student claimed slot & created account; waiting to sign Workshop Agreement
  CONSUMED         // Student signed Workshop Agreement & unlocked Step 1 (Slot burned/locked)
  EXPIRED          // Pool expired before this slot was ever consumed
}

enum SeatRedemptionMode {
  EMAIL_INVITE     // Strictly bound to the invited student's email address
  VOUCHER_CODE     // Single-use claim code (e.g. WBM-SLOT-8K2P-91M4) for resellers
}

enum FundingSource {
  SELF_PAID
  ORG_SPONSORED
  ADMIN_COMP
}

enum OneOnOneSessionStatus {
  NOT_BOOKED
  SCHEDULED
  COMPLETED
  NO_SHOW
  WAIVED_BY_ADMIN
}

// =============================================================================
// CORE ORGANIZATION & BATCH SLOT LICENSING MODELS
// =============================================================================

model Organization {
  id                       String             @id @default(uuid())
  orgCode                  String             @unique // Human-readable ID e.g. "WBM-ORG-0042"
  name                     String             // Display name e.g. "Bright Minds Academy"
  slug                     String             @unique
  legalName                String?            // Legal entity name for Tax Invoices
  orgType                  OrganizationType   @default(CORPORATE)
  logoUrl                  String?
  website                  String?
  country                  String?
  timezone                 String             @default("UTC")
  status                   OrganizationStatus @default(ACTIVE)

  // Contact & Institutional Billing Profile (WhatBoutMe FZE Tax Invoicing)
  contactPersonName        String
  contactEmail             String
  contactPhone             String?
  billingEmail             String
  billingAddress           Json?              // { street, city, state, postalCode, country }
  taxId                    String?            // UAE TRN, Indian GSTIN, UK/EU VAT, US EIN
  defaultCurrency          CurrencyCode       @default(USD)
  creditLimit              Float              @default(0)
  paymentTermsDays         Int                @default(30) // Net-15, Net-30, Net-60

  // Reseller & Co-Branding Configuration
  isAuthorizedReseller     Boolean            @default(false)
  showSponsorOnCertificate Boolean            @default(true)
  sponsorDisplayName       String?            // e.g. "Sponsored by Bright Minds Academy"
  allowedEmailDomains      String[]           @default([]) // Optional domain lock e.g. ["@school.ae"]
  shareExamNumericScores   Boolean            @default(true) // If false, Org sees Pass/Fail only

  // Internal WhatBoutMe CRM & Account Ownership
  sourceLeadId             String?            @unique
  accountManagerId         String?
  accountManager           User?              @relation("OrgAccountManager", fields: [accountManagerId], references: [id], onDelete: SetNull)
  internalAdminNotes       String?

  // Relations
  members                  OrganizationMember[]
  seatPools                SeatPool[]
  seats                    Seat[]
  enrolments               Enrolment[]
  invites                  OrganizationInvite[]
  invoices                 Invoice[]
  privateBatches           Batch[]            @relation("OrgPrivateBatches")

  suspendedAt              DateTime?
  suspendedReason          String?
  deletedAt                DateTime?
  createdAt                DateTime           @default(now())
  updatedAt                DateTime           @updatedAt

  @@index([status])
  @@index([orgCode])
  @@index([createdAt(sort: Desc)])
  @@index([accountManagerId])
}

model OrganizationMember {
  id             String        @id @default(uuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User          @relation("UserOrgMemberships", fields: [userId], references: [id], onDelete: Cascade)
  role           OrgMemberRole @default(ADMIN)
  jobTitle       String?       // e.g. "Head of L&D", "Program Coordinator"
  department     String?
  invitedById    String?
  joinedAt       DateTime      @default(now())
  removedAt      DateTime?

  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([organizationId, userId])
  @@index([userId])
  @@index([organizationId, role])
}

model SeatPool {
  id                    String            @id @default(uuid())
  reference             String            @unique // e.g., "SP-2027-0042"
  organizationId        String
  organization          Organization      @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  programId             String
  program               Program           @relation(fields: [programId], references: [id], onDelete: Restrict)
  batchId               String            // Bound to target Batch (or floating if Admin explicitly sets null)
  batch                 Batch             @relation(fields: [batchId], references: [id], onDelete: Restrict)

  // Slot Capacity & Financial Ledger (Locked at transaction creation)
  totalSeats            Int               // e.g., 30 student slots
  unitPrice             Float             // Locked price per slot after tier discount
  listUnitPrice         Float             // Original retail/base price per slot for savings display
  currency              CurrencyCode
  discountPercent       Float             @default(0)
  subtotalAmount        Float
  taxAmount             Float             @default(0)
  totalAmount           Float             // Deterministic 2-decimal rounded total
  paymentMethod         SeatPaymentMethod @default(ONLINE)
  status                SeatPoolStatus    @default(PENDING_PAYMENT)

  // Concurrency & Checkout Reservation TTL
  reservationExpiresAt  DateTime?         // 15-min hold for ONLINE checkout; auto-released if unpaid
  purchaseOrderNumber   String?           // For INVOICE_OFFLINE Net-30 deals
  paymentTermsDays      Int?
  paymentDueDate        DateTime?
  paidAt                DateTime?
  expiresAt             DateTime?         // Default 12 months from activation for unassigned slots

  createdById           String
  createdBy             User              @relation("CreatedSeatPools", fields: [createdById], references: [id])
  notes                 String?

  // Relations
  seats                 Seat[]
  invites               OrganizationInvite[]
  payments              Payment[]
  invoices              Invoice[]

  version               Int               @default(0) // Optimistic concurrency control
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  @@index([organizationId, status])
  @@index([batchId, status])
  @@index([programId])
  @@index([status, reservationExpiresAt])
  @@index([status, paymentDueDate])
}

model Seat {
  id                  String              @id @default(uuid())
  seatPoolId          String
  seatPool            SeatPool            @relation(fields: [seatPoolId], references: [id], onDelete: Cascade)
  organizationId      String
  organization        Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  slotNumber          Int                 // Sequential 1..totalSeats within the SeatPool (e.g., Slot #01 to #30)
  slotLabel           String              // e.g., "SP-2027-0042-S01"
  status              SeatStatus          @default(AVAILABLE)
  redemptionMode      SeatRedemptionMode  @default(EMAIL_INVITE)

  // Optional Single-Use Voucher Code for B2B2C Resellers
  voucherCodeHash     String?             @unique
  voucherCodeMasked   String?             // e.g. "WBM-BMA-****-91M4"

  // Current Active Invite & Student Assignment
  inviteId            String?             @unique
  invite              OrganizationInvite? @relation(fields: [inviteId], references: [id], onDelete: SetNull)
  userId              String?
  user                User?               @relation("UserAllocatedSeats", fields: [userId], references: [id], onDelete: SetNull)
  enrolmentId         String?             @unique
  enrolment           Enrolment?          @relation(fields: [enrolmentId], references: [id], onDelete: SetNull)

  // Reseller & Organizational Metadata (Editable by Org Admin)
  department          String?             // e.g., "Grade 5 Faculty" or "Cohort Group A"
  externalOrderRef    String?             // Reseller's external invoice/receipt ID for this student
  resalePrice         Float?              // Optional: price reseller sold this slot for
  orgInternalNotes    String?             // Org's tracking note for this slot

  // Lifecycle Timestamps
  invitedAt           DateTime?
  assignedAt          DateTime?           // When student claimed invite / registered
  consumedAt          DateTime?           // When student signed Workshop Agreement (Slot permanently locked)
  lastRevokedAt       DateTime?
  lastRevokedReason   String?
  reclaimedByAdminId  String?

  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  @@unique([seatPoolId, slotNumber])
  @@index([seatPoolId, status])
  @@index([organizationId, status])
  @@index([userId])
}

model OrganizationInvite {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  seatPoolId     String
  seatPool       SeatPool     @relation(fields: [seatPoolId], references: [id], onDelete: Cascade)
  email          String       // Normalized lowercase email
  fullName       String?
  phone          String?
  department     String?
  externalOrderRef String?    // Reseller receipt reference passed during invite
  tokenHash      String       @unique // SHA-256 hash of raw 256-bit invite token
  expiresAt      DateTime     // Default 14 days from send
  acceptedAt     DateTime?
  cancelledAt    DateTime?
  resendCount    Int          @default(0)
  lastSentAt     DateTime     @default(now())

  seat           Seat?

  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([organizationId, email])
  @@index([seatPoolId])
  @@index([tokenHash])
}

// =============================================================================
// EXTENSIONS TO EXISTING CORE MODELS (Enrolment, Batch, Payment, Invoice)
// =============================================================================

// 1. Extend Enrolment model with Organization Sponsorship & 1-on-1 Session Tracking:
//   fundingSource            FundingSource         @default(SELF_PAID)
//   organizationId           String?
//   organization             Organization?         @relation(fields: [organizationId], references: [id], onDelete: SetNull)
//   seat                     Seat?
//   orgDataSharingConsentedAt DateTime?            // Recorded when student signs Agreement
//
//   // 1-on-1 Mentorship / Assessment Session Tracking (Conducted by WhatBoutMe)
//   oneOnOneStatus           OneOnOneSessionStatus @default(NOT_BOOKED)
//   oneOnOneScheduledAt      DateTime?
//   oneOnOneCompletedAt      DateTime?
//   oneOnOneFacilitatorId    String?
//   oneOnOneFacilitatorName  String?               // e.g. "Roweena"
//   oneOnOneMeetingUrl       String?
//   oneOnOneAdminNotes       String?               // Private WhatBoutMe faculty notes

// 2. Extend Batch model with Private Organization Cohort support:
//   isPrivateOrgBatch        Boolean               @default(false)
//   sponsorOrganizationId    String?
//   sponsorOrganization      Organization?         @relation("OrgPrivateBatches", fields: [sponsorOrganizationId], references: [id], onDelete: SetNull)
//   seatPools                SeatPool[]

// 3. Extend Payment & Invoice models:
//   seatPoolId               String?
//   seatPool                 SeatPool?             @relation(fields: [seatPoolId], references: [id], onDelete: SetNull)
//   organizationId           String?
//   organization             Organization?         @relation(fields: [organizationId], references: [id], onDelete: SetNull)
//   poNumber                 String?
```

---

## 6. Finite State Machines & Concurrency Invariants

### 6.1 Numbered Slot (`Seat`) Lifecycle State Machine
When a `SeatPool` of $N = 30$ slots transitions to `ACTIVE` (or `ACTIVE_UNPAID`), the system immediately inserts 30 rows (`Slot #01` through `Slot #30`) in status `AVAILABLE`.

```
                  ┌──────────────────────────────────────┐
                  │         0. AVAILABLE (Slot #01)      │
                  │   (Paid slot ready to assign/sell)   │
                  └──────────────────┬───────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         │ (Org sends Email Invite)                              │ (Org generates Voucher Code)
         ▼                                                       ▼
┌─────────────────────────────────┐                     ┌─────────────────────────────────┐
│     1A. INVITED (Email Link)    │                     │   1B. INVITED (Voucher Issued)  │
└────────┬────────────────────────┘                     └────────┬────────────────────────┘
         │                                                       │
         ├──► (Org Cancels / Invite Expires) ──► Returns to [0. AVAILABLE]
         │                                                       │
         └───────────────────────────┬───────────────────────────┘
                                     │ (Student clicks link / redeems code & creates account)
                                     ▼
                  ┌──────────────────────────────────────┐
                  │             2. ASSIGNED              │
                  │  (Account linked; Enrolment created  │
                  │   in status PENDING_AGREEMENT)       │
                  └──────────────────┬───────────────────┘
                                     │
         ├──► (Org Revokes before Agreement signed) ──► Deletes pending Enrolment,
         │                                              Slot returns to [0. AVAILABLE]
         │
         ▼ (Student signs WhatBoutMe Workshop & Data-Sharing Agreement)
                  ┌──────────────────────────────────────┐
                  │             3. CONSUMED              │
                  │   (Enrolment ACTIVE; Step 1 opened;  │
                  │    Slot permanently locked to user)  │
                  └──────────────────┬───────────────────┘
                                     │
                                     └──► (Cannot be self-revoked by Org;
                                           WhatBoutMe Admin Goodwill Reclaim ONLY
                                           with mandatory AuditLog reason -> resets to AVAILABLE)
```

### 6.2 Lock-Free Slot Allocation with `FOR UPDATE SKIP LOCKED`
When an Organization Admin assigns 1 student or uploads a 30-student CSV, the backend never guesses which slot to use. It runs an atomic PostgreSQL transaction:

```sql
SELECT id, "slotNumber"
FROM "Seat"
WHERE "seatPoolId" = $1
  AND status = 'AVAILABLE'
ORDER BY "slotNumber" ASC
LIMIT $2
FOR UPDATE SKIP LOCKED;
```
- If the number of locked rows returned is less than the requested invite count $K$, the transaction immediately rolls back and returns HTTP `409 Conflict` with the exact count of remaining available slots.
- Because `SKIP LOCKED` is used on pre-materialized `Seat` rows ordered by `slotNumber`, two HR admins assigning slots at the exact same millisecond will cleanly grab consecutive slots (e.g., Admin A gets `Slot #05`, Admin B gets `Slot #06`) with **zero transaction failures**.

---

## 7. Admin Panel UI/UX Blueprint (`Users & Enrolments -> Organizations`)

This section directly implements your requirement:
> *"In the admin panel under Users & Enrolments add this Organization section. Inside that Organization section there should be the Organization Name, and when we go to an Organization it should show the users enrolled and all important related information (Steps, Exam, 1-on-1 Session, Certificate, Payment, Batch Slots)."*

### 7.1 Navigation Placement (`apps/admin/app/users`)
Inside **Users & Enrolments**, the top bar features a prominent two-tab view switcher using the existing Admin CSS design tokens:
1. **`People (All Learners & Staff)`** (`/users`) — Existing user list, enhanced with an **Organization Pill Badge** (e.g., `🏢 Bright Minds Academy · Slot #04`) next to any learner sponsored by an organization.
2. **`Organizations (B2B & Batch Slots)`** (`/users/organizations`) — The dedicated Organizations Control Center.

### 7.2 View 1: Organizations Directory (`apps/admin/app/users/organizations/page.tsx`)

```
+--------------------------------------------------------------------------------------------------------------------+
| USERS & ENROLMENTS                                                       [+ Create Organization] [Export CSV]      |
| [ 👥 People (Learners & Staff) ]   [ 🏢 Organizations (B2B & Batch Slots) (Active) ]                               |
+--------------------------------------------------------------------------------------------------------------------+
|  TOTAL ORGANIZATIONS      TOTAL BATCH SLOTS SOLD     STUDENTS ENROLLED / ACTIVE    CERTIFIED ORG LEARNERS          |
|  24 Organizations         680 Slots                  592 Enrolled (87% Util.)      418 Certified                   |
|  19 Active · 2 Pending    $248,400 USD · AED 184k    88 Available Slots Left       62 Awaiting 1-on-1 Session      |
+--------------------------------------------------------------------------------------------------------------------+
| [ Search Org name, code, email, TRN... ] [ Type: All v ] [ Batch: All Batches v ] [ Payment: All v ] [ Status v ]  |
+--------------------------------------------------------------------------------------------------------------------+
| ORGANIZATION              | TYPE / CODE    | ACTIVE BATCHES     | SLOTS (USED/TOTAL) | PROGRESS SUMMARY  | BILLING |
+---------------------------+----------------+--------------------+--------------------+-------------------+---------+
| 🏫 Bright Minds Academy   | SCHOOL         | Sigma 1 (Apr 2027) | [████████░░] 28/30 | 28 Active         | PAID    |
| Dubai, UAE · Sarah Jenkins| WBM-ORG-0014   | + 1 more batch     | 2 Available Slots  | 14 in 1-on-1 · 9🎓| AED 54k |
+---------------------------+----------------+--------------------+--------------------+-------------------+---------+
| 🏥 NeuroWell Clinic       | RESELLER       | Sigma 1 (May 2027) | [██████████] 50/50 | 46 Active · 4 Inv | PAID    |
| London, UK · Dr. A. Patel | WBM-ORG-0018   |                    | 0 Available Slots  | 31 Exam Passed 🎓 | $15,750 |
+---------------------------+----------------+--------------------+--------------------+-------------------+---------+
| 🏢 Emirates Tech Corp     | CORPORATE      | Sigma 2 (Jun 2027) | [████░░░░░░] 12/30 | 12 Active         | NET-30  |
| Abu Dhabi · Omar Al-Maktoum| WBM-ORG-0021  |                    | 18 Available Slots | Due in 14 days    | AED 39k |
+--------------------------------------------------------------------------------------------------------------------+
```

### 7.3 View 2: Organization Detail Workspace (`apps/admin/app/users/organizations/[id]/page.tsx`)
When the WhatBoutMe Admin clicks on **Bright Minds Academy**, it opens the comprehensive Organization Detail Workspace.

The **Enrolled Students & Slot Tracker** is the primary focus tab so the Admin can immediately inspect every student under that organization and manage their **Steps, Live Attendance, 1-on-1 Session, Final Exam, and Certificate**.

```
+--------------------------------------------------------------------------------------------------------------------+
| <- Back to Organizations                                                                                           |
| 🏫 BRIGHT MINDS ACADEMY (WBM-ORG-0014)   [Status: ACTIVE]   [Reseller: YES]   [Co-Branded Cert: YES]               |
| Contact: Sarah Jenkins (sarah@brightminds.ae · +971 50 123 4567) · TRN: 100492819200003 · Manager: Roweena         |
|                                                         [+ Allocate New Batch Slots] [Invite Student] [Edit Org]   |
+--------------------------------------------------------------------------------------------------------------------+
| SLOT CAPACITY SUMMARY (BATCH: SIGMA 1 — APRIL 2027 COHORT)                                                         |
|  30 Total Paid Slots  =  24 Consumed (In Course)  +  2 Assigned (Pre-Consent)  +  2 Invited  +  2 Available Slots  |
|  Academic Funnel:  24 In Steps (1-11)  -->  18 Live Attended  -->  14 Completed 1-on-1  -->  11 Passed Exam  --> 9🎓|
+--------------------------------------------------------------------------------------------------------------------+
| WORKSPACE TABS:                                                                                                    |
| [ 👨‍🎓 Enrolled Students & Slots (30) ]  [ 📦 Batch Slot Pools (2) ]  [ 💳 Payments & Invoices ]  [ ⚙️ Settings & Logs ]|
+--------------------------------------------------------------------------------------------------------------------+
| FILTER SLOTS: [ Batch: Sigma 1 - Apr 2027 (30 Slots) v ] [ Slot Status: All (30) v ] [ Gate: All Stages v ]        |
|               [ Search Student Name, Email, Slot # or Receipt Ref... ]            [Export Org Progress Report CSV] |
+--------------------------------------------------------------------------------------------------------------------+
| SLOT # | STUDENT DETAILS       | AGREEMENT | 11 STEPS &     | LIVE      | 1-ON-1 SESSION | FINAL EXAM | CERTIFICATE|
| & REF  |                       | (GATE 1)  | MISSION (G2)   | SESSIONS  | (GATE 4 - WBM) | (GATE 5)   | (GATE 6)   |
+--------+-----------------------+-----------+----------------+-----------+----------------+------------+------------+
| #01    | Amina Al-Mansoor      | ✓ Signed  | Step 11/11     | ✓ 2/2     | ✓ Completed    | ✓ Passed   | 🎓 ISSUED  |
| CONSUM | amina@brightminds.ae  | 02 Apr 27 | [██████] 100%  | Attended  | 18 Apr (Roweena| 92% (1/3)  | WBM-C-8821 |
| Ref:101| Dept: Grade 4         |           | Mission: Appr. |           | [View Notes]   |            | [Download] |
+--------+-----------------------+-----------+----------------+-----------+----------------+------------+------------+
| #02    | Liam O'Connor         | ✓ Signed  | Step 11/11     | ✓ 2/2     | 📅 Scheduled   | ⏳ Ready   | 🔒 Pending |
| CONSUM | liam@brightminds.ae   | 02 Apr 27 | [██████] 100%  | Attended  | 29 Apr, 14:00  | Unlocked   | Gates 4&5  |
| Ref:102| Dept: Sciences        |           | Mission: Appr. |           | [Mark Done ✓]  |            |            |
+--------+-----------------------+-----------+----------------+-----------+----------------+------------+------------+
| #03    | Priya Nair            | ✓ Signed  | Step 6/11      | 1/2       | ⚪ Not Booked  | 🔒 Locked  | 🔒 Locked  |
| CONSUM | priya@brightminds.ae  | 03 Apr 27 | [███░░░] 54%   | Attended  | [Schedule 1:1] | At Step 6  |            |
| Ref:103| ⚠️ Inactive 9 days    |           | Active 9d ago  |           |                |            |            |
+--------+-----------------------+-----------+----------------+-----------+----------------+------------+------------+
| #27    | tarek@brightminds.ae  | ⏳ Pending| 🔒 Locked      | -         | -              | -          | [Resend]   |
| INVITED| Sent 25 Apr (Exp 10d) | Not Signed|                |           |                |            | [Revoke]   |
+--------+-----------------------+-----------+----------------+-----------+----------------+------------+------------+
| #29    | — EMPTY AVAILABLE SLOT — Ready for Organization to Assign or Sell                                         |
| AVAIL  | Batch: Sigma 1 (Apr 2027)                                                       [+ Assign Student to #29] |
+--------------------------------------------------------------------------------------------------------------------+
```

### 7.4 Direct WhatBoutMe Admin Actions Inside the Organization Student Row
Clicking the action menu (`⋯`) on any student row inside the Admin Organization view allows WhatBoutMe staff to execute:
1. **View Full Student Drawer**: Inspect detailed step-by-step watch times, quiz attempts, and signed agreement PDF.
2. **Manage 1-on-1 Session (`Schedule` / `Mark Completed` / `Record No-Show` / `Add Faculty Note`)**: Updates the student's Gate 4 status immediately.
3. **Unlock Next Step / Approve Mission Statement**: Standard WhatBoutMe academic controls.
4. **Reset Exam Attempts**: Grant an additional attempt if a student failed 3/3 times.
5. **Issue / Download Certificate**: Trigger or download the official WhatBoutMe Certificate.
6. **Goodwill Reclaim Slot (`CONSUMED -> AVAILABLE`)**: Prompts for a mandatory audit reason, revokes the dropped student's enrolment, and frees the numbered slot back to the Organization.

---

## 8. Organization Person Portal Blueprint (`apps/lms/app/org`)

The Organization Portal lives inside `apps/lms/app/org` so that any Organization Owner, HR Admin, or Reseller Manager logs in through the unified WhatBoutMe authentication system and sees a dedicated **"Organization Portal"** workspace.

### 8.1 Core Views for the Organization Person
1. **Executive Overview (`/org`)**:
   - **Batch Slot Selector**: Switch between all purchased batches or view aggregate metrics.
   - **Slot Utilization Cards**: `30 Purchased` $\cdot$ `26 Active Learners` $\cdot$ `2 Pending Invites` $\cdot$ `2 Available Slots to Sell/Assign`.
   - **6-Gate Cohort Funnel**: Visual breakdown showing how many of their 30 students are in Agreement, Steps 1–11, Live Workshop, 1-on-1 Session, Final Exam, and Certified by WhatBoutMe.
   - **At-Risk Students Alert**: Quick list of students who haven't logged in for $\ge 7$ days with a 1-click **"Send Encouragement Nudge"** button.
2. **Manage 30 Slots & Student Progress (`/org/learners`)**:
   - Displays all numbered slots (`Slot #01` to `Slot #30`).
   - For **Available Slots**: Button to **"Assign Student (Email Invite)"** or **"Generate Slot Voucher Code"**, with fields for Student Name, Email, Phone, Department/Cohort Tag, and **External Order/Receipt Reference** (so resellers can record their own sale receipt number!).
   - For **Invited / Pre-Agreement Slots**: 1-click **"Resend Invite"** or **"Revoke & Free Slot"** (instantly returns the slot to `AVAILABLE`).
   - For **Active / Consumed Slots**: Live read-only tracking of Step Progress (`Step X/11`), Live Workshop Attendance, **1-on-1 Session Status with WhatBoutMe**, Final Exam Status, and **Download Official WhatBoutMe Certificate PDF**.
   - **Bulk CSV Onboarding**: Drag-and-drop CSV uploader with instant dry-run validation preview to fill all 30 slots in 10 seconds.
3. **Purchase Batch Slots & Payment Center (`/org/seats` & `/org/billing`)**:
   - **"Buy Batch Slots" Self-Serve Wizard**:
     1. Select Accredited Course (e.g., *Sigma 1*).
     2. Select Upcoming Batch (shows real-time remaining batch capacity, start date, and live session schedule).
     3. Select Number of Student Slots (e.g., `30 Slots`) — interactive calculator automatically applies volume tier discount (`USD`, `AED`, or `INR`).
     4. Choose Payment Option: **Pay Online Now** (Instant activation via Gateway / `TEST_BYPASS`) OR **Request Institutional Tax Invoice (Net-30 PO)**.
   - **Invoices & Receipts Ledger**: View payment statuses, pay pending Admin-issued invoices via 1-click **"Pay Invoice Now"**, and download official WhatBoutMe FZE Tax Invoices and Receipts.

---

## 9. Public Marketing Landing Page (`/organizations`) & Self-Serve Onboarding

### 9.1 `/organizations` Landing Page (`apps/marketing/src/app/organizations/page.tsx`)
Designed using the existing WhatBoutMe luxury dark/gold/emerald aesthetic:
1. **Hero Section**: *"Empower Your School, Clinic, or Organization with Accredited Brain-Health Licensing — Purchase Batch Slots, Enroll Your Students, and Let WhatBoutMe Certify Every Learner."*
   - Dual CTAs: **[Buy Batch Slots Now (Self-Serve)]** and **[Book Enterprise Discovery Call]**.
2. **How It Works (4-Step Visual Timeline)**:
   - **Step 1: Reserve Batch Slots** — Purchase 5 to 500+ student slots in an upcoming cohort (or request a private batch).
   - **Step 2: Distribute or Resell Slots** — Invite your staff/students via CSV, single invite, or single-use reseller voucher codes.
   - **Step 3: WhatBoutMe Delivers the Full Program** — We host the 11 neuroscience steps, live workshops, **1-on-1 mentorship sessions**, and final examination.
   - **Step 4: Real-Time Tracking & Official Certification** — Track every student's progress in your Organization Portal while WhatBoutMe issues verifiable, co-branded certificates.
3. **Interactive Volume Pricing Calculator**:
   - Slider from 5 to 100+ slots with currency switcher (`USD` / `AED` / `INR`), displaying per-slot price, total investment, and percentage saved.
4. **Dual Conversion Section**:
   - **Tab A: Instant Organization Account & Batch Checkout** — Creates Organization account and goes straight to batch slot selection and online payment.
   - **Tab B: Institutional / Net-30 Enquiry Form** — Submits a high-priority `ORGANIZATION` lead directly into the Admin CRM.

### 9.2 Branded Student Slot Redemption Page (`/org-invite/[token]`)
When a student clicks their invite link or enters their slot voucher code:
1. Displays a co-branded welcome card: **WhatBoutMe Logo + Sponsoring Organization Logo** (*"Bright Minds Academy has allocated Slot #04 for you in Sigma 1 — April 2027 Cohort"*).
2. If the student is new, they set their password and phone number on the spot; if they already have a WhatBoutMe account, they sign in.
3. Immediately transitions `Seat` to `ASSIGNED` and redirects them into the LMS **Gate 1: Digital Workshop & Organization Data-Sharing Consent Screen**.

---

## 10. Complete NestJS Backend API Contract (`apps/api/src/modules/organizations`)

### 10.1 Module Architecture
```
apps/api/src/modules/organizations/
├── organizations.module.ts
├── admin-organizations.controller.ts       # /admin/organizations/** (Staff Control Plane)
├── org-portal.controller.ts                # /org/:orgId/** (Organization Person Portal Plane)
├── org-onboarding.controller.ts            # /org/register (Self-Serve Org Signup & Checkout)
├── org-invites.controller.ts               # /org-invites/** (Public Token & Voucher Claim Plane)
├── organizations.service.ts                # Org CRUD, members, settings, suspension
├── seat-pools.service.ts                   # Batch capacity locks, pricing tiers, slot generation
├── seats.service.ts                        # Slot assignment, CSV preflight, vouchers, revokes, reclaims
├── org-academic-tracker.service.ts         # 6-Gate progress aggregation & 1-on-1 session updates
├── guards/
│   ├── org-scope.guard.ts                  # Multi-tenant isolation guard
│   └── org-role.guard.ts                   # OWNER / ADMIN / VIEWER enforcement
└── dto/
    ├── create-organization.dto.ts
    ├── self-register-organization.dto.ts
    ├── create-seat-pool.dto.ts
    ├── assign-seat.dto.ts
    ├── bulk-invite.dto.ts
    ├── update-one-on-one.dto.ts
    └── reclaim-seat.dto.ts
```

### 10.2 Complete Endpoints Specification

#### A. WhatBoutMe Admin Control Plane (`/admin/organizations`)
| Method & Path | Role | Description |
|---|---|---|
| `GET /admin/organizations` | `ADMIN`+ | Paginated directory of organizations with slot utilization, active batches, revenue totals by currency, and 6-gate learner summary counts. |
| `POST /admin/organizations` | `ADMIN`+ | Create an Organization (from Lead or direct deal) and invite the primary Organization Owner. |
| `GET /admin/organizations/:id` | `ADMIN`+ | Complete detail payload: Organization profile, KPIs, SeatPools, Billing/Invoices, Team Members, and Audit Logs. |
| `GET /admin/organizations/:id/students` | `ADMIN`+ | Paginated list of all numbered `Seat` slots and enrolled students under this Organization with full **6-Gate status (Agreement, Step X/11, Live Attendance, 1-on-1 Session, Exam, Certificate)**. |
| `PATCH /admin/organizations/:id` | `ADMIN`+ | Update profile, tax ID, reseller status, certificate co-branding, and allowed domains. |
| `POST /admin/organizations/:id/seat-pools` | `ADMIN`+ | Allocate a new batch slot pool (Online payment link, Net-30 Invoice, or Super Admin Complimentary). |
| `POST /admin/seat-pools/:id/mark-paid` | `ADMIN`+ | Record offline wire transfer / check payment, generate receipt, and transition `SeatPool` to `ACTIVE`. |
| `POST /admin/seats/:seatId/reclaim` | `ADMIN`+ | **Admin Goodwill Reclaim**: Revoke a `CONSUMED` slot with mandatory `reason`, cancel old enrolment, and reset slot to `AVAILABLE`. |
| `PATCH /admin/enrolments/:enrolmentId/one-on-one` | `ADMIN`+ | Schedule, mark `COMPLETED`, mark `NO_SHOW`, or attach faculty notes to an organization student's **1-on-1 Session**. |

#### B. Organization Person Portal Plane (`/org`) — Protected by `OrgScopeGuard`
| Method & Path | Org Role | Description |
|---|---|---|
| `POST /org/register` | Public | Self-serve Organization registration + initial Owner account creation. |
| `GET /org/me` | Any Member | List organizations the logged-in user belongs to + active role permissions. |
| `GET /org/:orgId/overview` | `VIEWER`+ | Executive KPIs, batch selector, slot utilization breakdown, 6-gate funnel, and at-risk learner counts. |
| `GET /org/:orgId/slots` | `VIEWER`+ | All numbered slots (`Slot #01..#N`) for the organization with student details, external receipt ref, and live 6-Gate progress (Steps, Live, 1-on-1, Exam, Certificate). |
| `GET /org/:orgId/slots/export` | `VIEWER`+ | Export full CSV compliance & progress report for board/HR review. |
| `POST /org/:orgId/slots/:seatId/assign` | `ADMIN`+ | Assign a specific `AVAILABLE` slot to a student (sends invite email or generates voucher code) and saves `externalOrderRef` / `department`. |
| `POST /org/:orgId/invites/preflight` | `ADMIN`+ | Dry-run bulk CSV validator (checks email syntax, duplicates, existing enrolments, and remaining `AVAILABLE` slots). |
| `POST /org/:orgId/invites/bulk` | `ADMIN`+ | Atomic bulk slot assignment using `FOR UPDATE SKIP LOCKED` on `AVAILABLE` slots. |
| `POST /org/:orgId/slots/:seatId/resend` | `ADMIN`+ | Resend invitation email (throttled to max 3 resends per 24h). |
| `POST /org/:orgId/slots/:seatId/revoke` | `ADMIN`+ | Revoke an `INVITED` or `ASSIGNED` (pre-agreement) slot and immediately return it to `AVAILABLE`. |
| `POST /org/:orgId/nudge-inactive` | `ADMIN`+ | Queue encouragement emails to selected inactive/at-risk learners. |
| `GET /org/:orgId/batches/available` | `OWNER` | List upcoming batches with real-time available slot capacity and volume pricing schedule. |
| `POST /org/:orgId/seat-pools/checkout` | `OWNER` | Initiate self-serve online purchase for a batch slot pool (creates 15-min soft capacity hold + payment order) or pay a pending invoice. |
| `GET /org/:orgId/billing` | `OWNER` | List all SeatPool orders, payment history, and downloadable WhatBoutMe FZE Tax Invoice PDFs. |

---

## 11. 55 Battle-Tested Real-World Edge Cases & Recovery Matrix

In addition to the 45 standard edge cases (E1–E45) preserved from v2.0, Version 3.0 introduces **10 critical new edge cases (E46–E55)** covering Batch Slot Double-Counting, 1-on-1 Sessions, Reseller Vouchers, and Checkout Locks:

| ID | Edge Case Scenario | Trigger Event | Technical Handling & Database Action | User-Facing Result / Error Message |
|---|---|---|---|---|
| **E1** | **Simultaneous Slot Assignment Race** | Two Org Admins click "Assign" at the exact same millisecond when 2 slots remain. | `SELECT ... FROM "Seat" WHERE status = 'AVAILABLE' ORDER BY "slotNumber" LIMIT 1 FOR UPDATE SKIP LOCKED` assigns `Slot #29` to Admin 1 and `Slot #30` to Admin 2 without lock contention. | Both succeed cleanly with zero collision. |
| **E2** | **Already Enrolled Learner (Self-Paid)** | Org attempts to assign a slot to a student who already bought the same program privately. | Preflight & assign service check `Enrolment` uniqueness (`userId + programId`). Blocks assignment so the Org does not waste a paid slot. | *"This student is already enrolled in this program independently. Slot #14 was not used."* |
| **E3** | **Dual Organization Sponsorship Conflict** | Org B tries to enroll a student already actively sponsored by Org A in the same program. | Blocked by `@@unique([userId, programId])` check during preflight and claim. | *"Learner is already enrolled in this program under another sponsorship."* |
| **E4** | **CSV Formatting & Formula Injection** | Uploaded CSV has mixed-case emails, whitespace, duplicate rows, or Excel formula payloads (`=cmd|...`). | Normalizes emails via `.trim().toLowerCase()`, deduplicates rows in preview, and strips leading `=`, `+`, `-`, `@` characters from names/departments. | Live preview table flags duplicate rows and sanitizes unsafe strings automatically. |
| **E5** | **Invite Link Forwarding / Hijacking** | Student A forwards their email invite link to Friend B who logs in with `friendB@gmail.com`. | For `EMAIL_INVITE` mode, claim endpoint compares authenticated user email with `invite.email` (case-insensitive). | *"This slot invitation is reserved for studentA@company.com. Please sign in with that email address."* (HTTP 403). |
| **E6** | **Unclaimed Invite Expiry (14 Days)** | Student never clicks the invite link within 14 days. | Hourly BullMQ job marks `OrganizationInvite` expired and transitions the `Seat` from `INVITED` back to `AVAILABLE`. | Slot automatically returns to `Available` in the Org Portal so the Org can assign it to someone else. |
| **E7** | **Typo in Student Email Address** | Org Admin types `sara@gmial.com` by mistake. | Org Admin clicks **Edit Email / Revoke Slot** on the `INVITED` row. Old token is invalidated, `Seat` resets to `AVAILABLE` (or immediately re-invites `sara@gmail.com`). | Instant self-service correction without contacting support. |
| **E8** | **Reseller Tries to Revoke a Student Who Finished the Course** | A reseller tries to revoke `Slot #03` after the student watched 8 steps so they can resell the same slot twice. | API checks `Seat.status === 'CONSUMED'`. Self-service revocation is strictly forbidden once the student signs the Workshop Agreement. | *"Slot #03 is locked because the learner has signed the agreement and accessed course material. Contact WhatBoutMe Admin for emergency replacements."* |
| **E9** | **Online Checkout Abandonment (15-Min Soft Lock)** | Org Owner starts online checkout for 30 slots in a 40-seat batch, then closes the browser tab. | `SeatPool` is created in `PENDING_PAYMENT` with `reservationExpiresAt = NOW() + 15 min`. After 15 minutes without a payment webhook, cron transitions pool to `CANCELLED`, releasing the 30 seats back to the Batch. | Batch is protected against overbooking during checkout, and protected against permanent capacity lockups if abandoned. |
| **E10** | **Late Payment Webhook After 15-Min Timeout** | Gateway processes an asynchronous bank redirect 18 minutes later, after the 15-min lock expired. | Webhook handler checks remaining batch capacity inside a row lock. If capacity $\ge 30$, activates pool and generates 30 slots. If another buyer took the last seats during minutes 15–18, flags `PAYMENT_REQUIRES_BATCH_ALLOCATION` and alerts Admin immediately. | Zero silent overbooking; automatic resolution or immediate priority Admin alert. |
| **E11** | **Partial Slot Refund (Unused Slots Only)** | Org bought 30 slots, used 20 (`CONSUMED`), and requests a refund for the 10 `AVAILABLE` slots. | Admin selects **Refund Unused Slots (10)**. System verifies 10 slots are `AVAILABLE`, deletes those 10 `Seat` rows, updates `totalSeats` from 30 to 20, generates an FZE Credit Note PDF, and processes partial refund. | 20 active students continue uninterrupted; batch frees 10 slots for the public. |
| **E12** | **Batch Capacity Reduction Guard** | Admin tries to lower a Batch's capacity from 50 to 25 when an Org already owns a 30-slot pool in that batch. | Batch update service computes $E_{\text{individual}} + S_{\text{org\_active}} + S_{\text{org\_checkout\_hold}}$. Rejects any `newCapacity < occupied`. | *"Cannot reduce batch capacity to 25: 30 organization slots and 4 individual seats are already reserved (minimum 34)."* |
| **E13** | **Cohort Rescheduling / Batch Transfer** | WhatBoutMe moves an organization's cohort from April to May. | Admin runs **Transfer SeatPool Batch**: updates `SeatPool.batchId` and all associated `Enrolment.batchId` rows in one transaction, updating live workshop links automatically. | All 30 slots and enrolled students move seamlessly to the new batch schedule. |
| **E14** | **Organization Suspension for Overdue Net-30 Invoice** | Net-30 PO invoice is 15 days past due; Admin suspends the Organization. | `OrgScopeGuard` blocks the Org Portal from inviting new students or exporting reports, displaying a **Pay Overdue Invoice** banner. Already-enrolled students (`CONSUMED`) are **not** blocked from their classes unless Admin explicitly toggles learner freeze. | Protects revenue while avoiding unfair disruption to learners mid-session. |
| **E15** | **1-on-1 Session No-Show Handling** | An organization student books their 1-on-1 session with WhatBoutMe faculty but fails to attend. | WhatBoutMe Admin marks `oneOnOneStatus = 'NO_SHOW'`. Student receives an automated rebooking link; Org Portal shows status badge: `1-on-1: Missed (Awaiting Rebook)`. | Full visibility for the sponsoring organization on why the student isn't certified yet. |
| **E16** | **Certificate Blocked Until 1-on-1 & Exam Both Complete** | Student passes Step 11 and the Final Exam with 95%, but has not yet completed their mandatory 1-on-1 Session. | Certificate Issuance Gate verifies all 6 conditions: `Agreement Signed + 11 Steps Complete + Live Attendance Satisfied + oneOnOneStatus IN ('COMPLETED', 'WAIVED_BY_ADMIN') + Exam Passed`. Certificate remains `PENDING_1_ON_1` until faculty signs off. | Guarantees WhatBoutMe's strict accreditation standard for every organization student. |
| **E17** | **Voucher Code Brute-Force / Guessing** | Attacker tries to guess reseller slot voucher codes on `/org-invite/claim`. | Voucher codes use 80-bit Base32 cryptographic randomness (`WBM-XXXX-XXXX-XXXX`), stored as SHA-256 hashes, with Redis rate limiting of 5 attempts per 15 minutes per IP. | Mathematically unguessable and rate-limit protected. |
| **E18** | **Voucher Code Redeemed Twice** | Student shares their single-use voucher code with a colleague after redeeming it. | Upon first redemption, `Seat` transitions from `INVITED` to `ASSIGNED` in a locked transaction and binds to `userId`. Second attempt sees `status != 'INVITED'` and rejects. | *"This slot voucher code has already been redeemed."* |
| **E19** | **Double-Counting Batch Capacity Prevention** | Student claims `Slot #01` in a 30-seat pool for Batch X, creating an `Enrolment` in Batch X. | Batch capacity service excludes `Enrolment` rows where `fundingSource == 'ORG_SPONSORED'` because their capacity is already accounted for by `SeatPool.totalSeats`. | Batch capacity stays rock-solid at 30/40 instead of erroneously jumping to 31/40. |
| **E20** | **Privacy Isolation of Student Notes & Reflections** | Clinic or HR Admin inspects network payloads on `GET /org/:orgId/slots` to try to read a student's private therapy/workshop reflections. | DTO serializer and Prisma `select` projection strictly omit `StudentNote`, `Message`, and raw `MissionStatementSubmission.content` at the database query layer. | Zero private psychological or reflective data leakage to employers or resellers. |

*(All additional edge cases from v2.0—including GDPR erasure preserving consumed slot ledger counts, multi-currency separation, optimistic concurrency on top-ups, and historical sponsor name snapshots on issued certificates—remain strictly enforced.)*

---

## 12. Autonomous Implementation Roadmap (6 Verifiable Phases)

### Phase 0: Database Schema & Migration (`apps/api/prisma`)
1. Add the new enums (`OrganizationStatus`, `OrganizationType`, `OrgMemberRole`, `SeatPoolStatus`, `SeatPaymentMethod`, `SeatStatus`, `SeatRedemptionMode`, `FundingSource`, `OneOnOneSessionStatus`) and models (`Organization`, `OrganizationMember`, `SeatPool`, `Seat`, `OrganizationInvite`) plus model extensions (`Enrolment`, `Batch`, `Payment`, `Invoice`) to `apps/api/prisma/schema.prisma`.
2. Run `npx prisma generate` and create migration.
3. Update `apps/api/prisma/seed.ts` to seed two realistic demo organizations (*"Bright Minds Academy"* with 30 slots and *"NeuroWell Reseller Clinic"* with 20 slots) across all 6 academic gates.

### Phase 1: Core Backend Engine, Capacity Math & Guards (`apps/api`)
1. Implement `OrgScopeGuard` and `OrgRoleGuard`.
2. Implement `SeatPoolsService` with 15-minute checkout soft-locks, volume tier pricing calculator, and automatic generation of numbered `Seat` rows (`Slot #01..#N`) upon pool activation.
3. Update `BatchesService` and `EnrollmentsService` to implement the **Single-Count Batch Slot Reservation Formula** ($E_{\text{individual}} + S_{\text{org\_active}} + S_{\text{org\_checkout\_hold}}$).
4. Extend `PaymentsService` webhook handler for `targetType: 'SEAT_POOL'` and `InvoicesService` for FZE Tax Invoice generation.

### Phase 2: Slot Assignment, CSV Bulk Inviter, Vouchers & 6-Gate Tracker (`apps/api`)
1. Implement `SeatsService` using `FOR UPDATE SKIP LOCKED` for single assignments, bulk CSV preflight/commit, voucher code generation, pre-agreement slot revocation, and Admin Goodwill Reclaim.
2. Implement `OrgAcademicTrackerService` aggregating Gate 1 (Agreement), Gate 2 (11 Steps & Mission Statement), Gate 3 (Live Attendance), Gate 4 (**1-on-1 Session Status**), Gate 5 (Exam), and Gate 6 (WhatBoutMe Certificate).
3. Extend the LMS Agreement signing endpoint to record `orgDataSharingConsentedAt` and transition `Seat.status` from `ASSIGNED` to `CONSUMED`.

### Phase 3: Admin Panel — `Users & Enrolments -> Organizations` (`apps/admin`)
1. Add the `[ People ]` / `[ Organizations ]` segmented navigation header in `apps/admin/app/users/page.tsx` and add the Organization badge to the People table.
2. Build `apps/admin/app/users/organizations/page.tsx` (Organizations Directory, KPIs, search/filters, "+ Create Organization" modal).
3. Build `apps/admin/app/users/organizations/[id]/page.tsx` featuring the **Enrolled Students & Slot Tracker** table with live 6-Gate columns (Agreement, Steps 1–11, Live Attendance, **1-on-1 Session Manager**, Final Exam, Certificate) and the "+ Allocate Batch Slots" / "Goodwill Reclaim" modals.

### Phase 4: Organization Person Portal (`apps/lms/app/org`)
1. Add conditional **"Organization Portal"** navigation in the LMS sidebar for users with `orgMemberships` (plus a link to `/org/register` for new organizations).
2. Build `/org` (Executive Dashboard & 6-Gate Funnel), `/org/learners` (Numbered Slot Manager, Single Assign, Voucher Generator, Drag-and-Drop CSV Inviter, Progress Tracker & Certificate Downloader), `/org/seats` (Self-Serve Batch Slot Purchase & Top-Up Checkout), and `/org/billing` (Invoices & Online Payment).

### Phase 5: Marketing Page, Invite Redemption & Co-Branded Certificates (`apps/marketing` & `apps/api`)
1. Build `/organizations` landing page with the interactive batch slot pricing calculator, self-serve registration flow, and enterprise enquiry form.
2. Build `/org-invite/[token]` and `/org-invite/claim` (voucher code) redemption pages.
3. Update `CertificatesService` PDF renderer and `/verify/[certId]` page to display `"Accredited & Issued by WhatBoutMe · Sponsored by [Organization Name]"` when `showSponsorOnCertificate` is enabled.
4. Run full `turbo run check-types` and Vitest concurrency & lifecycle test suites.

---

## 13. Architectural Decision Record (ADR)

1. **Decision: Evolve `Company` to `Organization` with Additive Memberships**  
   *Context*: The schema contained a minimal `Company` model and `User.companyId` foreign key that was unused except in JWT token passing.  
   *Decision*: Evolve `Company` into `Organization` and introduce `OrganizationMember` to support multi-admin setups, role separation (`OWNER`, `ADMIN`, `VIEWER`), and individuals who belong to multiple organizations or act as both HR admins and active learners.
2. **Decision: Seat Consumption Bound to Digital Agreement Execution**  
   *Context*: When does a seat become non-refundable / burned?  
   *Decision*: Exactly when the learner signs the Digital Agreement. Prior to this, zero course content or intellectual property has been delivered, making seat revocation fair and frictionless. Once signed, Step 1 unlocks, anti-skip video tracking starts, and the seat is permanently consumed.
3. **Decision: LMS-Hosted Org Portal (`apps/lms/app/org`)**  
   *Context*: Should the Org Portal be a 5th Next.js application or embedded in LMS?  
   *Decision*: Embedded directly in `apps/lms`. Avoids deployment fragmentation, extra domain configurations, CORS issues, and cookie synchronization overhead while delivering a unified experience for users who are both org managers and learners.
4. **Decision: WhatBoutMe Retains Exclusive Academic & Certification Sovereignty**  
   *Context*: Can organizations create private quizzes or grant custom certificates?  
   *Decision*: Absolutely not. WhatBoutMe is an accredited brain-health credentialing body. Organizations buy bulk access and monitor team progress; academic evaluation, 1-on-1 sessions, and certificate issuance remain 100% under WhatBoutMe's verified engine.
5. **Decision: Pre-Materialized Numbered Slots (`Slot #01..#N`) & Concurrency with `SKIP LOCKED`**  
   *Context*: How to ensure instantaneous, deadlock-free slot assignments when multiple HR staff or resellers allocate seats simultaneously?  
   *Decision*: When a 30-slot pool is activated, 30 numbered `Seat` rows are immediately created. Assignments query `SELECT ... FROM "Seat" WHERE status = 'AVAILABLE' ORDER BY "slotNumber" LIMIT K FOR UPDATE SKIP LOCKED`, eliminating lock contention and providing a clear visual slot grid in the Admin and Org Portals.
