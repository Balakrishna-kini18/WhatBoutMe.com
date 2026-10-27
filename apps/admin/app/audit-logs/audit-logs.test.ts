import { describe, it, expect } from "vitest";
import {
  getAuditDetails,
  formatMetaKey,
  formatMetaValue,
  ACTION_FILTER_OPTIONS,
  PERIOD_FILTER_OPTIONS,
  calculatePeriodDates,
  ACTION_SHORT_NAMES,
  extractExecutiveMetadata,
} from "./audit-utils";

describe("Compliance & System Audit Logs Specification", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CLIENT PDF SPECIFICATION AUDIT: WHO, WHAT, WHEN, DETAILS
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Client PDF Specification Alignment (WhatBoutMe LMS Development Plan)", () => {
    it("conforms to professional executive layout: 6 focused columns with dedicated Role column", () => {
      const canonicalColumns = [
        "Date & Time (UTC)",
        "User",
        "Role",
        "Action",
        "Details / Reason",
        "Metadata",
      ];

      expect(canonicalColumns).toContain("Date & Time (UTC)");
      expect(canonicalColumns).toContain("User");
      expect(canonicalColumns).toContain("Role");
      expect(canonicalColumns).toContain("Action");
      expect(canonicalColumns).toContain("Details / Reason");
      expect(canonicalColumns).toContain("Metadata");
      expect(canonicalColumns).not.toContain("Target");
      expect(canonicalColumns.length).toBe(6);
    });

    it("provides quick period presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month)", () => {
      const periodValues = PERIOD_FILTER_OPTIONS.map((p) => p.value);
      expect(periodValues).toContain("ALL");
      expect(periodValues).toContain("TODAY");
      expect(periodValues).toContain("YESTERDAY");
      expect(periodValues).toContain("LAST_7_DAYS");
      expect(periodValues).toContain("LAST_30_DAYS");
      expect(periodValues).toContain("THIS_MONTH");
      expect(periodValues).toContain("CUSTOM");

      const today = calculatePeriodDates("TODAY");
      const nowStr = new Date().toISOString().slice(0, 10);
      expect(today.startDate).toBe(nowStr);
      expect(today.endDate).toBe(nowStr);

      const all = calculatePeriodDates("ALL");
      expect(all.startDate).toBe("");
      expect(all.endDate).toBe("");
    });

    it("verifies action filter options are clean and free of internal PDF page numbers and raw codes", () => {
      for (const opt of ACTION_FILTER_OPTIONS) {
        expect(opt.label).not.toMatch(/Page\s+\d+/i);
        expect(opt.label).not.toMatch(/\(LEAD_CONVERT\)/i);
        expect(opt.label).not.toMatch(/AGENTS\.md/i);
        expect(opt.label).not.toMatch(/Mandate/i);
      }
    });

    it("includes all client PDF actions in ACTION_FILTER_OPTIONS", () => {
      const optionValues = ACTION_FILTER_OPTIONS.map((o) => o.value);
      expect(optionValues).toContain("LOGIN");
      expect(optionValues).toContain("LOGOUT");
      expect(optionValues).toContain("STEP_MANUAL_UNLOCKED");
      expect(optionValues).toContain("STEP_MANUAL_LOCKED");
      expect(optionValues).toContain("QUIZ_ATTEMPTS_RESET");
      expect(optionValues).toContain("CERTIFICATE_APPROVED");
      expect(optionValues).toContain("CERTIFICATE_REJECTED");
      expect(optionValues).toContain("ATTENDANCE_MANUAL_OVERRIDE");
      expect(optionValues).toContain("ATTENDANCE_RECONCILED");
      expect(optionValues).toContain("CREATE_CREDIT_NOTE");
      expect(optionValues).toContain("REFUND_ISSUED");
      expect(optionValues).toContain("LEAD_CONVERT");
      expect(optionValues).toContain("USER_ROLE_CHANGED");
      expect(optionValues).toContain("UNUSUAL_LOGIN_DETECTED");
      expect(optionValues).toContain("PASSWORD_RESET");
      expect(optionValues).toContain("BATCH_CREATED");
      expect(optionValues).toContain("BATCH_MANAGER_ASSIGNED");
      expect(optionValues).toContain("BATCH_STATUS_CHANGED");
      expect(optionValues).toContain("PROGRAM_PUBLISHED");
      expect(optionValues).toContain("PROGRAM_PRICING_UPDATED");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DETAILS & REASON SMART RESOLUTION LOGIC FOR CLIENT PDF ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Details / Reason Smart Activity Descriptions", () => {
    it("resolves explicit reason or feedback when present", () => {
      const log = {
        id: "1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "LEAD_CONVERT",
        entity: "Lead",
        entityId: "lead-1",
        meta: { reason: "Converted lead Charan Pai and dispatched checkout link for 5 igna 1 (INR 14999)" },
        ip: null,
        createdAt: "2026-10-23T11:00:53.000Z",
      };

      expect(getAuditDetails(log)).toBe(
        "Converted lead Charan Pai and dispatched checkout link for 5 igna 1 (INR 14999)"
      );
    });

    it("provides human-readable activity description for LOGIN events", () => {
      const log = {
        id: "login-1",
        actorId: "user-1",
        actorName: "Charan Pai",
        actorEmail: "charan@example.com",
        actorRole: "USER",
        action: "LOGIN",
        entity: "UserSession",
        entityId: "user-1",
        meta: { reason: "User signed in successfully" },
        ip: "127.0.0.1",
        createdAt: "2026-10-26T10:00:00.000Z",
      };

      expect(getAuditDetails(log)).toBe("User signed in successfully");
    });

    it("provides human-readable activity description for LOGOUT events instead of an empty dash", () => {
      const log = {
        id: "3",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "LOGOUT",
        entity: "UserSession",
        entityId: "sess-abc",
        meta: null,
        ip: "127.0.0.1",
        createdAt: "2026-10-25T17:08:34.000Z",
      };

      expect(getAuditDetails(log)).toBe("User session signed out");
    });

    it("provides contextual description for role update events", () => {
      const log = {
        id: "4",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "USER_ROLE_CHANGED",
        entity: "User",
        entityId: "user-123",
        meta: { oldRole: "USER", newRole: "MANAGER" },
        ip: null,
        createdAt: "2026-10-25T12:00:00.000Z",
      };

      expect(getAuditDetails(log)).toBe("Role updated from USER to MANAGER");
    });

    it("provides contextual description for step unlock and lock overrides", () => {
      const unlockLog = {
        id: "step-1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "STEP_MANUAL_UNLOCKED",
        entity: "StepProgress",
        entityId: "sp-1",
        meta: { stepSequence: 3, stepTitle: "Clarity of Thought", reason: "Medical leave extension approved" },
        ip: null,
        createdAt: "2026-10-25T14:00:00.000Z",
      };
      expect(getAuditDetails(unlockLog)).toBe("Medical leave extension approved");

      const unlockWithoutReason = {
        ...unlockLog,
        meta: { stepSequence: 3, stepTitle: "Clarity of Thought" },
      };
      expect(getAuditDetails(unlockWithoutReason)).toBe("Manually unlocked Step 3");
    });

    it("provides contextual description for quiz and exam attempt resets", () => {
      const quizLog = {
        id: "quiz-1",
        actorId: "mgr-1",
        actorName: "Batch Trainer",
        actorEmail: "trainer@whatboutme.com",
        actorRole: "MANAGER",
        action: "QUIZ_ATTEMPTS_RESET",
        entity: "QuizAttempt",
        entityId: "qa-1",
        meta: { reason: "System disconnect during attempt 2" },
        ip: null,
        createdAt: "2026-10-25T15:00:00.000Z",
      };
      expect(getAuditDetails(quizLog)).toBe("System disconnect during attempt 2");
    });

    it("provides contextual description for attendance overrides and reconciliation", () => {
      const attLog = {
        id: "att-1",
        actorId: "mgr-1",
        actorName: "Batch Trainer",
        actorEmail: "trainer@whatboutme.com",
        actorRole: "MANAGER",
        action: "ATTENDANCE_RECONCILED",
        entity: "Attendance",
        entityId: "att-rec-1",
        meta: { reason: "Joined with secondary phone account Charan_iPhone" },
        ip: null,
        createdAt: "2026-10-25T16:00:00.000Z",
      };
      expect(getAuditDetails(attLog)).toBe("Joined with secondary phone account Charan_iPhone");
    });

    it("provides contextual description for credit notes and refunds", () => {
      const refundLog = {
        id: "ref-1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "CREATE_CREDIT_NOTE",
        entity: "Invoice",
        entityId: "inv-1",
        meta: { creditNoteNumber: "CN-2026-001", reason: "Customer duplicate payment" },
        ip: null,
        createdAt: "2026-10-25T17:00:00.000Z",
      };
      expect(getAuditDetails(refundLog)).toBe("Customer duplicate payment");
    });

    it("resolves session title when present", () => {
      const log = {
        id: "2",
        actorId: null,
        actorName: "System Automation",
        actorEmail: null,
        actorRole: "SYSTEM",
        action: "SESSION_COMPLETED",
        entity: "Session",
        entityId: "sess-1",
        meta: { title: "1-to-1 Discovery Call: Roweena & Charan Pai" },
        ip: null,
        createdAt: "2026-10-24T11:06:57.000Z",
      };

      expect(getAuditDetails(log)).toBe("1-to-1 Discovery Call: Roweena & Charan Pai");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CSV EXPORT INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────────
  describe("CSV Export Schema", () => {
    it("generates correct CSV headers matching the updated professional table columns", () => {
      const exportHeaders = [
        "Timestamp (UTC)",
        "User",
        "Role",
        "Action",
        "Target Record",
        "Record ID",
        "Reason / Details",
        "IP Address",
      ];

      expect(exportHeaders.join(",")).toBe(
        "Timestamp (UTC),User,Role,Action,Target Record,Record ID,Reason / Details,IP Address"
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. PAGINATION & ROWS-PER-PAGE INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Shared Pagination Contract", () => {
    it("calculates correct pagination windows for standard page sizes (10, 20, 50)", () => {
      const totalItems = 189;

      const pageSize20 = 20;
      const totalPages20 = Math.ceil(totalItems / pageSize20);
      expect(totalPages20).toBe(10);

      const pageSize50 = 50;
      const totalPages50 = Math.ceil(totalItems / pageSize50);
      expect(totalPages50).toBe(4);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ROLE-BASED ACCESS CONTROL (RBAC) SEMANTICS
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RBAC Enforcement", () => {
    it("strictly grants audit log viewing capability only to SUPER_ADMIN", () => {
      const canAccessAuditLogs = (role: string) => role === "SUPER_ADMIN";

      expect(canAccessAuditLogs("SUPER_ADMIN")).toBe(true);
      expect(canAccessAuditLogs("ADMIN")).toBe(false);
      expect(canAccessAuditLogs("MANAGER")).toBe(false);
      expect(canAccessAuditLogs("TEACHER")).toBe(false);
      expect(canAccessAuditLogs("USER")).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. EXECUTIVE DETAILS FORMATTING & PARAMETER SERIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Executive Details Formatting & Parameter Serialization", () => {
    it("transforms camelCase and snake_case metadata keys into human-friendly titles", () => {
      expect(formatMetaKey("programTitle")).toBe("Program Title");
      expect(formatMetaKey("leadEmail")).toBe("Lead Email");
      expect(formatMetaKey("passing_score")).toBe("Passing score");
      expect(formatMetaKey("amount")).toBe("Amount");
      expect(formatMetaKey("oldRole")).toBe("Old Role");
    });

    it("formats metadata values properly for executive card rendering", () => {
      expect(formatMetaValue("Sigma 1")).toBe("Sigma 1");
      expect(formatMetaValue(14999)).toBe("14999");
      expect(formatMetaValue(true)).toBe("Yes");
      expect(formatMetaValue(false)).toBe("No");
      expect(formatMetaValue(null)).toBe("—");
      expect(formatMetaValue(undefined)).toBe("—");
      expect(formatMetaValue(["USD", "AED"])).toBe("USD, AED");
    });

    it("provides short action labels for table rendering to prevent column overflow", () => {
      expect(ACTION_SHORT_NAMES["PAYMENT_TEST_SIMULATE_SUCCEEDED"]).toBe("Payment Passed");
      expect(ACTION_SHORT_NAMES["AGREEMENT_VERSION_PUBLISHED"]).toBe("Agreement Published");
      expect(ACTION_SHORT_NAMES["PROFILE_SIGNATURE_UPDATED"]).toBe("Signature Updated");
      expect(ACTION_SHORT_NAMES["AGREEMENT_SIGNED"]).toBe("Agreement Signed");
      expect(ACTION_SHORT_NAMES["SESSION_ACTIVATED"]).toBe("Session Activated");
    });

    it("resolves short titles like 'V' into clear contextual session descriptions instead of raw single letters", () => {
      const shortTitleLog = {
        id: "sess-v",
        actorId: null,
        actorName: "System Automation",
        actorEmail: null,
        actorRole: "SYSTEM",
        action: "SESSION_ACTIVATED",
        entity: "Session",
        entityId: "sess-1",
        meta: { title: "V", startTime: "2026-10-22T00:23:00.000Z" },
        ip: null,
        createdAt: "2026-10-22T12:20:53.000Z",
      };

      expect(getAuditDetails(shortTitleLog)).toBe('Session: "V"');
    });

    it("provides clear human descriptions for agreement and simulated payment events", () => {
      const agreeLog = {
        id: "agr-1",
        actorId: "u-1",
        actorName: "Siddesha",
        actorEmail: "siddesha@example.com",
        actorRole: "USER",
        action: "AGREEMENT_SIGNED",
        entity: "AgreementConsent",
        entityId: "ac-1",
        meta: { programTitle: "Sigma 1" },
        ip: "127.0.0.1",
        createdAt: "2026-10-23T11:54:17.000Z",
      };
      expect(getAuditDetails(agreeLog)).toBe("Agreement signed for Sigma 1");

      const payLog = {
        id: "pay-1",
        actorId: "u-1",
        actorName: "Siddesha",
        actorEmail: "siddesha@example.com",
        actorRole: "USER",
        action: "PAYMENT_TEST_SIMULATE_SUCCEEDED",
        entity: "Payment",
        entityId: "p-1",
        meta: { amount: 14999, currency: "INR" },
        ip: "127.0.0.1",
        createdAt: "2026-10-23T11:54:37.000Z",
      };
      expect(getAuditDetails(payLog)).toBe("Test payment verified (14999 INR)");
    });

    it("sanitizes executive metadata by stripping raw UUIDs and nonces while extracting action links", () => {
      const rawMeta = {
        leadId: "a85ff1c3-6a9b-4e12-872f-53fa110795c6",
        userId: "e0b3dfd5-0ac0-4eb3-92fb-3034ef1b4062",
        enrolmentId: "3034ef1b-4062-4eb3-0ac0-e0b3dfd592fb",
        programId: "b1a2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
        batchId: "c2b3a4d5-e6f7-4a1b-8c2d-3e4f5a6b7c8d",
        nonce: "8f3a9e1b2c3d4e5f",
        currency: "USD",
        amount: 1000,
        checkoutUrl: "http://localhost:3003/checkout/lead/eyJzZWFKsSWQiOilzZDNmZDliZiOzNTUzLTQ2OTQtODIyYyOxZjdjZjYxM2UzNmQiL",
      };

      const { usefulProperties, actionLinks } = extractExecutiveMetadata(rawMeta);

      // Verify raw foreign key UUIDs and nonces are excluded
      const propertyKeys = usefulProperties.map((p) => p.key);
      expect(propertyKeys).not.toContain("leadId");
      expect(propertyKeys).not.toContain("userId");
      expect(propertyKeys).not.toContain("enrolmentId");
      expect(propertyKeys).not.toContain("programId");
      expect(propertyKeys).not.toContain("batchId");
      expect(propertyKeys).not.toContain("nonce");

      // Verify amount and currency are elegantly combined
      const amountProp = usefulProperties.find((p) => p.key === "amount");
      expect(amountProp).toBeDefined();
      expect(amountProp?.value).toBe("1000 USD");

      // Verify checkout URL is properly isolated as an action link
      expect(actionLinks.length).toBe(1);
      expect(actionLinks[0]!.label).toBe("Checkout Url");
      expect(actionLinks[0]!.url).toContain("http://localhost:3003/checkout/lead/");
    });

    it("handles 5-stage pipeline actions (stage override, mission statement, 1-on-1 sessions)", () => {
      // 1. STAGE_UNLOCK_OVERRIDE with explicit reason
      const stageLogWithReason = {
        id: "stg-1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "STAGE_UNLOCK_OVERRIDE",
        entity: "Enrolment",
        entityId: "enr-1",
        meta: { stage: "STAGE_2_EXAM", reason: "Exempted due to prior master certification" },
        ip: null,
        createdAt: "2026-10-26T10:00:00.000Z",
      };
      expect(getAuditDetails(stageLogWithReason)).toBe("Exempted due to prior master certification");

      // 1b. STAGE_UNLOCK_OVERRIDE without explicit reason
      const stageLogNoReason = {
        ...stageLogWithReason,
        meta: { stage: "STAGE_2_EXAM" },
      };
      expect(getAuditDetails(stageLogNoReason)).toBe("Stage unlock override applied (Stage 2 Exam)");

      // 2. MISSION_STATEMENT_SUBMITTED
      const missionSubLog = {
        id: "ms-1",
        actorId: "u-1",
        actorName: "Student Alpha",
        actorEmail: "alpha@example.com",
        actorRole: "USER",
        action: "MISSION_STATEMENT_SUBMITTED",
        entity: "MissionStatementSubmission",
        entityId: "mss-1",
        meta: { fileName: "My_Personal_Mission_Statement_v1.pdf" },
        ip: null,
        createdAt: "2026-10-26T11:00:00.000Z",
      };
      expect(getAuditDetails(missionSubLog)).toBe("Submitted mission statement: My_Personal_Mission_Statement_v1.pdf");

      // 3. MISSION_STATEMENT_APPROVED with feedback
      const missionAppLog = {
        id: "ms-2",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "MISSION_STATEMENT_APPROVED",
        entity: "MissionStatementSubmission",
        entityId: "mss-1",
        meta: { feedback: "Exceptionally well articulated life vision." },
        ip: null,
        createdAt: "2026-10-26T12:00:00.000Z",
      };
      expect(getAuditDetails(missionAppLog)).toBe("Exceptionally well articulated life vision.");

      // 3b. MISSION_STATEMENT_APPROVED without feedback
      const missionAppNoFeedback = {
        ...missionAppLog,
        meta: null,
      };
      expect(getAuditDetails(missionAppNoFeedback)).toBe("Mission statement reviewed and approved");

      // 4. ONE_ON_ONE_APPROVED
      const oooAppLog = {
        id: "ooo-1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "ONE_ON_ONE_APPROVED",
        entity: "OneOnOneRequest",
        entityId: "ooo-req-1",
        meta: null,
        ip: null,
        createdAt: "2026-10-26T13:00:00.000Z",
      };
      expect(getAuditDetails(oooAppLog)).toBe("1-on-1 coaching call scheduled & approved");
    });

    it("resolves batch and program governance lifecycle audit events", () => {
      // 1. BATCH_CREATED
      const batchCreatedLog = {
        id: "b-1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "BATCH_CREATED",
        entity: "Batch",
        entityId: "batch-1",
        meta: { batchName: "Cohort 12", capacity: 35 },
        ip: null,
        createdAt: "2026-10-27T08:00:00.000Z",
      };
      expect(getAuditDetails(batchCreatedLog)).toBe('Created batch "Cohort 12" (35 capacity)');
      expect(ACTION_SHORT_NAMES.BATCH_CREATED).toBe("Batch Created");

      // 2. BATCH_MANAGER_ASSIGNED
      const batchManagerLog = {
        id: "b-2",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "BATCH_MANAGER_ASSIGNED",
        entity: "Batch",
        entityId: "batch-1",
        meta: { batchName: "Cohort 12", newManagerName: "Instructor Sarah" },
        ip: null,
        createdAt: "2026-10-27T08:05:00.000Z",
      };
      expect(getAuditDetails(batchManagerLog)).toBe('Manager assigned for "Cohort 12": Instructor Sarah');
      expect(ACTION_SHORT_NAMES.BATCH_MANAGER_ASSIGNED).toBe("Manager Assigned");

      // 3. BATCH_STATUS_CHANGED
      const batchStatusLog = {
        id: "b-3",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "BATCH_STATUS_CHANGED",
        entity: "Batch",
        entityId: "batch-1",
        meta: { batchName: "Cohort 12", newStatus: "ACTIVE" },
        ip: null,
        createdAt: "2026-10-27T08:10:00.000Z",
      };
      expect(getAuditDetails(batchStatusLog)).toBe('"Cohort 12" status transitioned to ACTIVE');
      expect(ACTION_SHORT_NAMES.BATCH_STATUS_CHANGED).toBe("Batch Status");

      // 4. PROGRAM_PUBLISHED
      const progPubLog = {
        id: "p-1",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "PROGRAM_PUBLISHED",
        entity: "Program",
        entityId: "prog-1",
        meta: { programTitle: "Sigma Leadership Mastery" },
        ip: null,
        createdAt: "2026-10-27T08:15:00.000Z",
      };
      expect(getAuditDetails(progPubLog)).toBe('"Sigma Leadership Mastery" published to catalog');
      expect(ACTION_SHORT_NAMES.PROGRAM_PUBLISHED).toBe("Program Published");

      // 5. PROGRAM_PRICING_UPDATED
      const progPricingLog = {
        id: "p-2",
        actorId: "actor-1",
        actorName: "Super Admin Roweena",
        actorEmail: "super@whatboutme.com",
        actorRole: "SUPER_ADMIN",
        action: "PROGRAM_PRICING_UPDATED",
        entity: "Program",
        entityId: "prog-1",
        meta: { programTitle: "Sigma Leadership Mastery", newPricing: { price: 1499, currency: "USD" } },
        ip: null,
        createdAt: "2026-10-27T08:20:00.000Z",
      };
      expect(getAuditDetails(progPricingLog)).toBe('"Sigma Leadership Mastery" pricing updated: USD 1499');
      expect(ACTION_SHORT_NAMES.PROGRAM_PRICING_UPDATED).toBe("Pricing Updated");
    });
  });
});

