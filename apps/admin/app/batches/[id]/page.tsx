"use client";

import { useEffect, useState, useMemo, use, useCallback } from "react";
import styles from "../../page.module.css";
import batchStyles from "./BatchDetail.module.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  API_URL,
  errorMessage,
  getBatchById,
  getBatchSessions,
  createSession,
  updateBatch,
  cancelEnrolment,
  resendEnrolmentPaymentLink,
  cachedFetch,
  apiGet,
  invalidateCache,
} from "../../lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  localWallTimeToUtc,
  utcToWallClock,
  formatWhenInTz,
  formatShortTimeInTz,
} from "../../lib/timezone";
import {
  CustomSelect,
  ConfirmDialog,
  InputDialog,
  ActionMenu,
  useToast,
  TableSkeleton,
  EmptyState,
  StatusBadge,
  Pagination,
  DatePicker,
  SortIndicator,
  type CustomSelectOption,
  type SortOrder,
} from "../../components";

interface EnrolledLearner {
  id: string; // enrolmentId
  userId: string;
  status: string;
  createdAt: string;
  signedAgreement?: { id: string; status: string; signedAt?: string } | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  stages?: {
    STAGE_1_CURRICULUM?: { isCompleted: boolean; isUnlocked: boolean; details?: any };
    STAGE_2_EXAM?: { isCompleted: boolean; isUnlocked: boolean; details?: any };
    STAGE_3_ATTENDANCE?: { isCompleted: boolean; isUnlocked: boolean; details?: any };
    STAGE_4_ONE_ON_ONE?: { isCompleted: boolean; isUnlocked: boolean; details?: any };
    STAGE_5_MISSION_STATEMENT?: { isCompleted: boolean; isUnlocked: boolean; details?: any };
  };
  progressionLoading?: boolean;
}

interface BatchSession {
  id: string;
  title: string;
  sessionType: "GROUP_COHORT" | "ONE_ON_ONE";
  capacity: number;
  meetingProvider?: string | null;
  durationMinutes?: number | null;
  minAttendanceMinutes?: number | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  recordingUrl: string | null;
  quizId: string | null;
  hostTrainer?: { id: string; name: string; email: string } | null;
  _count?: { attendances?: number; bookings?: number };
}

type BatchTab = "learners" | "sessions" | "broadcast" | "settings";
type LearnerSortField = "name" | "status" | "stage1" | "stage2" | "stage3" | "stage4" | "stage5";
type SessionSortField = "title" | "date" | "trainer" | "status";

export default function BatchManagementHubPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const batchId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();

  // Tab State (defaults to 'learners' as primary view)
  const [activeTab, setActiveTab] = useState<BatchTab>("learners");

  // Sync tab with URL query param if present
  useEffect(() => {
    const tabParam = searchParams.get("tab") as BatchTab;
    if (tabParam && ["learners", "sessions", "broadcast", "settings"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tab: BatchTab) => {
    setActiveTab(tab);
    router.replace(`/batches/${batchId}?tab=${tab}`, { scroll: false });
  };

  // Batch Data State
  const [batch, setBatch] = useState<any | null>(null);
  const [isLoadingBatch, setIsLoadingBatch] = useState(true);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Tab 1: Learners State
  const [learners, setLearners] = useState<EnrolledLearner[]>([]);
  const [learnerSearch, setLearnerSearch] = useState("");
  const [learnerStatusFilter, setLearnerStatusFilter] = useState("ALL");
  const [learnerPage, setLearnerPage] = useState(1);
  const [learnerPageSize, setLearnerPageSize] = useState(10);
  const [learnerSortField, setLearnerSortField] = useState<LearnerSortField>("name");
  const [learnerSortOrder, setLearnerSortOrder] = useState<SortOrder>("asc");

  // Tab 1 Sub-View: Confirmed Roster vs Incomplete/Unpaid Checkouts
  const [rosterSubView, setRosterSubView] = useState<"confirmed" | "pending_payment">("confirmed");
  const [releasingLearner, setReleasingLearner] = useState<EnrolledLearner | null>(null);
  const [isReleasingSeat, setIsReleasingSeat] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleLearnerSort = (field: LearnerSortField) => {
    if (learnerSortField === field) {
      setLearnerSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setLearnerSortField(field);
      setLearnerSortOrder("asc");
    }
  };
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"existing" | "new">("existing");
  const [newLearnerName, setNewLearnerName] = useState("");
  const [newLearnerEmail, setNewLearnerEmail] = useState("");
  const [newLearnerPhone, setNewLearnerPhone] = useState("");
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserToAssign, setSelectedUserToAssign] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Mission Statement Approval Modal State
  const [missionModalLearner, setMissionModalLearner] = useState<EnrolledLearner | null>(null);
  const [missionFeedback, setMissionFeedback] = useState("");
  const [isApprovingMission, setIsApprovingMission] = useState(false);

  // Tab 2: Sessions State
  const [sessions, setSessions] = useState<BatchSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionSortField, setSessionSortField] = useState<SessionSortField>("date");
  const [sessionSortOrder, setSessionSortOrder] = useState<SortOrder>("asc");

  const handleSessionSort = (field: SessionSortField) => {
    if (sessionSortField === field) {
      setSessionSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSessionSortField(field);
      setSessionSortOrder("asc");
    }
  };
  const [isCreateSessionModalOpen, setIsCreateSessionModalOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionWallDate, setSessionWallDate] = useState("");
  const [sessionWallTime, setSessionWallTime] = useState("19:00");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState("60");
  const [sessionMinAttendance, setSessionMinAttendance] = useState("45");
  const [selectedTz, setSelectedTz] = useState("Asia/Dubai");
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);
  const [editingRecordingSessionId, setEditingRecordingSessionId] = useState<string | null>(null);
  const [newRecordingUrl, setNewRecordingUrl] = useState("");
  const [syncingSessionId, setSyncingSessionId] = useState<string | null>(null);

  const handleSyncZoomAttendance = async (sessionId: string) => {
    setSyncingSessionId(sessionId);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/batches/${batchId}/sessions/${sessionId}/sync-attendance`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        toastError(data.message || "Failed to sync attendance from Zoom.");
      } else {
        toastSuccess(`Attendance synced successfully (${data.participantCount || 0} participants processed).`);
        await loadBatchData();
      }
    } catch (err: any) {
      toastError(err?.message || "Error syncing Zoom attendance.");
    } finally {
      setSyncingSessionId(null);
    }
  };

  // Tab 3: Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastInApp, setBroadcastInApp] = useState(true);
  const [broadcastEmail, setBroadcastEmail] = useState(true);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<Array<{
    id: string;
    title: string;
    message: string;
    sentAt: string;
    recipientCount: number;
    channels: string[];
  }>>([]);

  // Batch Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsStartDate, setSettingsStartDate] = useState("");
  const [settingsEndDate, setSettingsEndDate] = useState("");
  const [settingsRegistrationDeadline, setSettingsRegistrationDeadline] = useState("");
  const [settingsCapacity, setSettingsCapacity] = useState("");
  const [settingsManagerId, setSettingsManagerId] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [managers, setManagers] = useState<any[]>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const openSettingsModal = () => {
    if (batch) {
      setSettingsName(batch.name || "");
      setSettingsStartDate(batch.startDate ? new Date(batch.startDate).toISOString().slice(0, 10) : "");
      setSettingsEndDate(batch.endDate ? new Date(batch.endDate).toISOString().slice(0, 10) : "");
      setSettingsRegistrationDeadline(batch.registrationDeadline ? new Date(batch.registrationDeadline).toISOString().slice(0, 10) : "");
      setSettingsCapacity(String(batch.capacity || 50));
      setSettingsManagerId(batch.managerId || "");
      setSettingsStatus(batch.status || "ACTIVE");
    }
    setSettingsError("");
    setIsSettingsModalOpen(true);
  };

  // Timezone options
  const tzOptions = useMemo(() => getTimezoneOptions(), []);

  // Helper for 24-hr time to 12-hr display preview
  const format24To12 = useCallback((timeStr: string): string => {
    if (!timeStr || !timeStr.includes(":")) return "";
    const [hStr, mStr] = timeStr.split(":");
    const h = parseInt(hStr || "0", 10);
    const m = parseInt(mStr || "0", 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return "";
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = m < 10 ? `0${m}` : m;
    const context = h >= 5 && h < 12 ? "Morning" : h >= 12 && h < 17 ? "Afternoon" : "Evening";
    return `🕒 ${displayH}:${displayM} ${period} (${context})`;
  }, []);

  // Initial Data Fetch
  const loadBatchData = useCallback(async () => {
    setIsLoadingBatch(true);
    setBatchError(null);
    try {
      const data = await getBatchById(batchId);
      setBatch(data);

      // Populate Settings Form fields
      setSettingsName(data.name || "");
      setSettingsStartDate(data.startDate ? new Date(data.startDate).toISOString().slice(0, 10) : "");
      setSettingsEndDate(data.endDate ? new Date(data.endDate).toISOString().slice(0, 10) : "");
      setSettingsRegistrationDeadline(data.registrationDeadline ? new Date(data.registrationDeadline).toISOString().slice(0, 10) : "");
      setSettingsCapacity(String(data.capacity || 50));
      setSettingsManagerId(data.managerId || "");
      setSettingsStatus(data.status || "ACTIVE");

      // Extract Enrolled Learners
      const rawEnrolments: any[] = data.enrolments || [];
      const formattedLearners: EnrolledLearner[] = rawEnrolments.map((e) => ({
        id: e.id,
        userId: e.userId,
        status: e.status,
        createdAt: e.createdAt,
        user: e.user || { id: e.userId, name: "Learner", email: "", role: "USER" },
        signedAgreement: e.signedAgreement || null,
      }));
      setLearners(formattedLearners);

      // Lazy-load individual 5-step stages for confirmed learners only
      fetchLearnerStages(formattedLearners.filter((l) => l.status !== "PENDING_PAYMENT"));
    } catch (err: any) {
      console.error("Failed to load batch:", err);
      setBatchError(err.message || "Failed to load batch");
    } finally {
      setIsLoadingBatch(false);
    }
  }, [batchId]);

  // Fetch 5-Stage Progression for learners in parallel
  const fetchLearnerStages = async (learnerList: EnrolledLearner[]) => {
    const updated = [...learnerList];
    for (let i = 0; i < updated.length; i++) {
      const enrolment = updated[i];
      if (!enrolment) continue;
      try {
        const stagesRes = await apiGet<any>(`/progression/enrolments/${enrolment.id}/stages`).catch(() => null);
        if (stagesRes?.stages) {
          updated[i] = {
            ...enrolment,
            stages: stagesRes.stages,
          };
        }
      } catch {
        // Soft fail per learner
      }
    }
    setLearners(updated);
  };

  // Load Sessions for Tab 2
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const sessionList = await getBatchSessions(batchId);
      setSessions(sessionList);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [batchId]);

  // Load Managers & Users for Dropdowns
  const loadSupportingData = useCallback(async () => {
    try {
      const [usersRes, managersRes] = await Promise.all([
        cachedFetch(`${API_URL}/users?limit=100`),
        cachedFetch(`${API_URL}/users?role=MANAGER`),
      ]);
      if (usersRes.ok) {
        const json = await usersRes.json();
        setAllUsers(Array.isArray(json) ? json : json?.data || []);
      }
      if (managersRes.ok) {
        const json = await managersRes.json();
        setManagers(Array.isArray(json) ? json : json?.data || []);
      }
    } catch (e) {
      console.error("Failed to load supporting data:", e);
    }
  }, []);

  useEffect(() => {
    loadBatchData();
    loadSessions();
    loadSupportingData();
  }, [loadBatchData, loadSessions, loadSupportingData]);

  // Split Confirmed vs Unpaid
  const confirmedLearners = useMemo(() => {
    return learners.filter((l) => l.status !== "PENDING_PAYMENT");
  }, [learners]);

  const pendingPaymentLearners = useMemo(() => {
    return learners.filter((l) => l.status === "PENDING_PAYMENT");
  }, [learners]);

  // Action Handlers for Unpaid Leads
  const handleReleaseSeat = async () => {
    if (!releasingLearner) return;
    setIsReleasingSeat(true);
    try {
      await cancelEnrolment(releasingLearner.id);
      toastSuccess(`Released reserved seat for ${releasingLearner.user.name}. Capacity has been updated.`);
      setReleasingLearner(null);
      await loadBatchData();
    } catch (err: any) {
      toastError(err?.message || "Failed to release seat.");
    } finally {
      setIsReleasingSeat(false);
    }
  };

  const handleResendPaymentLink = async (learner: EnrolledLearner) => {
    setResendingId(learner.id);
    try {
      const res = await resendEnrolmentPaymentLink(learner.id);
      toastSuccess(res?.message || `Payment link resent to ${learner.user.email}`);
    } catch (err: any) {
      toastError(err?.message || "Failed to resend payment link.");
    } finally {
      setResendingId(null);
    }
  };

  // Filtered Learners for Tab 1
  const filteredLearners = useMemo(() => {
    let result = rosterSubView === "confirmed" ? confirmedLearners : pendingPaymentLearners;

    if (rosterSubView === "confirmed" && learnerStatusFilter !== "ALL") {
      result = result.filter((l) => {
        if (learnerStatusFilter === "CALL_PENDING") {
          const s4 = l.stages?.STAGE_4_ONE_ON_ONE;
          return Boolean(
            s4?.details?.hasPendingRequest ||
            s4?.details?.callStatus === "REQUESTED"
          );
        }
        if (learnerStatusFilter === "MISSION_PENDING") {
          const s4 = l.stages?.STAGE_4_ONE_ON_ONE;
          const s5 = l.stages?.STAGE_5_MISSION_STATEMENT;
          return s5?.details?.status === "SUBMITTED" || (!s5?.isCompleted && s4?.isCompleted);
        }
        if (learnerStatusFilter === "CERTIFIED") {
          return l.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted || l.status === "COMPLETED";
        }
        if (learnerStatusFilter === "ACTIVE") {
          return l.status === "ACTIVE" && !l.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted;
        }
        return l.status === learnerStatusFilter;
      });
    }

    const q = learnerSearch.toLowerCase().trim();
    if (!q) return result;
    return result.filter(
      (l) =>
        l.user?.name?.toLowerCase().includes(q) ||
        l.user?.email?.toLowerCase().includes(q)
    );
  }, [confirmedLearners, pendingPaymentLearners, rosterSubView, learnerSearch, learnerStatusFilter]);

  const filteredAndSortedLearners = useMemo(() => {
    const list = [...filteredLearners];
    list.sort((a, b) => {
      let cmp = 0;
      if (learnerSortField === "name") {
        cmp = (a.user?.name || "").localeCompare(b.user?.name || "");
      } else if (learnerSortField === "status") {
        const getStatusLabel = (l: EnrolledLearner) =>
          l.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted || l.status === "COMPLETED"
            ? "CERTIFIED"
            : l.status || "ACTIVE";
        cmp = getStatusLabel(a).localeCompare(getStatusLabel(b));
      } else if (learnerSortField === "stage1") {
        cmp = (a.stages?.STAGE_1_CURRICULUM?.isCompleted ? 1 : 0) - (b.stages?.STAGE_1_CURRICULUM?.isCompleted ? 1 : 0);
      } else if (learnerSortField === "stage2") {
        cmp = (a.stages?.STAGE_2_EXAM?.isCompleted ? 1 : 0) - (b.stages?.STAGE_2_EXAM?.isCompleted ? 1 : 0);
      } else if (learnerSortField === "stage3") {
        const aPct = Number(a.stages?.STAGE_3_ATTENDANCE?.details?.attendancePercentage ?? 0);
        const bPct = Number(b.stages?.STAGE_3_ATTENDANCE?.details?.attendancePercentage ?? 0);
        cmp = aPct - bPct;
      } else if (learnerSortField === "stage4") {
        const getS4Weight = (l: EnrolledLearner) => {
          if (l.stages?.STAGE_4_ONE_ON_ONE?.isCompleted) return 4;
          if (l.stages?.STAGE_4_ONE_ON_ONE?.details?.isScheduled || l.stages?.STAGE_4_ONE_ON_ONE?.details?.callStatus === "SCHEDULED") return 3;
          if (l.stages?.STAGE_4_ONE_ON_ONE?.details?.hasPendingRequest || l.stages?.STAGE_4_ONE_ON_ONE?.details?.callStatus === "REQUESTED") return 2;
          if (l.stages?.STAGE_4_ONE_ON_ONE?.details?.isRejected || l.stages?.STAGE_4_ONE_ON_ONE?.details?.callStatus === "REJECTED") return 1;
          return 0;
        };
        cmp = getS4Weight(a) - getS4Weight(b);
      } else if (learnerSortField === "stage5") {
        const getS5Weight = (l: EnrolledLearner) => {
          if (l.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted) return 3;
          if (l.stages?.STAGE_5_MISSION_STATEMENT?.details?.status === "SUBMITTED") return 2;
          return 0;
        };
        cmp = getS5Weight(a) - getS5Weight(b);
      }
      return learnerSortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredLearners, learnerSortField, learnerSortOrder]);

  const totalLearnerPages = Math.max(1, Math.ceil(filteredAndSortedLearners.length / learnerPageSize));

  useEffect(() => {
    if (learnerPage > totalLearnerPages) {
      setLearnerPage(1);
    }
  }, [learnerPage, totalLearnerPages]);

  const paginatedLearners = useMemo(() => {
    const start = (learnerPage - 1) * learnerPageSize;
    return filteredAndSortedLearners.slice(start, start + learnerPageSize);
  }, [filteredAndSortedLearners, learnerPage, learnerPageSize]);

  // Tab 2: Sorted Sessions
  const sortedSessions = useMemo(() => {
    const list = [...sessions];
    list.sort((a, b) => {
      let cmp = 0;
      if (sessionSortField === "title") {
        cmp = (a.title || "").localeCompare(b.title || "");
      } else if (sessionSortField === "date") {
        cmp = new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime();
      } else if (sessionSortField === "trainer") {
        const aName = a.hostTrainer?.name || batch?.manager?.name || "";
        const bName = b.hostTrainer?.name || batch?.manager?.name || "";
        cmp = aName.localeCompare(bName);
      } else if (sessionSortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return sessionSortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sessions, sessionSortField, sessionSortOrder, batch?.manager?.name]);

  // Cohort Schedule Display String (Hook declared before early returns)
  const scheduleDisplay = useMemo(() => {
    if (!batch?.startDate) return "Schedule TBA";
    const start = new Date(batch.startDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (!batch.endDate) return `Starts ${start} (Ongoing)`;
    const end = new Date(batch.endDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${start} – ${end}`;
  }, [batch?.startDate, batch?.endDate]);

  // Export Tab 1 Roster to CSV Handler
  const handleExportRoster = useCallback(() => {
    if (!learners.length) {
      toastError("No learners available to export.");
      return;
    }

    const headers = [
      "Learner Name",
      "Learner Email",
      "Status",
      "Stage 1 (Curriculum)",
      "Stage 2 (Exam)",
      "Stage 3 (Live Attendance)",
      "Stage 4 (1-on-1 Call)",
      "Stage 5 (Mission Statement)",
      "Enrolled Date",
    ];

    const rows = filteredLearners.map((l) => {
      const s1 = l.stages?.STAGE_1_CURRICULUM?.isCompleted ? "Completed" : "In Progress";
      const s2 = l.stages?.STAGE_2_EXAM?.isCompleted ? "Passed" : "Pending";
      const s3Details = l.stages?.STAGE_3_ATTENDANCE?.details;
      const s3Required = s3Details?.requiredSessions ?? 0;
      const s3Pct =
        s3Required === 0
          ? "0%"
          : s3Details?.attendancePercentage !== undefined && s3Details?.attendancePercentage !== null
          ? `${Math.round(Number(s3Details.attendancePercentage))}%`
          : "0%";
      const s4State = l.stages?.STAGE_4_ONE_ON_ONE;
      const s4Text = s4State?.isCompleted
        ? "Completed"
        : s4State?.details?.isScheduled || s4State?.details?.callStatus === "SCHEDULED"
        ? "Scheduled"
        : s4State?.details?.hasPendingRequest || s4State?.details?.callStatus === "REQUESTED"
        ? "Requested (Needs Approval)"
        : s4State?.details?.isRejected || s4State?.details?.callStatus === "REJECTED"
        ? "Declined"
        : "Pending";
      const s5 = l.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted
        ? "Approved"
        : l.stages?.STAGE_5_MISSION_STATEMENT?.details?.status === "SUBMITTED"
        ? "Pending Review"
        : "Not Submitted";
      const learnerStatus =
        l.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted || l.status === "COMPLETED"
          ? "CERTIFIED"
          : l.status || "ACTIVE";
      const enrolledAt = l.createdAt ? new Date(l.createdAt).toLocaleDateString() : "—";

      return [
        `"${(l.user?.name || "").replace(/"/g, '""')}"`,
        `"${(l.user?.email || "").replace(/"/g, '""')}"`,
        `"${learnerStatus}"`,
        `"${s1}"`,
        `"${s2}"`,
        `"${s3Pct}"`,
        `"${s4Text}"`,
        `"${s5}"`,
        `"${enrolledAt}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (batch?.name || "batch").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    link.setAttribute("href", url);
    link.setAttribute("download", `${safeName}-roster-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toastSuccess(`Exported ${filteredLearners.length} learner records to CSV.`);
  }, [learners, filteredLearners, batch?.name, toastSuccess, toastError]);

  // Assign Learner Handler
  const handleAssignLearner = async () => {
    setIsAssigning(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      let targetUserId = selectedUserToAssign;

      if (assignMode === "new") {
        if (!newLearnerName.trim() || !newLearnerEmail.trim()) {
          toastError("Please enter the learner's name and email address.");
          setIsAssigning(false);
          return;
        }

        const createRes = await fetch(`${API_URL}/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: newLearnerName.trim(),
            email: newLearnerEmail.trim().toLowerCase(),
            phone: newLearnerPhone.trim() || undefined,
            role: "USER",
          }),
        });

        if (!createRes.ok) {
          throw new Error(await errorMessage(createRes, "Could not create user account."));
        }

        const createdUser = await createRes.json();
        targetUserId = createdUser.id || createdUser.user?.id;
      }

      if (!targetUserId) {
        toastError("Please select a user to assign.");
        setIsAssigning(false);
        return;
      }

      const res = await fetch(`${API_URL}/enrollments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: targetUserId,
          programId: batch.programId,
          batchId: batch.id,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Could not assign learner to batch."));
      }

      toastSuccess(assignMode === "new" ? "New learner created and enrolled in batch." : "Learner successfully assigned to batch.");
      setIsAssignModalOpen(false);
      setSelectedUserToAssign("");
      setNewLearnerName("");
      setNewLearnerEmail("");
      setNewLearnerPhone("");
      setAssignMode("existing");
      await loadBatchData();
    } catch (err: any) {
      toastError(err.message || "Failed to assign learner.");
    } finally {
      setIsAssigning(false);
    }
  };

  // Approve Mission Statement Handler
  const handleApproveMission = async () => {
    if (!missionModalLearner) return;
    setIsApprovingMission(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      // Approve mission statement stage override or completion
      const res = await fetch(
        `${API_URL}/progression/admin/enrolments/${missionModalLearner.id}/stages/STAGE_5_MISSION_STATEMENT/override`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            reason: missionFeedback.trim() || "Approved by instructor from Batch Management Workspace",
          }),
        }
      );

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to approve mission statement."));
      }

      toastSuccess(`Mission statement approved for ${missionModalLearner.user.name}.`);
      setMissionModalLearner(null);
      setMissionFeedback("");
      await loadBatchData();
    } catch (err: any) {
      toastError(err.message || "Failed to approve mission statement.");
    } finally {
      setIsApprovingMission(false);
    }
  };

  // Schedule Session Handler (Tab 2)
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle.trim() || !sessionWallDate || !sessionWallTime) {
      toastError("Please fill out the session title, date, and time.");
      return;
    }

    setIsSubmittingSession(false);
    try {
      const startUtc = localWallTimeToUtc(sessionWallDate, sessionWallTime, selectedTz).toISOString();
      const durationNum = parseInt(sessionDurationMinutes, 10) || 60;
      const endUtc = new Date(new Date(startUtc).getTime() + durationNum * 60000).toISOString();

      await createSession({
        batchId,
        title: sessionTitle.trim(),
        sessionType: "GROUP_COHORT",
        startTime: startUtc,
        endTime: endUtc,
        capacity: batch?.capacity || 50,
      });

      toastSuccess("Live cohort session scheduled successfully.");
      setIsCreateSessionModalOpen(false);
      setSessionTitle("");
      await loadSessions();
    } catch (err: any) {
      toastError(err.message || "Failed to schedule session.");
    } finally {
      setIsSubmittingSession(false);
    }
  };

  // Update Recording URL Handler
  const handleSaveRecordingUrl = async (sessionId: string) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recordingUrl: newRecordingUrl.trim() || null }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Could not update recording link."));
      }

      toastSuccess("Recording link updated.");
      setEditingRecordingSessionId(null);
      setNewRecordingUrl("");
      await loadSessions();
    } catch (err: any) {
      toastError(err.message || "Failed to update recording URL.");
    }
  };

  // Broadcast Handler (Tab 3)
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toastError("Title and message are required for broadcast.");
      return;
    }
    const channels: string[] = [];
    if (broadcastInApp) channels.push("IN_APP");
    if (broadcastEmail) channels.push("EMAIL");

    if (channels.length === 0) {
      toastError("Please select at least one delivery channel.");
      return;
    }

    setIsSendingBroadcast(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/notifications/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          target: "BATCH",
          targetId: batchId,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          channels,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to send batch broadcast."));
      }

      toastSuccess(`Announcement broadcast sent to ${learners.length} cohort learner(s).`);
      setBroadcastHistory((prev) => [
        {
          id: `bcast-${Date.now()}`,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          sentAt: new Date().toISOString(),
          recipientCount: learners.length,
          channels,
        },
        ...prev,
      ]);

      setBroadcastTitle("");
      setBroadcastMessage("");
    } catch (err: any) {
      toastError(err.message || "Failed to broadcast message.");
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  // Save Settings Handler (Modal)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsName.trim()) {
      setSettingsError("Batch name is required.");
      return;
    }
    if (!settingsStartDate) {
      setSettingsError("Please select a valid Start Date.");
      return;
    }
    if (!settingsRegistrationDeadline) {
      setSettingsError("Please select a Registration Deadline.");
      return;
    }
    if (settingsEndDate && settingsStartDate && settingsEndDate < settingsStartDate) {
      setSettingsError("Batch End Date must be on or after Start Date.");
      return;
    }
    if (settingsRegistrationDeadline && settingsEndDate && settingsRegistrationDeadline > settingsEndDate) {
      setSettingsError("Registration Deadline cannot be after Batch End Date.");
      return;
    }

    setSettingsError("");
    setIsSavingSettings(true);
    try {
      const updated = await updateBatch(batchId, {
        name: settingsName.trim(),
        startDate: settingsStartDate ? new Date(settingsStartDate).toISOString() : undefined,
        endDate: settingsEndDate ? new Date(settingsEndDate).toISOString() : null,
        registrationDeadline: settingsRegistrationDeadline ? new Date(settingsRegistrationDeadline).toISOString() : null,
        capacity: parseInt(settingsCapacity, 10) || 50,
        managerId: settingsManagerId ? settingsManagerId : null,
        status: settingsStatus,
      });

      invalidateCache("/batches");

      // Optimistically update local batch state so header & settings reflect new status immediately
      setBatch((prev: any) => ({
        ...prev,
        ...(updated || {}),
        name: settingsName.trim(),
        startDate: settingsStartDate ? new Date(settingsStartDate).toISOString() : prev?.startDate,
        endDate: settingsEndDate ? new Date(settingsEndDate).toISOString() : null,
        registrationDeadline: settingsRegistrationDeadline ? new Date(settingsRegistrationDeadline).toISOString() : null,
        capacity: parseInt(settingsCapacity, 10) || 50,
        status: settingsStatus,
        managerId: settingsManagerId || null,
        manager: settingsManagerId
          ? managers.find((m) => m.id === settingsManagerId) || prev?.manager
          : null,
      }));

      toastSuccess("Batch settings updated successfully.");
      setIsSettingsModalOpen(false);
      await loadBatchData();
    } catch (err: any) {
      const msg = err.message || "Failed to save batch settings.";
      setSettingsError(msg);
      toastError(msg);
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (isLoadingBatch && !batch) {
    return (
      <div className={styles.dashboardContainer} style={{ gap: "1rem" }}>
        {/* Back Link Skeleton */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0" }}>
          <div className={batchStyles.skeletonShimmer} style={{ width: "120px", height: "18px" }} />
        </div>

        {/* Header Card Skeleton */}
        <div className={batchStyles.headerCard}>
          <div className={batchStyles.headerIdentityRow}>
            <div className={batchStyles.identityLeft}>
              <div className={`${batchStyles.batchSquircle} ${batchStyles.skeletonShimmer}`} style={{ border: "none" }} />
              <div className={batchStyles.identityDetails} style={{ gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div className={batchStyles.skeletonShimmer} style={{ width: "240px", height: "24px" }} />
                  <div className={batchStyles.skeletonShimmer} style={{ width: "60px", height: "20px" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div className={batchStyles.skeletonShimmer} style={{ width: "140px", height: "14px" }} />
                  <div className={batchStyles.skeletonShimmer} style={{ width: "120px", height: "14px" }} />
                  <div className={batchStyles.skeletonShimmer} style={{ width: "160px", height: "14px" }} />
                  <div className={batchStyles.skeletonShimmer} style={{ width: "100px", height: "14px" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Bar Skeleton */}
        <div style={{ borderBottom: "1px solid var(--border-light)", display: "flex", gap: "0.75rem", paddingBottom: "0.5rem" }}>
          <div className={batchStyles.skeletonShimmer} style={{ width: "110px", height: "36px", borderRadius: "8px" }} />
          <div className={batchStyles.skeletonShimmer} style={{ width: "140px", height: "36px", borderRadius: "8px" }} />
          <div className={batchStyles.skeletonShimmer} style={{ width: "100px", height: "36px", borderRadius: "8px" }} />
        </div>

        {/* Content Table Skeleton */}
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable} style={{ width: "100%" }}>
            <tbody>
              <TableSkeleton columns={8} rows={6} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (batchError && !batch) {
    return (
      <div className={styles.dashboardContainer} style={{ gap: "1rem" }}>
        <div>
          <Link href="/batches" className={batchStyles.backLink}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Batches</span>
          </Link>
        </div>
        <div style={{ padding: "3rem", textAlign: "center", background: "#ffffff", border: "1px solid var(--border-light)", borderRadius: "12px" }}>
          <h2 style={{ color: "#991b1b" }}>Batch Unavailable</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{batchError}</p>
          <Link href="/batches" className={styles.secondaryBtn}>
            Return to Batches Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer} style={{ gap: "1rem" }}>
      {/* 1. Clean Back Navigation */}
      <div>
        <Link href="/batches" className={batchStyles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Batches</span>
        </Link>
      </div>

      {/* 2. Unified Batch Header Card */}
      <div className={batchStyles.headerCard}>
        <div className={batchStyles.headerIdentityRow}>
          <div className={batchStyles.identityLeft}>
            {/* Elegant Batch Icon Squircle */}
            <div className={batchStyles.batchSquircle} aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>

            <div className={batchStyles.identityDetails}>
              <div className={batchStyles.nameStatusRow}>
                <h1 className={batchStyles.batchName}>{batch?.name}</h1>
                <StatusBadge status={batch?.status || "ACTIVE"} />
              </div>

              {/* Clean Sub-Metadata Row matching User & Enrolment detail style */}
              <div className={batchStyles.metaRow}>
                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Program:</span>
                  <span className={batchStyles.metaValue}>{batch?.program?.title || "—"}</span>
                </span>

                <span className={batchStyles.metaDot}>•</span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Manager:</span>
                  <span
                    className={batchStyles.metaValue}
                    style={{
                      color: batch?.manager?.name && batch.manager.name !== "Unassigned" ? "var(--text-primary)" : "var(--text-muted)",
                      fontStyle: batch?.manager?.name && batch.manager.name !== "Unassigned" ? "normal" : "italic",
                    }}
                  >
                    {batch?.manager?.name || "Unassigned"}
                  </span>
                </span>

                <span className={batchStyles.metaDot}>•</span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Schedule:</span>
                  <span className={batchStyles.metaValue}>{scheduleDisplay}</span>
                </span>

                <span className={batchStyles.metaDot}>•</span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Capacity:</span>
                  <span className={batchStyles.metaValue} style={{ color: "var(--accent-primary)" }}>
                    {batch?.enrolledCount ?? learners.length}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                    / {batch?.capacity && batch.capacity < 9000 ? `${batch.capacity} Learners` : "Open Capacity"}
                  </span>
                </span>

                <span className={batchStyles.metaDot}>•</span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Registration:</span>
                  <span
                    className={batchStyles.metaValue}
                    style={{
                      color: batch?.registrationDeadline && new Date() > new Date(batch.registrationDeadline) ? "#dc2626" : "#166534",
                      fontWeight: 600,
                    }}
                  >
                    {batch?.registrationDeadline
                      ? (new Date() > new Date(batch.registrationDeadline)
                          ? `Closed (${new Date(batch.registrationDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })})`
                          : `Until ${new Date(batch.registrationDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`)
                      : "Open (Auto)"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className={batchStyles.headerActions}>
            <button
              type="button"
              onClick={() => handleTabChange("settings")}
              className={styles.secondaryBtn}
              style={{
                fontSize: "0.78rem",
                padding: "0.38rem 0.75rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontWeight: 600,
              }}
              title="Configure batch parameters, schedule & instructor assignment"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Batch Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Unified 3-Tab Navigation Workspace */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>
        <div
          className={styles.tabsContainer}
          role="tablist"
          aria-label="Batch management workspace views"
          style={{ gap: "0.75rem", margin: 0, paddingBottom: 0 }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "learners"}
            className={`${styles.tabBtn} ${activeTab === "learners" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("learners")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Learners ({confirmedLearners.length})</span>
            {pendingPaymentLearners.length > 0 && (
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  background: "#ea580c",
                  color: "#ffffff",
                  padding: "1px 6px",
                  borderRadius: "100px",
                }}
                title={`${pendingPaymentLearners.length} unconfirmed checkouts`}
              >
                +{pendingPaymentLearners.length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "sessions"}
            className={`${styles.tabBtn} ${activeTab === "sessions" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("sessions")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Live Sessions ({sessions.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "broadcast"}
            className={`${styles.tabBtn} ${activeTab === "broadcast" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("broadcast")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span>Broadcast</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "settings"}
            className={`${styles.tabBtn} ${activeTab === "settings" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("settings")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          TAB 1: LEARNERS ROSTER & 5-STEP JOURNEY + CERTIFICATE APPROVALS (PRIMARY)
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "learners" && (
        <section className={styles.tableSection}>
          {/* Sub-View Navigation: Confirmed Class Roster vs Awaiting Payment */}
          <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 1rem 0", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                setRosterSubView("confirmed");
                setLearnerStatusFilter("ALL");
                setLearnerPage(1);
              }}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "6px",
                fontSize: "0.84rem",
                fontWeight: 600,
                cursor: "pointer",
                border: rosterSubView === "confirmed" ? "1px solid var(--accent-primary, #c97a1e)" : "1px solid var(--border-color, #e5e7eb)",
                background: rosterSubView === "confirmed" ? "rgba(201, 122, 30, 0.12)" : "transparent",
                color: rosterSubView === "confirmed" ? "var(--accent-primary, #c97a1e)" : "var(--text-secondary, #6b7280)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <span>Official Class Roster</span>
              <span
                style={{
                  background: rosterSubView === "confirmed" ? "var(--accent-primary, #c97a1e)" : "rgba(0,0,0,0.06)",
                  color: rosterSubView === "confirmed" ? "#ffffff" : "inherit",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "100px",
                }}
              >
                {confirmedLearners.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRosterSubView("pending_payment");
                setLearnerPage(1);
              }}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "6px",
                fontSize: "0.84rem",
                fontWeight: 600,
                cursor: "pointer",
                border: rosterSubView === "pending_payment" ? "1px solid #f97316" : "1px solid var(--border-color, #e5e7eb)",
                background: rosterSubView === "pending_payment" ? "#fff7ed" : "transparent",
                color: rosterSubView === "pending_payment" ? "#c2410c" : "var(--text-secondary, #6b7280)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <span>Awaiting Payment / Incomplete</span>
              <span
                style={{
                  background: pendingPaymentLearners.length > 0 ? "#ea580c" : "rgba(0,0,0,0.06)",
                  color: pendingPaymentLearners.length > 0 ? "#ffffff" : "inherit",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "100px",
                }}
              >
                {pendingPaymentLearners.length}
              </span>
            </button>
          </div>

          {rosterSubView === "pending_payment" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.6rem 1rem",
                margin: "0.75rem 1rem 0",
                background: "#fffbeb",
                border: "1px solid #fef3c7",
                borderRadius: "8px",
                fontSize: "0.82rem",
                color: "#92400e",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  These learners initiated registration or signed the workshop agreement but haven&apos;t completed payment. They do not consume batch capacity. Unpaid checkouts older than 48 hours are automatically revoked.
                </span>
              </div>
            </div>
          )}

          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {/* Search & Filter Group */}
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <div className={styles.searchContainer} style={{ minWidth: "320px", maxWidth: "420px", width: "340px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", marginRight: "0.4rem" }}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder={rosterSubView === "confirmed" ? "Search enrolled learners by name or email..." : "Search pending checkouts..."}
                  value={learnerSearch}
                  onChange={(e) => {
                    setLearnerSearch(e.target.value);
                    setLearnerPage(1);
                  }}
                  className={styles.searchInput}
                />
              </div>

              {/* Status & Stage Filter (Only shown on confirmed roster) */}
              {rosterSubView === "confirmed" && (
                <div style={{ minWidth: "175px" }}>
                  <CustomSelect
                    value={learnerStatusFilter}
                    onChange={(val) => {
                      setLearnerStatusFilter(val);
                      setLearnerPage(1);
                    }}
                    options={[
                      { value: "ALL", label: `All Confirmed (${confirmedLearners.length})` },
                      { value: "ACTIVE", label: "Active Status" },
                      { value: "CALL_PENDING", label: "Needs Approval (1:1 Call)" },
                      { value: "MISSION_PENDING", label: "Needs Approval (Stage 5)" },
                      { value: "CERTIFIED", label: "Certified / Completed" },
                      { value: "PENDING_AGREEMENT", label: "Pending Agreement" },
                    ]}
                    ariaLabel="Filter learners by status or progression"
                  />
                </div>
              )}
            </div>

            {/* Action Buttons: Export CSV & Assign Learner */}
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleExportRoster}
                disabled={learners.length === 0}
                title="Export enrolled learners roster to CSV"
                style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem", display: "inline-flex", alignItems: "center", gap: "5px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setIsAssignModalOpen(true)}
                style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
              >
                + Assign Learner
              </button>
            </div>
          </div>

          <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
            <table className={styles.adminTable} style={{ width: "100%" }}>
              <thead>
                {rosterSubView === "pending_payment" ? (
                  <tr>
                    <th
                      onClick={() => handleLearnerSort("name")}
                      style={{ minWidth: "180px", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "name" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>Prospect / Learner</span>
                        <SortIndicator active={learnerSortField === "name"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th style={{ width: "150px" }}>Checkout Status</th>
                    <th style={{ width: "150px" }}>Workshop Agreement</th>
                    <th style={{ width: "130px" }}>Initiated Date</th>
                    <th style={{ width: "220px", textAlign: "right", whiteSpace: "nowrap" }}>Quick Actions</th>
                  </tr>
                ) : (
                  <tr>
                    <th
                      onClick={() => handleLearnerSort("name")}
                      style={{ minWidth: "150px", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "name" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>Learner</span>
                        <SortIndicator active={learnerSortField === "name"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleLearnerSort("status")}
                      style={{ width: "95px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "status" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>Status</span>
                        <SortIndicator active={learnerSortField === "status"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleLearnerSort("stage1")}
                      style={{ width: "95px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "stage1" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>1. Curriculum</span>
                        <SortIndicator active={learnerSortField === "stage1"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleLearnerSort("stage2")}
                      style={{ width: "80px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "stage2" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>2. Exam</span>
                        <SortIndicator active={learnerSortField === "stage2"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleLearnerSort("stage3")}
                      style={{ width: "95px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "stage3" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>3. Attendance</span>
                        <SortIndicator active={learnerSortField === "stage3"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleLearnerSort("stage4")}
                      style={{ width: "85px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "stage4" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>4. 1:1 Call</span>
                        <SortIndicator active={learnerSortField === "stage4"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleLearnerSort("stage5")}
                      style={{ width: "140px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                      aria-sort={learnerSortField === "stage5" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>5. Mission Statement</span>
                        <SortIndicator active={learnerSortField === "stage5"} order={learnerSortOrder} />
                      </div>
                    </th>
                    <th style={{ width: "95px", textAlign: "right", whiteSpace: "nowrap" }}>Action</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredLearners.length === 0 ? (
                  <tr>
                    <td colSpan={rosterSubView === "pending_payment" ? 5 : 8} style={{ padding: "3rem 1rem" }}>
                      <EmptyState
                        icon="users"
                        title={
                          learnerSearch
                            ? "No learners match your search"
                            : rosterSubView === "pending_payment"
                            ? "No pending checkouts in this batch"
                            : "No learners enrolled in this batch"
                        }
                        description={
                          learnerSearch
                            ? `No students found matching "${learnerSearch}". Try clearing your query.`
                            : rosterSubView === "pending_payment"
                            ? "All students who registered for this cohort have either completed payment or their holds have expired."
                            : "Click '+ Assign Learner' to add students from this program into this cohort."
                        }
                        actionLabel={rosterSubView === "confirmed" ? "+ Assign Learner" : undefined}
                        onAction={rosterSubView === "confirmed" ? () => setIsAssignModalOpen(true) : undefined}
                      />
                    </td>
                  </tr>
                ) : rosterSubView === "pending_payment" ? (
                  paginatedLearners.map((learner) => {
                    const isAgreementSigned = learner.signedAgreement?.status === "SIGNED";
                    const dateFormatted = learner.createdAt
                      ? new Date(learner.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "N/A";

                    return (
                      <tr key={learner.id}>
                        <td>
                          <Link
                            href={`/users/${learner.userId}?enrolmentId=${learner.id}&batchId=${batchId}&batchName=${encodeURIComponent(batch?.name || "Batch")}`}
                            style={{ textDecoration: "none", color: "inherit" }}
                            title="Open student profile"
                          >
                            <div className={styles.cellUser}>
                              <span className={styles.cellUserName} style={{ color: "var(--accent-primary)", cursor: "pointer" }}>
                                {learner.user?.name}
                              </span>
                              <span className={styles.cellUserEmail}>{learner.user?.email}</span>
                            </div>
                          </Link>
                        </td>

                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 8px",
                              borderRadius: "100px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              background: "#fff7ed",
                              color: "#c2410c",
                              border: "1px solid #ffedd5",
                              whiteSpace: "nowrap",
                            }}
                          >
                            ● Awaiting Payment
                          </span>
                        </td>

                        <td>
                          {isAgreementSigned ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                              }}
                              title={`Agreement signed on ${learner.signedAgreement?.signedAt ? new Date(learner.signedAgreement.signedAt).toLocaleDateString() : 'Yes'}`}
                            >
                              ✓ Signed
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#fef3c7",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                              }}
                            >
                              Pending Signature
                            </span>
                          )}
                        </td>

                        <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          {dateFormatted}
                        </td>

                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              onClick={() => handleResendPaymentLink(learner)}
                              disabled={resendingId === learner.id}
                              style={{
                                fontSize: "0.74rem",
                                padding: "0.28rem 0.6rem",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Resend personalized checkout link to learner's email"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                              </svg>
                              <span>{resendingId === learner.id ? "Sending..." : "Resend Link"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setReleasingLearner(learner)}
                              style={{
                                fontSize: "0.74rem",
                                padding: "0.28rem 0.6rem",
                                fontWeight: 600,
                                color: "#dc2626",
                                background: "rgba(220, 38, 38, 0.08)",
                                border: "1px solid rgba(220, 38, 38, 0.25)",
                                borderRadius: "6px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Release reserved seat immediately (revokes hold)"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                              <span>Release Seat</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  paginatedLearners.map((learner) => {
                    const s1 = learner.stages?.STAGE_1_CURRICULUM;
                    const s2 = learner.stages?.STAGE_2_EXAM;
                    const s3 = learner.stages?.STAGE_3_ATTENDANCE;
                    const s4 = learner.stages?.STAGE_4_ONE_ON_ONE;
                    const s5 = learner.stages?.STAGE_5_MISSION_STATEMENT;

                    const isMissionPending = s5?.details?.status === "SUBMITTED" || (!s5?.isCompleted && s4?.isCompleted);
                    const isCertified = Boolean(s5?.isCompleted || learner.status === "COMPLETED");

                    const attendedSessionsCount = s3?.details?.attendedSessions ?? 0;
                    const requiredSessionsCount = s3?.details?.requiredSessions ?? 0;
                    const thresholdPercent = s3?.details?.thresholdPercent ?? 80;
                    const hasZeroSessions = requiredSessionsCount === 0;

                    const attendancePct = hasZeroSessions
                      ? 0
                      : s3?.details?.attendancePercentage !== undefined && s3?.details?.attendancePercentage !== null
                      ? Math.round(Number(s3.details.attendancePercentage))
                      : 0;

                    const isAttendanceSatisfied = !hasZeroSessions && Boolean(s3?.isCompleted);
                    const attendanceDisplayText = `${attendancePct}%`;

                    const isCallCompleted = Boolean(s4?.isCompleted);
                    const isCallScheduled = Boolean(
                      s4?.details?.isScheduled ||
                      s4?.details?.callStatus === "SCHEDULED" ||
                      sessions.some(
                        (ses) =>
                          ses.sessionType === "ONE_ON_ONE" &&
                          ses.status === "SCHEDULED" &&
                          (ses.hostTrainer?.id === learner.userId || (ses as any).learnerId === learner.userId)
                      )
                    );
                    const isCallRequested = Boolean(
                      s4?.details?.hasPendingRequest ||
                      s4?.details?.callStatus === "REQUESTED"
                    );
                    const isCallRejected = Boolean(
                      !isCallCompleted &&
                      !isCallScheduled &&
                      !isCallRequested &&
                      (s4?.details?.isRejected || s4?.details?.callStatus === "REJECTED")
                    );

                    return (
                      <tr key={learner.id}>
                        {/* Learner Info */}
                        <td>
                          <Link
                            href={`/users/${learner.userId}?enrolmentId=${learner.id}&batchId=${batchId}&batchName=${encodeURIComponent(batch?.name || "Batch")}`}
                            style={{ textDecoration: "none", color: "inherit" }}
                            title="Open full student profile & progression card"
                          >
                            <div className={styles.cellUser}>
                              <span className={styles.cellUserName} style={{ color: "var(--accent-primary)", cursor: "pointer" }}>
                                {learner.user?.name}
                              </span>
                              <span className={styles.cellUserEmail}>{learner.user?.email}</span>
                            </div>
                          </Link>
                        </td>

                        {/* Enrolment Status */}
                        <td>
                          <StatusBadge status={isCertified ? "CERTIFIED" : learner.status} />
                        </td>

                        {/* Stage 1: Curriculum */}
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              background: s1?.isCompleted ? "#dcfce7" : "#fef3c7",
                              color: s1?.isCompleted ? "#15803d" : "#b45309",
                            }}
                          >
                            {s1?.isCompleted ? "Completed" : "In Progress"}
                          </span>
                        </td>

                        {/* Stage 2: Exam */}
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              background: s2?.isCompleted ? "#dcfce7" : "#fef3c7",
                              color: s2?.isCompleted ? "#15803d" : "#b45309",
                            }}
                          >
                            {s2?.isCompleted ? "Passed" : "Pending"}
                          </span>
                        </td>

                        {/* Stage 3: Live Attendance */}
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              background: isAttendanceSatisfied ? "#dcfce7" : "#fef3c7",
                              color: isAttendanceSatisfied ? "#15803d" : "#b45309",
                              border: isAttendanceSatisfied ? "1px solid #bbf7d0" : "1px solid #fde68a",
                            }}
                            title={
                              hasZeroSessions
                                ? `0/0 live sessions attended (0% vs ${thresholdPercent}% required — No live sessions scheduled yet)`
                                : `${attendedSessionsCount}/${requiredSessionsCount} live sessions attended (${attendanceDisplayText} vs ${thresholdPercent}% required)`
                            }
                          >
                            {attendanceDisplayText}
                          </span>
                        </td>

                        {/* Stage 4: 1:1 Session */}
                        <td>
                          {isCallCompleted ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                              }}
                              title="1-on-1 coaching call attended and completed"
                            >
                              Completed
                            </span>
                          ) : isCallScheduled ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                              }}
                              title={
                                s4?.details?.scheduledStartTime
                                  ? `1-on-1 coaching call scheduled for ${new Date(s4.details.scheduledStartTime).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                                  : "1-on-1 coaching call is scheduled"
                              }
                            >
                              Scheduled
                            </span>
                          ) : isCallRequested ? (
                            <Link
                              href="/approvals?tab=coaching"
                              style={{
                                background: "rgba(201, 122, 30, 0.1)",
                                border: "1px solid var(--accent-primary)",
                                color: "var(--accent-primary)",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "2px",
                                whiteSpace: "nowrap",
                              }}
                              title="1-on-1 coaching request submitted. Click to review, approve or decline in Approvals hub"
                            >
                              Review &amp; Approve ↗
                            </Link>
                          ) : isCallRejected ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#fee2e2",
                                color: "#991b1b",
                                border: "1px solid #fca5a5",
                              }}
                              title="Previous 1-on-1 request was declined. Learner can re-schedule a new slot."
                            >
                              Declined
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#f3f4f6",
                                color: "#6b7280",
                                border: "1px solid #e5e7eb",
                              }}
                              title="No 1-on-1 coaching call booked yet"
                            >
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Stage 5: Mission Statement */}
                        <td>
                          {s5?.isCompleted ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#dcfce7",
                                color: "#15803d",
                              }}
                              title="Mission Statement Approved — Learner Certified"
                            >
                              Approved
                            </span>
                          ) : isMissionPending ? (
                            <button
                              type="button"
                              onClick={() => setMissionModalLearner(learner)}
                              style={{
                                background: "rgba(201, 122, 30, 0.1)",
                                border: "1px solid var(--accent-primary)",
                                color: "var(--accent-primary)",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                              title="Click to review and approve mission statement"
                            >
                              Review &amp; Approve ↗
                            </button>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#f3f4f6",
                                color: "#9ca3af",
                              }}
                            >
                              Not Submitted
                            </span>
                          )}
                        </td>

                        {/* Action: View Profile */}
                        <td style={{ textAlign: "right" }}>
                          <Link
                            href={`/users/${learner.userId}?enrolmentId=${learner.id}&batchId=${batchId}&batchName=${encodeURIComponent(batch?.name || "Batch")}`}
                            className={styles.secondaryBtn}
                            style={{
                              fontSize: "0.76rem",
                              padding: "0.3rem 0.65rem",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                            title="Open full student profile & progression card"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>View Profile</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>↗</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredLearners.length > 0 && (
            <Pagination
              currentPage={learnerPage}
              totalItems={filteredLearners.length}
              pageSize={learnerPageSize}
              onPageChange={(p) => setLearnerPage(p)}
              onPageSizeChange={(sz) => {
                setLearnerPageSize(sz);
                setLearnerPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="learners"
            />
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          TAB 2: WEEKLY LIVE SESSIONS & ATTENDANCE MANAGEMENT
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "sessions" && (
        <section className={styles.tableSection}>
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 700 }}>Live Cohort Sessions</h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Weekly live Zoom meetings and attendance tracking for {batch?.name}
              </p>
            </div>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setIsCreateSessionModalOpen(true)}
              style={{ fontSize: "0.84rem", padding: "0.45rem 0.9rem" }}
            >
              + Schedule Live Session
            </button>
          </div>

          <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
            <table className={styles.adminTable} style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleSessionSort("title")}
                    style={{ minWidth: "180px", cursor: "pointer", userSelect: "none" }}
                    aria-sort={sessionSortField === "title" ? (sessionSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>Session Topic</span>
                      <SortIndicator active={sessionSortField === "title"} order={sessionSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionSort("date")}
                    style={{ width: "190px", cursor: "pointer", userSelect: "none" }}
                    aria-sort={sessionSortField === "date" ? (sessionSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>Scheduled Date &amp; Time</span>
                      <SortIndicator active={sessionSortField === "date"} order={sessionSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionSort("trainer")}
                    style={{ width: "120px", cursor: "pointer", userSelect: "none" }}
                    aria-sort={sessionSortField === "trainer" ? (sessionSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>Trainer / Host</span>
                      <SortIndicator active={sessionSortField === "trainer"} order={sessionSortOrder} />
                    </div>
                  </th>
                  <th style={{ width: "115px" }}>Zoom Links</th>
                  <th style={{ width: "140px" }}>Recorded Video</th>
                  <th
                    onClick={() => handleSessionSort("status")}
                    style={{ width: "100px", cursor: "pointer", userSelect: "none" }}
                    aria-sort={sessionSortField === "status" ? (sessionSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>Status</span>
                      <SortIndicator active={sessionSortField === "status"} order={sessionSortOrder} />
                    </div>
                  </th>
                  <th style={{ width: "135px", textAlign: "right" }}>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingSessions ? (
                  <TableSkeleton columns={7} rows={4} />
                ) : sortedSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "3rem 1rem" }}>
                      <EmptyState
                        icon="calendar"
                        title="No live sessions scheduled yet"
                        description="Schedule the weekly Zoom classes for this batch cohort."
                        actionLabel="+ Schedule First Session"
                        onAction={() => setIsCreateSessionModalOpen(true)}
                      />
                    </td>
                  </tr>
                ) : (
                  sortedSessions.map((sess) => {
                    const startIso = sess.startTime;
                    const durationMin = sess.durationMinutes || 60;
                    const endIso = sess.endTime || (startIso ? new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString() : "");

                    let dateDisplay = "TBD";
                    let timeDisplay = "";
                    if (startIso) {
                      try {
                        dateDisplay = new Date(startIso).toLocaleDateString(undefined, {
                          timeZone: selectedTz,
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                        const sTime = formatShortTimeInTz(startIso, selectedTz);
                        const eTime = endIso ? formatShortTimeInTz(endIso, selectedTz) : "";
                        timeDisplay = eTime ? `${sTime} – ${eTime}` : sTime;
                      } catch {
                        dateDisplay = new Date(startIso).toLocaleDateString();
                        timeDisplay = new Date(startIso).toLocaleTimeString();
                      }
                    }

                    return (
                      <tr key={sess.id}>
                        <td>
                          <span className={styles.cellUserName}>{sess.title}</span>
                          <span className={styles.cellUserEmail}>
                            {sess.sessionType === "ONE_ON_ONE" ? "1-on-1 Coaching Session" : "Cohort Live Workshop"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              {dateDisplay}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {timeDisplay} ({selectedTz.replace(/_/g, " ")})
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.cellText}>{sess.hostTrainer?.name || batch?.manager?.name || "Host Trainer"}</span>
                        </td>
                        <td>
                          {sess.joinUrl ? (
                            <div style={{ display: "flex", gap: "6px" }}>
                              <a
                                href={sess.joinUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.secondaryBtn}
                                style={{
                                  fontSize: "0.74rem",
                                  padding: "3px 8px",
                                  textDecoration: "none",
                                  color: "var(--accent-primary)",
                                  borderColor: "var(--accent-primary)",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                <span>Join Zoom</span>
                                <span style={{ fontSize: "0.7rem" }}>↗</span>
                              </a>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No link</span>
                          )}
                        </td>
                        <td>
                          {editingRecordingSessionId === sess.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
                              <input
                                type="url"
                                placeholder="Paste MP4 / Cloudinary link..."
                                value={newRecordingUrl}
                                onChange={(e) => setNewRecordingUrl(e.target.value)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.75rem",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--surface)",
                                  color: "var(--text-primary)",
                                  width: "100%",
                                }}
                                autoFocus
                              />
                              <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  onClick={() => setEditingRecordingSessionId(null)}
                                  style={{ padding: "2px 6px", fontSize: "0.72rem" }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className={styles.primaryBtn}
                                  onClick={() => handleSaveRecordingUrl(sess.id)}
                                  style={{ padding: "2px 6px", fontSize: "0.72rem" }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : sess.recordingUrl ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <a
                                href={sess.recordingUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.74rem",
                                  color: "#166534",
                                  background: "#f0fdf4",
                                  border: "1px solid #bbf7d0",
                                  padding: "2px 7px",
                                  borderRadius: "4px",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                }}
                                title="Open recorded session video"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span>Watch Video</span>
                                <span style={{ fontSize: "0.7rem" }}>↗</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRecordingSessionId(sess.id);
                                  setNewRecordingUrl(sess.recordingUrl || "");
                                }}
                                title="Edit recording URL"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  padding: "2px 4px",
                                  fontSize: "0.76rem",
                                }}
                              >
                                ✎
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecordingSessionId(sess.id);
                                setNewRecordingUrl("");
                              }}
                              className={styles.secondaryBtn}
                              style={{
                                padding: "3px 8px",
                                fontSize: "0.73rem",
                                borderStyle: "dashed",
                                color: "var(--text-muted)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 7l-7 5 7 5V7z" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                              </svg>
                              <span>+ Add Video</span>
                            </button>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={sess.status} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                            {sess.meetingProvider === "ZOOM" && (
                              <button
                                type="button"
                                disabled={syncingSessionId === sess.id}
                                onClick={() => handleSyncZoomAttendance(sess.id)}
                                className={styles.secondaryBtn}
                                style={{
                                  fontSize: "0.74rem",
                                  padding: "3px 8px",
                                  color: "var(--accent-primary, #0284c7)",
                                  borderColor: "var(--accent-primary, #0284c7)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  whiteSpace: "nowrap",
                                  opacity: syncingSessionId === sess.id ? 0.6 : 1,
                                }}
                                title="Sync Zoom attendance report automatically"
                              >
                                {syncingSessionId === sess.id ? "Syncing..." : "Sync Zoom"}
                              </button>
                            )}
                            <Link
                              href={`/batches/${batchId}/sessions/${sess.id}/attendance`}
                              className={styles.secondaryBtn}
                              style={{
                                fontSize: "0.74rem",
                                padding: "3px 8px",
                                textDecoration: "none",
                                color: "var(--text-primary)",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                whiteSpace: "nowrap",
                              }}
                              title="Mark attendance for cohort learners"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                              </svg>
                              <span>Mark Attendance</span>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>↗</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          TAB 3: BROADCAST ANNOUNCEMENTS TO BATCH
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "broadcast" && (
        <section className={styles.tableSection} style={{ padding: "1.75rem" }}>
          <div style={{ maxWidth: "680px", background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: "10px", padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              Targeted Batch Announcement
            </h2>
            <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
              Send an announcement directly to the <strong>{learners.length} active learners</strong> enrolled in {batch?.name}. Notifications are delivered to their in-app bell and sent to their email.
            </p>

            <form onSubmit={handleSendBroadcast} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Announcement Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Workshop Rescheduled: Tomorrow at 7:30 PM GST"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Message Content *</label>
                <textarea
                  placeholder="Write your announcement message, Zoom update, or preparation instructions for the batch..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className={styles.formInput}
                  rows={5}
                  required
                  style={{ resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
                  Delivery Channels
                </label>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "0.84rem",
                      cursor: "pointer",
                      background: broadcastInApp ? "rgba(201, 122, 30, 0.08)" : "var(--background-subtle, #f8f6f0)",
                      border: broadcastInApp ? "1px solid var(--accent-primary)" : "1px solid var(--border-light)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={broadcastInApp}
                      onChange={(e) => setBroadcastInApp(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontWeight: broadcastInApp ? 600 : 500 }}>🔔 In-App Notification Bell</span>
                  </label>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "0.84rem",
                      cursor: "pointer",
                      background: broadcastEmail ? "rgba(201, 122, 30, 0.08)" : "var(--background-subtle, #f8f6f0)",
                      border: broadcastEmail ? "1px solid var(--accent-primary)" : "1px solid var(--border-light)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={broadcastEmail}
                      onChange={(e) => setBroadcastEmail(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontWeight: broadcastEmail ? 600 : 500 }}>✉️ Direct Email Dispatch</span>
                  </label>
                </div>
              </div>

              <div style={{ paddingTop: "0.5rem" }}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSendingBroadcast || learners.length === 0}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  {isSendingBroadcast ? (
                    "Broadcasting..."
                  ) : (
                    <>
                      <span>Send Announcement to All {learners.length} Learners</span>
                      <span>✈</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {broadcastHistory.length > 0 && (
              <div style={{ marginTop: "2.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>Sent in this Session</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {broadcastHistory.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "0.85rem 1rem",
                        background: "var(--bg-card-muted, #fdfbf7)",
                        border: "1px solid var(--border-light)",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <strong style={{ fontSize: "0.9rem" }}>{item.title}</strong>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                          {new Date(item.sentAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 6px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        {item.message}
                      </p>
                      <span style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 600 }}>
                        ✓ Delivered to {item.recipientCount} recipient(s) via {item.channels.join(" + ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          TAB 4: BATCH CONFIGURATION & SETTINGS
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <section className={styles.tableSection} style={{ padding: "1.75rem" }}>
          <div style={{ maxWidth: "680px", background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: "10px", padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              Batch Configuration & Lifecycle
            </h2>
            <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
              Update cohort schedule, capacity constraints, status, and assigned manager for <strong>{batch?.name}</strong>.
            </p>

            <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {settingsError && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(220, 38, 38, 0.08)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "8px",
                    color: "#dc2626",
                    fontSize: "0.88rem",
                  }}
                  role="alert"
                >
                  {settingsError}
                </div>
              )}

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Batch Name <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Winter Batch 2026"
                  required
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Program</label>
                <input
                  type="text"
                  value={batch?.program?.title || "—"}
                  disabled
                  className={styles.formInput}
                  style={{ background: "#f5ece1", color: "var(--text-secondary)", cursor: "not-allowed" }}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Start Date <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  </label>
                  <DatePicker
                    value={settingsStartDate}
                    onChange={(val) => {
                      setSettingsStartDate(val);
                      if (settingsEndDate && val && val > settingsEndDate) {
                        setSettingsEndDate("");
                      }
                    }}
                    placeholder="Select Start Date"
                    ariaLabel="Start Date"
                    minWidth="100%"
                    maxDate={settingsEndDate || undefined}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    End Date <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <DatePicker
                    value={settingsEndDate}
                    onChange={setSettingsEndDate}
                    placeholder="Select End Date (Optional)"
                    ariaLabel="End Date (Optional)"
                    minWidth="100%"
                    minDate={settingsStartDate || undefined}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span>Registration Deadline</span>
                  <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  <div className={styles.helpTooltip}>
                    <span
                      className={styles.helpIcon}
                      aria-label="Registration Cutoff Information"
                      tabIndex={0}
                    >
                      ?
                    </span>
                    <div className={styles.helpTooltipContent}>
                      Learners cannot self-enroll after this date. Admins can manually assign students anytime.
                    </div>
                  </div>
                </label>
                <DatePicker
                  value={settingsRegistrationDeadline}
                  onChange={setSettingsRegistrationDeadline}
                  placeholder="Select Registration Deadline"
                  ariaLabel="Registration Deadline"
                  minWidth="100%"
                  maxDate={settingsEndDate || undefined}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Max Capacity <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={learners.length}
                    required
                    value={settingsCapacity}
                    onChange={(e) => setSettingsCapacity(e.target.value)}
                    className={styles.formInput}
                  />
                  <small style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: "3px" }}>
                    Currently enrolled: {learners.length} students
                  </small>
                </div>

                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Batch Status</label>
                  <CustomSelect
                    value={settingsStatus}
                    onChange={setSettingsStatus}
                    fullWidth
                    ariaLabel="Batch Status"
                    options={[
                      { value: "ACTIVE", label: "Active" },
                      { value: "UPCOMING", label: "Upcoming" },
                      { value: "COMPLETED", label: "Completed" },
                      { value: "ARCHIVED", label: "Archived" },
                    ]}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Assign Manager <span className={styles.optionalLabel}>(Optional)</span>
                </label>
                <CustomSelect
                  value={settingsManagerId}
                  onChange={setSettingsManagerId}
                  fullWidth
                  ariaLabel="Assign Manager"
                  placeholder="Select a Manager..."
                  options={[
                    { value: "", label: "None / Unassigned" },
                    ...managers.map((m) => ({
                      value: m.id,
                      label: m.name || m.email,
                    })),
                  ]}
                />
              </div>

              <div style={{ paddingTop: "0.5rem" }}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSavingSettings}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  {isSavingSettings ? "Saving Settings..." : "Save Batch Settings"}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}



      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: ASSIGN LEARNER TO BATCH
          ───────────────────────────────────────────────────────────────────────── */}
      {isAssignModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsAssignModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Assign Learner to {batch?.name}</h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  Select an existing user to provision an active enrollment in <strong>{batch?.program?.title}</strong> for this cohort batch.
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsAssignModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody} style={{ padding: "1.25rem" }}>
              {/* Dual-Mode Segmented Tabs */}
              <div style={{ display: "flex", background: "#f5ece1", padding: "3px", borderRadius: "8px", marginBottom: "1.25rem", gap: "4px" }}>
                <button
                  type="button"
                  onClick={() => setAssignMode("existing")}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: assignMode === "existing" ? "#ffffff" : "transparent",
                    color: assignMode === "existing" ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: assignMode === "existing" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  Assign Existing Learner
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode("new")}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: assignMode === "new" ? "#ffffff" : "transparent",
                    color: assignMode === "new" ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: assignMode === "new" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  Create New Learner &amp; Assign
                </button>
              </div>

              {assignMode === "existing" ? (
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Select User *</label>
                  <CustomSelect
                    value={selectedUserToAssign}
                    onChange={setSelectedUserToAssign}
                    options={[
                      { value: "", label: "Search and select a user..." },
                      ...allUsers.map((u) => ({
                        value: u.id,
                        label: `${u.name || "Unnamed"} (${u.email})`,
                      })),
                    ]}
                    fullWidth
                    menuMaxHeight="200px"
                    ariaLabel="Select user"
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <div className={styles.formGroup}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., Alex Johnson"
                      value={newLearnerName}
                      onChange={(e) => setNewLearnerName(e.target.value)}
                      className={styles.modalInput}
                      style={{ width: "100%", boxSizing: "border-box", padding: "0.55rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-light, #e7decb)", fontSize: "0.85rem" }}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Email Address *</label>
                    <input
                      type="email"
                      placeholder="e.g., alex@example.com"
                      value={newLearnerEmail}
                      onChange={(e) => setNewLearnerEmail(e.target.value)}
                      className={styles.modalInput}
                      style={{ width: "100%", boxSizing: "border-box", padding: "0.55rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-light, #e7decb)", fontSize: "0.85rem" }}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Phone Number (Optional)</label>
                    <input
                      type="tel"
                      placeholder="e.g., +971 50 123 4567"
                      value={newLearnerPhone}
                      onChange={(e) => setNewLearnerPhone(e.target.value)}
                      className={styles.modalInput}
                      style={{ width: "100%", boxSizing: "border-box", padding: "0.55rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-light, #e7decb)", fontSize: "0.85rem" }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isAssigning}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleAssignLearner}
                disabled={
                  isAssigning ||
                  (assignMode === "existing"
                    ? !selectedUserToAssign
                    : !newLearnerName.trim() || !newLearnerEmail.trim())
                }
              >
                {isAssigning
                  ? "Processing..."
                  : assignMode === "new"
                  ? "Create & Assign to Batch"
                  : "Assign to Batch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: SCHEDULE LIVE SESSION
          ───────────────────────────────────────────────────────────────────────── */}
      {isCreateSessionModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsCreateSessionModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <form onSubmit={handleCreateSession}>
              <div className={styles.modalHeader}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Schedule Live Cohort Session</h3>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setIsCreateSessionModalOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className={styles.modalBody} style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Session Topic / Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Week 1: Strategic Foundations & Orientation"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    className={styles.formInput}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", alignItems: "flex-start" }}>
                  <div className={styles.formGroup}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      Session Date *
                    </label>
                    <DatePicker
                      value={sessionWallDate}
                      onChange={setSessionWallDate}
                      placeholder="Select session date"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        Start Time (24h) *
                      </label>
                      {sessionWallTime && (
                        <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                          {format24To12(sessionWallTime)}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="19:00 (HH:MM)"
                      value={sessionWallTime}
                      onChange={(e) => setSessionWallTime(e.target.value)}
                      className={styles.formInput}
                      required
                    />
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                      {["10:00", "14:00", "18:00", "19:00", "20:00"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSessionWallTime(t)}
                          style={{
                            background: sessionWallTime === t ? "var(--accent-primary)" : "var(--surface)",
                            color: sessionWallTime === t ? "#fff" : "var(--text-secondary)",
                            border: "1px solid var(--border-light)",
                            borderRadius: "4px",
                            padding: "1px 6px",
                            fontSize: "0.7rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className={styles.formGroup}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Duration (Minutes)</label>
                    <input
                      type="number"
                      min={15}
                      step={15}
                      value={sessionDurationMinutes}
                      onChange={(e) => setSessionDurationMinutes(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Timezone</label>
                    <CustomSelect
                      value={selectedTz}
                      onChange={setSelectedTz}
                      options={tzOptions}
                      fullWidth
                      ariaLabel="Timezone"
                    />
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsCreateSessionModalOpen(false)}
                  disabled={isSubmittingSession}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmittingSession}
                >
                  {isSubmittingSession ? "Scheduling..." : "Schedule Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: MISSION STATEMENT REVIEW & CERTIFICATE APPROVAL
          ───────────────────────────────────────────────────────────────────────── */}
      {missionModalLearner && (
        <div className={styles.modalOverlay} onClick={() => setMissionModalLearner(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Mission Statement Review: {missionModalLearner.user.name}
              </h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setMissionModalLearner(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody} style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-muted)" }}>
                Review the learner's submitted manifesto or graduation requirement. Approving marks Stage 5 satisfied and awards their Certificate of Completion.
              </p>

              <div
                style={{
                  padding: "1rem",
                  background: "var(--bg-card-muted, #fdfbf7)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "8px",
                  fontSize: "0.88rem",
                  lineHeight: 1.6,
                  color: "var(--text-primary)",
                  fontStyle: "italic",
                }}
              >
                {missionModalLearner.stages?.STAGE_5_MISSION_STATEMENT?.details?.submissionText ||
                  "Learner has fulfilled their required written commitment and graduation milestones for this program."}
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Coach Approval Feedback (Optional)</label>
                <textarea
                  placeholder="Add personalized congratulatory feedback for the student..."
                  value={missionFeedback}
                  onChange={(e) => setMissionFeedback(e.target.value)}
                  className={styles.formInput}
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setMissionModalLearner(null)}
                disabled={isApprovingMission}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleApproveMission}
                disabled={isApprovingMission}
                style={{ background: "#16a34a", borderColor: "#16a34a" }}
              >
                {isApprovingMission ? "Approving..." : "Approve & Issue Certificate ✓"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: BATCH SETTINGS (SIMILAR TO CREATE BATCH POPUP)
          ───────────────────────────────────────────────────────────────────────── */}
      {isSettingsModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsSettingsModalOpen(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "620px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
          >
            <div className={styles.modalHeader} style={{ padding: "1rem 1.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                Batch Settings
              </h2>
              <button
                className={styles.closeBtn}
                onClick={() => setIsSettingsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className={styles.modalForm}
              onSubmit={handleSaveSettings}
              style={{
                padding: "1.25rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                overflowY: "auto",
                flex: 1,
              }}
            >
              {settingsError && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(220, 38, 38, 0.08)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "8px",
                    color: "#dc2626",
                    fontSize: "0.88rem",
                    marginBottom: "0.25rem",
                  }}
                  role="alert"
                >
                  {settingsError}
                </div>
              )}

              <div className={styles.formGroup}>
                <label>
                  Batch Name <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Winter Batch 2026"
                  required
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Program</label>
                <input
                  type="text"
                  value={batch?.program?.title || "—"}
                  disabled
                  style={{ background: "#f5ece1", color: "var(--text-secondary)", cursor: "not-allowed" }}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>
                    Start Date <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  </label>
                  <DatePicker
                    value={settingsStartDate}
                    onChange={(val) => {
                      setSettingsStartDate(val);
                      if (settingsEndDate && val && val > settingsEndDate) {
                        setSettingsEndDate("");
                      }
                    }}
                    placeholder="Select Start Date"
                    ariaLabel="Start Date"
                    minWidth="100%"
                    maxDate={settingsEndDate || undefined}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>
                    End Date <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <DatePicker
                    value={settingsEndDate}
                    onChange={setSettingsEndDate}
                    placeholder="Select End Date (Optional)"
                    ariaLabel="End Date (Optional)"
                    minWidth="100%"
                    minDate={settingsStartDate || undefined}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span>Registration Deadline</span>
                  <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  <div className={styles.helpTooltip}>
                    <span
                      className={styles.helpIcon}
                      aria-label="Registration Cutoff Information"
                      tabIndex={0}
                    >
                      ?
                    </span>
                    <div className={styles.helpTooltipContent}>
                      Learners cannot self-enroll after this date. Admins can manually assign students anytime.
                    </div>
                  </div>
                </label>
                <DatePicker
                  value={settingsRegistrationDeadline}
                  onChange={setSettingsRegistrationDeadline}
                  placeholder="Select Registration Deadline"
                  ariaLabel="Registration Deadline"
                  minWidth="100%"
                  maxDate={settingsEndDate || undefined}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>
                    Max Capacity <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={confirmedLearners.length}
                    required
                    value={settingsCapacity}
                    onChange={(e) => setSettingsCapacity(e.target.value)}
                  />
                  <small style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: "3px" }}>
                    Currently confirmed: {confirmedLearners.length} students
                  </small>
                </div>

                <div className={styles.formGroup}>
                  <label>Batch Status</label>
                  <CustomSelect
                    value={settingsStatus}
                    onChange={setSettingsStatus}
                    fullWidth
                    ariaLabel="Batch Status"
                    options={[
                      { value: "ACTIVE", label: "Active" },
                      { value: "UPCOMING", label: "Upcoming" },
                      { value: "COMPLETED", label: "Completed" },
                      { value: "ARCHIVED", label: "Archived" },
                    ]}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>
                  Assign Manager <span className={styles.optionalLabel}>(Optional)</span>
                </label>
                <CustomSelect
                  value={settingsManagerId}
                  onChange={setSettingsManagerId}
                  fullWidth
                  ariaLabel="Assign Manager"
                  placeholder="Select a Manager..."
                  options={[
                    { value: "", label: "None / Unassigned" },
                    ...managers.map((m) => ({
                      value: m.id,
                      label: m.name || m.email,
                    })),
                  ]}
                />
              </div>

              <div className={styles.modalFooter} style={{ padding: "1rem 0 0", marginTop: "0.5rem", borderTop: "1px solid var(--border-light)" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsSettingsModalOpen(false)}
                  disabled={isSavingSettings}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSavingSettings}
                >
                  {isSavingSettings ? "Saving Settings..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Seat Release Dialog */}
      <ConfirmDialog
        isOpen={Boolean(releasingLearner)}
        title="Release Reserved Seat?"
        description={`Are you sure you want to release the reserved seat for ${releasingLearner?.user?.name || "this user"}? Their provisional checkout hold will be cancelled, freeing batch capacity immediately. Their signed agreement will remain preserved for legal audit.`}
        confirmText={isReleasingSeat ? "Releasing..." : "Yes, Release Seat"}
        cancelText="Keep Reservation"
        tone="danger"
        isLoading={isReleasingSeat}
        onConfirm={handleReleaseSeat}
        onClose={() => setReleasingLearner(null)}
      />
    </div>
  );
}
