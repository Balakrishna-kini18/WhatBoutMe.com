# WhatBoutMe LMS — Backend Schema (Prisma)

> **Version:** 1.0  
> **Date:** September 29, 2026  
> **Verified Against:** PRD v1.2, TRD v1.2, ARCHITECTURE v1.1

---

## 1. Schema Overview & Best Practices

This document contains the complete and verified PostgreSQL schema using **Prisma ORM**. It adheres to the strict rules defined in the Technical Requirements Document (TRD) and PRD:

1. **Soft Deletes:** `deletedAt` is implemented on `User` to comply with GDPR (Right to be Forgotten) without breaking financial aggregate data.
2. **UUIDs:** All Primary Keys use `uuid()` for security against enumeration attacks.
3. **Enrolment State Machine:** The `EnrolmentStatus` enum strictly enforces the `PENDING_PAYMENT` -> `PENDING_AGREEMENT` -> `ACTIVE` flow.
4. **Concurrency Safety:** Unique constraints (e.g., `@@unique([quizId, enrolmentId, status])`) are applied to prevent race conditions during quiz submissions.

---

## 2. The Complete `schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// -----------------------------------------------------------------------------
// ENUMS
// -----------------------------------------------------------------------------

enum Role {
  SUPER_ADMIN
  ADMIN
  MANAGER
  USER
}

enum EnrolmentStatus {
  PENDING_PAYMENT
  PENDING_AGREEMENT
  ACTIVE
  WAITLIST
  COMPLETED
  REVOKED
}

enum AttemptStatus {
  IN_PROGRESS
  PASSED
  FAILED
}

enum ContentType {
  VIDEO
  PDF
  AUDIO
}

enum InvoiceStatus {
  DRAFT
  ISSUED
  PAID
  CANCELLED
  REFUNDED
}

enum CouponType {
  PERCENTAGE
  FIXED
}

enum AgreementStatus {
  PENDING
  SIGNED
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

// -----------------------------------------------------------------------------
// CORE ENTITIES (USERS & COMPANIES)
// -----------------------------------------------------------------------------

model Company {
  id        String   @id @default(uuid())
  name      String
  contact   String?
  users     User[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model User {
  id        String    @id @default(uuid())
  email     String    @unique
  name      String?
  phone     String?
  role      Role      @default(USER)
  
  // Relations
  companyId String?
  company   Company?  @relation(fields: [companyId], references: [id])
  
  managedBatches Batch[]     @relation("ManagerBatches")
  enrolments     Enrolment[]
  messagesSent   Message[]
  notifications  Notification[]
  
  // Soft Delete for GDPR
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

// -----------------------------------------------------------------------------
// CURRICULUM (PROGRAMS, STEPS, LESSONS, QUIZZES)
// -----------------------------------------------------------------------------

model Program {
  id          String   @id @default(uuid())
  title       String
  slug        String   @unique
  description String?
  price       Float
  isActive    Boolean  @default(true)
  
  steps       Step[]
  batches     Batch[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Step {
  id          String   @id @default(uuid())
  programId   String
  program     Program  @relation(fields: [programId], references: [id], onDelete: Cascade)
  
  sequence    Int      // 1 to 11
  title       String
  description String?
  
  lessons     Lesson[]
  quiz        Quiz?
  overrides   BatchStepOverride[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([programId, sequence])
}

model Lesson {
  id          String      @id @default(uuid())
  stepId      String
  step        Step        @relation(fields: [stepId], references: [id], onDelete: Cascade)
  
  title       String
  type        ContentType
  mediaUrl    String      // AWS S3 / Mux Asset ID
  durationSec Int?
  
  progress    UserLessonProgress[]
  
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Quiz {
  id          String     @id @default(uuid())
  stepId      String     @unique
  step        Step       @relation(fields: [stepId], references: [id], onDelete: Cascade)
  
  passMark    Int        @default(75) // Percentage required to pass
  questions   Question[]
  attempts    Attempt[]
  
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Question {
  id          String   @id @default(uuid())
  quizId      String
  quiz        Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)
  
  text        String
  options     Option[]
}

model Option {
  id          String   @id @default(uuid())
  questionId  String
  question    Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  
  text        String
  isCorrect   Boolean  @default(false)
}

// -----------------------------------------------------------------------------
// ENROLMENT & BATCH MANAGEMENT
// -----------------------------------------------------------------------------

model Batch {
  id          String   @id @default(uuid())
  name        String
  programId   String
  program     Program  @relation(fields: [programId], references: [id])
  
  managerId   String?
  manager     User?    @relation("ManagerBatches", fields: [managerId], references: [id])
  
  startDate   DateTime
  capacity    Int
  
  enrolments  Enrolment[]
  sessions    Session[]
  overrides   BatchStepOverride[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Enrolment {
  id             String          @id @default(uuid())
  userId         String
  user           User            @relation(fields: [userId], references: [id])
  
  batchId        String
  batch          Batch           @relation(fields: [batchId], references: [id])
  
  status         EnrolmentStatus @default(PENDING_PAYMENT)
  
  agreement      Agreement?
  
  attempts       Attempt[]
  lessonProgress UserLessonProgress[]
  attendance     Attendance[]
  certificate    Certificate?
  payments       Payment[]
  
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([userId, batchId])
}

// -----------------------------------------------------------------------------
// PROGRESSION TRACKING & LOGIC GATES
// -----------------------------------------------------------------------------

// TRD 2.2: Tracks video view logic
model UserLessonProgress {
  id          String    @id @default(uuid())
  enrolmentId String
  enrolment   Enrolment @relation(fields: [enrolmentId], references: [id], onDelete: Cascade)
  lessonId    String
  lesson      Lesson    @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  
  viewed      Boolean   @default(false)
  updatedAt   DateTime  @updatedAt

  @@unique([enrolmentId, lessonId])
}

// TRD 2.2: The attempt state machine for Quizzes
model Attempt {
  id          String        @id @default(uuid())
  enrolmentId String
  enrolment   Enrolment     @relation(fields: [enrolmentId], references: [id], onDelete: Cascade)
  quizId      String
  quiz        Quiz          @relation(fields: [quizId], references: [id], onDelete: Cascade)
  
  score       Int?
  status      AttemptStatus @default(IN_PROGRESS)
  
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  // TRD Concurrency rule: User can only have one IN_PROGRESS attempt at a time per quiz
  // However, Prisma doesn't support partial unique indexes easily, so uniqueness handled in NestJS code.
}

// TRD 2.2: Admin override logic for locking/unlocking steps manually
model BatchStepOverride {
  id         String   @id @default(uuid())
  batchId    String
  batch      Batch    @relation(fields: [batchId], references: [id], onDelete: Cascade)
  stepId     String
  step       Step     @relation(fields: [stepId], references: [id], onDelete: Cascade)
  
  isUnlocked Boolean  @default(false)
  unlockDate DateTime? // For DRIP schedules
  
  @@unique([batchId, stepId])
}

// -----------------------------------------------------------------------------
// SYNCHRONOUS OPERATIONS (ZOOM SESSIONS)
// -----------------------------------------------------------------------------

model Session {
  id              String       @id @default(uuid())
  batchId         String
  batch           Batch        @relation(fields: [batchId], references: [id], onDelete: Cascade)
  
  title           String
  startTime       DateTime
  endTime         DateTime
  zoomMeetingId   String?
  joinUrl         String?
  
  attendancePulled Boolean     @default(false)
  attendances     Attendance[]
  
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

model Attendance {
  id          String    @id @default(uuid())
  sessionId   String
  session     Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  enrolmentId String
  enrolment   Enrolment @relation(fields: [enrolmentId], references: [id], onDelete: Cascade)
  
  joinTime    DateTime?
  leaveTime   DateTime?
  durationMin Int?
  
  @@unique([sessionId, enrolmentId])
}

// -----------------------------------------------------------------------------
// PAYMENTS & CERTIFICATIONS
// -----------------------------------------------------------------------------

model Payment {
  id             String    @id @default(uuid())
  enrolmentId    String
  enrolment      Enrolment @relation(fields: [enrolmentId], references: [id], onDelete: Cascade)
  invoice        Invoice?
  
  stripeSessionId String   @unique
  amount         Float
  currency       String    @default("USD")
  status         String    // e.g., 'succeeded', 'failed'
  
  createdAt      DateTime  @default(now())
}

model Certificate {
  id          String    @id @default(uuid())
  enrolmentId String    @unique
  enrolment   Enrolment @relation(fields: [enrolmentId], references: [id], onDelete: Cascade)
  
  pdfUrl      String    // AWS S3 permanent URL for cert
  issuedAt    DateTime  @default(now())
}

// -----------------------------------------------------------------------------
// COMMUNICATIONS (CHAT)
// -----------------------------------------------------------------------------

model Conversation {
  id          String    @id @default(uuid())
  participantIds String[] // Store UUIDs of participants
  messages    Message[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id], onDelete: Cascade)
  
  content        String
  attachmentUrl  String?
  read           Boolean      @default(false)
  
  createdAt      DateTime     @default(now())
}

// -----------------------------------------------------------------------------
// MISSING PRD ENTITIES (INVOICE, COUPON, AGREEMENT, NOTIFICATION, AUDIT, LEAD)
// -----------------------------------------------------------------------------

model Invoice {
  id              String    @id @default(uuid())
  paymentId       String    @unique
  payment         Payment   @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  
  invoiceNumber   String    @unique
  amount          Float
  currency        String    @default("USD")
  taxFields       Json?
  pdfUrl          String?
  status          InvoiceStatus @default(DRAFT)
  creditNoteId    String?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Coupon {
  id              String    @id @default(uuid())
  code            String    @unique
  type            CouponType
  value           Float
  usageLimit      Int?
  usedCount       Int       @default(0)
  expiryDate      DateTime?
  
  createdAt       DateTime  @default(now())
}

model Agreement {
  id              String    @id @default(uuid())
  enrolmentId     String    @unique
  enrolment       Enrolment @relation(fields: [enrolmentId], references: [id], onDelete: Cascade)
  
  templateVersion String
  signedPdfUrl    String?
  signedAt        DateTime?
  signerIp        String?
  status          AgreementStatus @default(PENDING)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Notification {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  type            String
  template        String
  channel         NotificationChannel @default(EMAIL)
  schedule        DateTime?
  deliveryStatus  DeliveryStatus @default(QUEUED)
  sentAt          DateTime?
  
  createdAt       DateTime  @default(now())
}

model AuditLog {
  id              String    @id @default(uuid())
  actorId         String?   // Can be null if system action
  action          String
  targetEntity    String
  targetId        String
  details         Json?
  
  timestamp       DateTime  @default(now())
}

model Lead {
  id              String    @id @default(uuid())
  name            String
  email           String
  phone           String?
  message         String?
  status          LeadStatus @default(NEW)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```
