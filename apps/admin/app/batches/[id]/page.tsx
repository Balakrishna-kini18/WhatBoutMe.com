"use client";

import { useEffect, useState, useMemo, use, useCallback, useRef } from "react";
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
  broadcastNotification,
  apiGet,
  invalidateCache,
  fetchOneOnOneRequests,
  approveOneOnOneRequest,
  rejectOneOnOneRequest,
  fetchMissionStatements,
  rejectMissionStatement,
  approveMissionStatement,
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
  Modal,
  ActionMenu,
  useToast,
  TableSkeleton,
  EmptyState,
  StatusBadge,
  Pagination,
  DatePicker,
  TimePicker,
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
  sessionType: "GROUP_COHORT" | "ONE_ON_ONE" | string;
  capacity: number;
  meetingProvider?: string | null;
  durationMinutes?: number | null;
  minAttendanceMinutes?: number | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED" | string;
  startTime: string;
  endTime: string;
  timezone?: string | null;
  joinUrl: string | null;
  hostUrl?: string | null;
  recordingUrl: string | null;
  quizId: string | null;
  hostTrainer?: { id: string; name: string; email: string } | null;
  isRequired?: boolean;
  _count?: { attendances?: number; bookings?: number };
}

type BatchTab = "learners" | "awaiting_payment" | "sessions" | "broadcast";
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
    if (tabParam && ["learners", "awaiting_payment", "sessions", "broadcast"].includes(tabParam)) {
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

  // Tab 2: Awaiting Payment State
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);
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

  // Mission Statement Approval Modal State
  const [missionModalLearner, setMissionModalLearner] = useState<EnrolledLearner | null>(null);
  const [missionSubmission, setMissionSubmission] = useState<any | null>(null);
  const [isLoadingMissionDoc, setIsLoadingMissionDoc] = useState(false);
  const [missionFeedback, setMissionFeedback] = useState("");
  const [isApprovingMission, setIsApprovingMission] = useState(false);

  // 1-on-1 Coaching Modal State
  const [coachingModalLearner, setCoachingModalLearner] = useState<EnrolledLearner | null>(null);
  const [coachingRequest, setCoachingRequest] = useState<any | null>(null);
  const [isLoadingCoaching, setIsLoadingCoaching] = useState(false);
  const [actingCoaching, setActingCoaching] = useState(false);

  const openMissionModal = async (learner: EnrolledLearner) => {
    setMissionModalLearner(learner);
    setMissionFeedback("");
    setIsLoadingMissionDoc(true);
    try {
      const list = await fetchMissionStatements();
      const found = list.find((m: any) => m.enrolmentId === learner.id || m.userId === learner.userId);
      setMissionSubmission(found || null);
    } catch (err) {
      console.warn("Could not load mission statement document:", err);
      setMissionSubmission(null);
    } finally {
      setIsLoadingMissionDoc(false);
    }
  };

  const openCoachingModal = async (learner: EnrolledLearner) => {
    setCoachingModalLearner(learner);
    setIsLoadingCoaching(true);
    try {
      const reqs = await fetchOneOnOneRequests();
      const found = reqs.find((r: any) => r.enrolmentId === learner.id || r.userId === learner.userId);
      setCoachingRequest(found || null);
    } catch (err) {
      console.warn("Could not load coaching request:", err);
      setCoachingRequest(null);
    } finally {
      setIsLoadingCoaching(false);
    }
  };

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
  const [selectedTz, setSelectedTz] = useState(() => (typeof window !== "undefined" ? getSystemTimezone() : "Asia/Kolkata"));
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);
  const [editingRecordingSessionId, setEditingRecordingSessionId] = useState<string | null>(null);
  const [newRecordingUrl, setNewRecordingUrl] = useState("");
  const [syncingSessionId, setSyncingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const detected = getSystemTimezone();
      if (detected) setSelectedTz(detected);
    }
  }, []);

  const handleSyncZoomAttendance = async (sessionId: string) => {
    setSyncingSessionId(sessionId);
    try {
      const res = await cachedFetch(`${API_URL}/batches/${batchId}/sessions/${sessionId}/sync-attendance`, {
        method: "POST",
        headers: {
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
  const [broadcastTarget, setBroadcastTarget] = useState<"ALL_BATCH" | "INDIVIDUAL">("ALL_BATCH");
  const [selectedLearnerUserId, setSelectedLearnerUserId] = useState<string>("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastInApp, setBroadcastInApp] = useState(true);
  const [broadcastEmail, setBroadcastEmail] = useState(true);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [broadcastAttachments, setBroadcastAttachments] = useState<
    Array<{ name: string; size: number; type: string; base64: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    for (const file of fileList) {
      if (file.size > 10 * 1024 * 1024) {
        toastError(`File "${file.name}" exceeds the 10 MB limit.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setBroadcastAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setBroadcastAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const [broadcastHistory, setBroadcastHistory] = useState<Array<{
    id: string;
    title: string;
    message: string;
    sentAt: string;
    recipientCount: number;
    channels: string[];
    targetLabel?: string;
  }>>([]);

  // Batch Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsProgramId, setSettingsProgramId] = useState("");
  const [settingsStartDate, setSettingsStartDate] = useState("");
  const [settingsEndDate, setSettingsEndDate] = useState("");
  const [settingsRegistrationDeadline, setSettingsRegistrationDeadline] = useState("");
  const [settingsCapacity, setSettingsCapacity] = useState("");
  const [settingsManagerId, setSettingsManagerId] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsAwardCertificate, setSettingsAwardCertificate] = useState(true);
  const [programs, setPrograms] = useState<Array<{ id: string; title: string; hasCertificate?: boolean }>>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const openSettingsModal = () => {
    if (batch) {
      setSettingsName(batch.name || "");
      const progId = batch.programId || batch.program?.id || "";
      setSettingsProgramId(progId);
      setSettingsStartDate(batch.startDate ? new Date(batch.startDate).toISOString().slice(0, 10) : "");
      setSettingsEndDate(batch.endDate ? new Date(batch.endDate).toISOString().slice(0, 10) : "");
      setSettingsRegistrationDeadline(batch.registrationDeadline ? new Date(batch.registrationDeadline).toISOString().slice(0, 10) : "");
      setSettingsCapacity(String(batch.capacity || 50));
      setSettingsManagerId(batch.managerId || batch.manager?.id || "");
      setSettingsStatus(batch.status || "");
      const matchedProg = programs.find((p) => p.id === progId);
      setSettingsAwardCertificate(matchedProg?.hasCertificate ?? batch.program?.hasCertificate ?? true);
    }
    setSettingsError("");
    setIsSettingsModalOpen(true);
  };

  // Timezone options
  const tzOptions = useMemo(() => getTimezoneOptions(), []);

  // Time format state (12h vs 24h), hydrated from localStorage
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFmt = localStorage.getItem("wbm_time_format");
      if (savedFmt === "12h" || savedFmt === "24h") {
        setTimeFormat(savedFmt);
      }
    }
  }, []);

  const handleTimeFormatToggle = (fmt: "12h" | "24h") => {
    setTimeFormat(fmt);
    if (typeof window !== "undefined") {
      localStorage.setItem("wbm_time_format", fmt);
    }
  };

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
    return `${displayH}:${displayM} ${period}`;
  }, []);



  // Calculated session end time based on start time + duration minutes
  const sessionEndTimeFormatted = useMemo(() => {
    if (!sessionWallTime || !sessionWallTime.includes(":")) return "";
    const [hStr, mStr] = sessionWallTime.split(":");
    const h = parseInt(hStr || "0", 10);
    const m = parseInt(mStr || "0", 10);
    if (isNaN(h) || isNaN(m)) return "";

    const durationNum = parseInt(sessionDurationMinutes, 10) || 60;
    const totalMinutes = h * 60 + m + durationNum;
    const endH24 = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;

    const displayM = endM < 10 ? `0${endM}` : String(endM);

    if (timeFormat === "24h") {
      const displayH = endH24 < 10 ? `0${endH24}` : String(endH24);
      return `${displayH}:${displayM}`;
    }

    const period = endH24 >= 12 ? "PM" : "AM";
    const displayH = endH24 % 12 === 0 ? 12 : endH24 % 12;
    return `${displayH}:${displayM} ${period}`;
  }, [sessionWallTime, sessionDurationMinutes, timeFormat]);

  // Initial Data Fetch
  const loadBatchData = useCallback(async () => {
    setIsLoadingBatch(true);
    setBatchError(null);
    try {
      const data = await getBatchById(batchId);
      setBatch(data);

      // Populate Settings Form fields
      setSettingsName(data.name || "");
      setSettingsProgramId(data.programId || data.program?.id || "");
      setSettingsStartDate(data.startDate ? new Date(data.startDate).toISOString().slice(0, 10) : "");
      setSettingsEndDate(data.endDate ? new Date(data.endDate).toISOString().slice(0, 10) : "");
      setSettingsRegistrationDeadline(data.registrationDeadline ? new Date(data.registrationDeadline).toISOString().slice(0, 10) : "");
      setSettingsCapacity(String(data.capacity || 50));
      setSettingsManagerId(data.managerId || data.manager?.id || "");
      setSettingsStatus(data.status || "ACTIVE");
      setSettingsAwardCertificate(data.program?.hasCertificate ?? true);

      // Extract Enrolled Learners (waitlist is managed globally at Batches level, not inside individual batch)
      const rawEnrolments: any[] = data.enrolments || [];
      const formattedLearners: EnrolledLearner[] = rawEnrolments
        .filter((e) => e.status !== "WAITLIST")
        .map((e) => ({
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

  // Fetch 5-Stage Progression for batch in 1 single optimized API call
  const fetchLearnerStages = async (learnerList: EnrolledLearner[]) => {
    try {
      const batchStagesRes = await apiGet<Record<string, any>>(`/progression/batches/${batchId}/stages`).catch(() => null);
      if (batchStagesRes && typeof batchStagesRes === "object") {
        setLearners((prev) =>
          prev.map((l) => (batchStagesRes[l.id]?.stages ? { ...l, stages: batchStagesRes[l.id].stages } : l))
        );
        return;
      }
    } catch (err) {
      console.warn("Batch progression endpoint fallback:", err);
    }

    const targets = learnerList.filter(
      (l) => l.status !== "PENDING_PAYMENT" && l.status !== "PENDING_AGREEMENT" && !l.stages
    );
    if (targets.length === 0) return;

    try {
      const results = await Promise.allSettled(
        targets.map(async (enrolment) => {
          const stagesRes = await apiGet<any>(`/progression/enrolments/${enrolment.id}/stages`).catch(() => null);
          return { id: enrolment.id, stages: stagesRes?.stages || null };
        })
      );

      const stagesMap = new Map<string, any>();
      for (const res of results) {
        if (res.status === "fulfilled" && res.value?.stages) {
          stagesMap.set(res.value.id, res.value.stages);
        }
      }

      setLearners((prev) =>
        prev.map((l) => (stagesMap.has(l.id) ? { ...l, stages: stagesMap.get(l.id) } : l))
      );
    } catch (err) {
      console.warn("Could not load learner stages:", err);
    }
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

  // Load Managers, Programs & Users for Dropdowns
  const loadSupportingData = useCallback(async () => {
    try {
      const [managersRes, programsRes] = await Promise.all([
        cachedFetch(`${API_URL}/users?role=MANAGER`),
        cachedFetch(`${API_URL}/programs`),
      ]);
      if (managersRes.ok) {
        const json = await managersRes.json();
        setManagers(Array.isArray(json) ? json : json?.data || []);
      }
      if (programsRes.ok) {
        const json = await programsRes.json();
        const list = Array.isArray(json) ? json : json?.programs || json?.data || [];
        setPrograms(list.map((p: any) => ({ id: p.id, title: p.title || p.name, hasCertificate: p.hasCertificate })));
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

  // Split Confirmed vs Awaiting Payment (waitlist is managed globally at Batches level)
  const confirmedLearners = useMemo(() => {
    return learners.filter((l) => l.status !== "PENDING_PAYMENT" && l.status !== "WAITLIST");
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

  // Filtered Confirmed Learners for Tab 1
  const filteredLearners = useMemo(() => {
    let result = confirmedLearners;

    if (learnerStatusFilter !== "ALL") {
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
  }, [confirmedLearners, learnerSearch, learnerStatusFilter]);

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

  // Filtered Awaiting Payment Learners for Tab 2
  const filteredPendingLearners = useMemo(() => {
    const q = pendingSearch.toLowerCase().trim();
    if (!q) return pendingPaymentLearners;
    return pendingPaymentLearners.filter(
      (l) =>
        l.user?.name?.toLowerCase().includes(q) ||
        l.user?.email?.toLowerCase().includes(q)
    );
  }, [pendingPaymentLearners, pendingSearch]);

  const totalPendingPages = Math.max(1, Math.ceil(filteredPendingLearners.length / pendingPageSize));

  useEffect(() => {
    if (pendingPage > totalPendingPages) {
      setPendingPage(1);
    }
  }, [pendingPage, totalPendingPages]);

  const paginatedPendingLearners = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize;
    return filteredPendingLearners.slice(start, start + pendingPageSize);
  }, [filteredPendingLearners, pendingPage, pendingPageSize]);

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
    if (isSubmittingSession) return;
    if (!sessionTitle.trim() || !sessionWallDate || !sessionWallTime) {
      toastError("Please fill out the session title, date, and time.");
      return;
    }

    setIsSubmittingSession(true);
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
        durationMinutes: durationNum,
        timezone: selectedTz,
        capacity: batch?.capacity || 50,
      });

      toastSuccess("Live batch session scheduled successfully.");
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
      const res = await cachedFetch(`${API_URL}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
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

    if (broadcastTarget === "INDIVIDUAL" && !selectedLearnerUserId) {
      toastError("Please select an individual learner from the batch.");
      return;
    }

    setIsSendingBroadcast(true);
    try {
      const isIndividual = broadcastTarget === "INDIVIDUAL";
      const targetUser = isIndividual ? confirmedLearners.find((l) => l.userId === selectedLearnerUserId) : null;

      const result = await broadcastNotification({
        target: isIndividual ? "USER" : "BATCH",
        targetId: isIndividual ? selectedLearnerUserId : batchId,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        channels: channels as ("IN_APP" | "PUSH" | "EMAIL")[],
        attachments: broadcastAttachments.map((a) => ({
          filename: a.name,
          content: a.base64,
          contentType: a.type,
          size: a.size,
        })),
      });

      const count = isIndividual ? 1 : (result?.recipientsCount ?? confirmedLearners.length);
      const emailDetail = channels.includes("EMAIL") && result?.emailSent !== undefined ? ` (${result.emailSent} email(s) sent)` : "";
      toastSuccess(
        isIndividual
          ? `Announcement successfully sent to ${targetUser?.user?.name || "learner"}${emailDetail}.`
          : `Announcement broadcast dispatched to ${count} batch learner(s)${emailDetail}.`
      );

      setBroadcastHistory((prev) => [
        {
          id: `bcast-${Date.now()}`,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          sentAt: new Date().toISOString(),
          recipientCount: count,
          channels,
          targetLabel: isIndividual ? (targetUser?.user?.name || "Individual Learner") : `All in ${batch?.name}`,
        },
        ...prev,
      ]);

      setBroadcastTitle("");
      setBroadcastMessage("");
      setBroadcastAttachments([]);
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
      const targetProgId = settingsProgramId || batch?.programId;
      const updated = await updateBatch(batchId, {
        name: settingsName.trim(),
        ...(targetProgId ? { programId: targetProgId } : {}),
        startDate: settingsStartDate ? new Date(settingsStartDate).toISOString() : undefined,
        endDate: settingsEndDate ? new Date(settingsEndDate).toISOString() : null,
        registrationDeadline: settingsRegistrationDeadline ? new Date(settingsRegistrationDeadline).toISOString() : null,
        capacity: parseInt(settingsCapacity, 10) || 50,
        managerId: settingsManagerId ? settingsManagerId : null,
        ...(settingsStatus ? { status: settingsStatus } : {}),
      });

      if (targetProgId) {
        await cachedFetch(`${API_URL}/programs/${targetProgId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ hasCertificate: settingsAwardCertificate }),
        }).catch(() => null);
      }

      invalidateCache("/batches");
      invalidateCache("/programs");

      // Optimistically update local batch state so header & settings reflect new status immediately
      const selectedProgObj = programs.find((p) => p.id === targetProgId);
      setBatch((prev: any) => ({
        ...prev,
        ...(updated || {}),
        name: settingsName.trim(),
        programId: targetProgId || prev?.programId,
        program: selectedProgObj
          ? { ...(prev?.program || {}), id: selectedProgObj.id, title: selectedProgObj.title, hasCertificate: settingsAwardCertificate }
          : prev?.program,
        startDate: settingsStartDate ? new Date(settingsStartDate).toISOString() : prev?.startDate,
        endDate: settingsEndDate ? new Date(settingsEndDate).toISOString() : null,
        registrationDeadline: settingsRegistrationDeadline ? new Date(settingsRegistrationDeadline).toISOString() : null,
        capacity: parseInt(settingsCapacity, 10) || 50,
        status: settingsStatus || updated?.status || prev?.status,
        managerId: settingsManagerId || null,
        manager: settingsManagerId
          ? managers.find((m) => m.id === settingsManagerId) || prev?.manager
          : null,
      }));

      toastSuccess("Batch updated successfully.");
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
      {/* 1. Top Bar: Back Navigation & Edit Batch */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <Link href="/batches" className={batchStyles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Batches</span>
        </Link>

        <button
          type="button"
          onClick={openSettingsModal}
          className={styles.secondaryBtn}
          style={{
            fontSize: "0.82rem",
            padding: "0.42rem 0.85rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontWeight: 600,
            borderRadius: "6px",
          }}
          title="Edit batch parameters, schedule, capacity & instructor"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>Edit Batch</span>
        </button>
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

              {/* Responsive Single-Row Sub-Metadata Layout (Keeps each Label:Value locked together) */}
              <div className={batchStyles.metaContainer}>
                <span className={batchStyles.metaItemWrap} title={batch?.program?.title || "—"}>
                  <span className={batchStyles.metaLabel}>Program:</span>
                  <span className={batchStyles.metaValue} style={{ maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {batch?.program?.title || "—"}
                  </span>
                </span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Manager:</span>
                  <span
                    className={batchStyles.metaValue}
                    style={{
                      color:
                        batch?.manager?.name && batch.manager.name !== "Unassigned"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      fontStyle:
                        batch?.manager?.name && batch.manager.name !== "Unassigned"
                          ? "normal"
                          : "italic",
                    }}
                  >
                    {batch?.manager?.name || "Unassigned"}
                  </span>
                </span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Schedule:</span>
                  <span className={batchStyles.metaValue}>{scheduleDisplay}</span>
                </span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Capacity:</span>
                  <span className={batchStyles.metaValue}>
                    <span style={{ color: "var(--accent-primary)" }}>
                      {confirmedLearners.length}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                      {" "}/ {batch?.capacity && batch.capacity < 9000 ? `${batch.capacity} Learners` : "Open Capacity"}
                    </span>
                  </span>
                </span>

                <span className={batchStyles.metaItem}>
                  <span className={batchStyles.metaLabel}>Registration:</span>
                  <span
                    className={batchStyles.metaValue}
                    style={{
                      color:
                        batch?.registrationDeadline && new Date() > new Date(batch.registrationDeadline)
                          ? "#dc2626"
                          : "#166534",
                      fontWeight: 600,
                    }}
                  >
                    {batch?.registrationDeadline
                      ? new Date() > new Date(batch.registrationDeadline)
                        ? `Closed (${new Date(batch.registrationDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })})`
                        : `Until ${new Date(batch.registrationDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "Open (Auto)"}
                  </span>
                  {batch?.registrationDeadline && new Date() > new Date(batch.registrationDeadline) && (
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "0.25rem" }}>
                      (Next cohort)
                    </span>
                  )}
                </span>
              </div>
            </div>
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
          {/* Tab 1: Learners */}
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
          </button>

          {/* Tab 2: Awaiting Payment */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "awaiting_payment"}
            className={`${styles.tabBtn} ${activeTab === "awaiting_payment" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("awaiting_payment")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Awaiting Payment ({pendingPaymentLearners.length})</span>
          </button>

          {/* Tab 3: Live Sessions */}
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

          {/* Tab 4: Broadcast */}
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
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          TAB 1: LEARNERS ROSTER & 5-STEP JOURNEY + CERTIFICATE APPROVALS (PRIMARY)
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "learners" && (
        <section className={styles.tableSection}>
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              padding: 0,
              marginBottom: "1rem",
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
                  placeholder="Search enrolled learners by name or email..."
                  value={learnerSearch}
                  onChange={(e) => {
                    setLearnerSearch(e.target.value);
                    setLearnerPage(1);
                  }}
                  className={styles.searchInput}
                />
              </div>

              {/* Status & Stage Filter */}
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
            </div>

            {/* Action Buttons: Export CSV & Assign Learner */}
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleExportRoster}
                disabled={confirmedLearners.length === 0}
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
            </div>
          </div>

          <div className={batchStyles.cohortTableWrapper}>
            <table className={`${styles.adminTable} ${batchStyles.cohortTable}`}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleLearnerSort("name")}
                    style={{ width: "21%", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "name" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>Learner</span>
                      <SortIndicator active={learnerSortField === "name"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleLearnerSort("status")}
                    style={{ width: "11%", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "status" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>Status</span>
                      <SortIndicator active={learnerSortField === "status"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleLearnerSort("stage1")}
                    style={{ width: "11%", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "stage1" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>1. Curriculum</span>
                      <SortIndicator active={learnerSortField === "stage1"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleLearnerSort("stage2")}
                    style={{ width: "9%", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "stage2" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>2. Exam</span>
                      <SortIndicator active={learnerSortField === "stage2"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleLearnerSort("stage3")}
                    style={{ width: "11%", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "stage3" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>3. Attendance</span>
                      <SortIndicator active={learnerSortField === "stage3"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleLearnerSort("stage4")}
                    style={{ width: "11%", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "stage4" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>4. 1:1 Call</span>
                      <SortIndicator active={learnerSortField === "stage4"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th
                    onClick={() => handleLearnerSort("stage5")}
                    style={{ width: "13%", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    aria-sort={learnerSortField === "stage5" ? (learnerSortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      <span>5. Mission Statement</span>
                      <SortIndicator active={learnerSortField === "stage5"} order={learnerSortOrder} />
                    </div>
                  </th>
                  <th style={{ width: "13%", textAlign: "right", whiteSpace: "nowrap" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "3rem 1rem" }}>
                      <EmptyState
                        icon="users"
                        title={
                          learnerSearch
                            ? "No learners match your search"
                            : "No learners enrolled in this batch"
                        }
                        description={
                          learnerSearch
                            ? `No students found matching "${learnerSearch}". Try clearing your query.`
                            : "No learners have been confirmed for this batch yet."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedLearners.map((learner) => {
                    const s1 = learner.stages?.STAGE_1_CURRICULUM;
                    const s2 = learner.stages?.STAGE_2_EXAM;
                    const s3 = learner.stages?.STAGE_3_ATTENDANCE;
                    const s4 = learner.stages?.STAGE_4_ONE_ON_ONE;
                    const s5 = learner.stages?.STAGE_5_MISSION_STATEMENT;

                    const isPendingAgreement = learner.status === "PENDING_AGREEMENT";
                    const isStagesLoading = !learner.stages && !isPendingAgreement;

                    const isMissionApproved = Boolean(s5?.isCompleted || (s5?.details ? (s5.details as any).latestStatus === "APPROVED" : false));
                    const isMissionSubmitted = !isMissionApproved && Boolean(
                      (s5?.details as any)?.latestStatus === "SUBMITTED" ||
                      (s5?.details as any)?.status === "SUBMITTED" ||
                      Boolean((s5?.details as any)?.submissionCount && Number((s5?.details as any)?.submissionCount) > 0)
                    );
                    const isCertified = Boolean(isMissionApproved || learner.status === "COMPLETED");

                    const curriculumPct = s1?.isCompleted
                      ? 100
                      : s1?.details?.totalSteps && s1.details.totalSteps > 0
                      ? Math.round(((s1.details.completedSteps || 0) / s1.details.totalSteps) * 100)
                      : ((learner as any).progress ?? 0);

                    const bestExamScore = (s2?.details as any)?.bestScore ?? (s2?.details as any)?.examScore ?? null;
                    const examPassMark = (s2?.details as any)?.passMark ?? 75;
                    const isExamPassed = Boolean(s2?.isCompleted || (s2?.details as any)?.examPassed || (bestExamScore !== null && bestExamScore >= examPassMark));

                    const requiredCohortSessionsCount = sessions.filter(
                      (s) =>
                        s.isRequired !== false &&
                        s.status !== "CANCELLED" &&
                        s.sessionType !== "ONE_ON_ONE" &&
                        (s.sessionType as string) !== "ONE_ON_ONE_WITH_RO"
                    ).length;

                    const attendedSessionsCount = s3?.details?.attendedSessions ?? 0;
                    const requiredSessionsCount = s3?.details?.requiredSessions !== undefined
                      ? Number(s3.details.requiredSessions)
                      : requiredCohortSessionsCount;
                    const thresholdPercent = s3?.details?.thresholdPercent ?? 80;
                    const hasZeroSessions = requiredCohortSessionsCount === 0 && requiredSessionsCount === 0;

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
                        {/* Learner Info (Truncated on desktop to prevent horizontal scroll) */}
                        <td style={{ overflow: "hidden" }}>
                          <Link
                            href={`/users/${learner.userId}?enrolmentId=${learner.id}&batchId=${batchId}&batchName=${encodeURIComponent(batch?.name || "Batch")}`}
                            style={{ textDecoration: "none", color: "inherit", display: "block", overflow: "hidden" }}
                            title={`${learner.user?.name || "Learner"} (${learner.user?.email || ""})`}
                          >
                            <div style={{ overflow: "hidden" }}>
                              <span
                                style={{
                                  color: "var(--accent-primary)",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {learner.user?.name || "Learner"}
                              </span>
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "0.74rem",
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {learner.user?.email || "—"}
                              </span>
                            </div>
                          </Link>
                        </td>

                        {/* Enrolment Status */}
                        <td>
                          <StatusBadge status={isCertified ? "CERTIFIED" : learner.status} />
                        </td>

                        {/* Stage 1: Curriculum (Overall progress % or Completed badge when 100%) */}
                        <td>
                          {isPendingAgreement ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                              }}
                              title="Digital workshop consent & agreement is pending signature. Learning path is locked."
                            >
                              Agreement Pending
                            </span>
                          ) : isStagesLoading ? (
                            <div
                              className={batchStyles.skeletonShimmer}
                              style={{ width: "45px", height: "20px", borderRadius: "4px", display: "inline-block" }}
                            />
                          ) : curriculumPct >= 100 || s1?.isCompleted ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                              }}
                              title="Curriculum 100% completed"
                            >
                              Completed
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                background: curriculumPct > 0 ? "#fef3c7" : "#f3f4f6",
                                color: curriculumPct > 0 ? "#b45309" : "#6b7280",
                                border: curriculumPct > 0 ? "1px solid #fde68a" : "1px solid #e5e7eb",
                              }}
                              title={`Curriculum Progress: ${curriculumPct}%`}
                            >
                              {curriculumPct}%
                            </span>
                          )}
                        </td>

                        {/* Stage 2: Exam (Best score with green badge if >= pass mark, red badge if < pass mark, neutral Pending if not taken) */}
                        <td>
                          {isPendingAgreement ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }} title="Locked — agreement pending">—</span>
                          ) : isStagesLoading ? (
                            <div
                              className={batchStyles.skeletonShimmer}
                              style={{ width: "52px", height: "20px", borderRadius: "4px", display: "inline-block" }}
                            />
                          ) : bestExamScore !== null && bestExamScore !== undefined ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: isExamPassed ? "#dcfce7" : "#fee2e2",
                                color: isExamPassed ? "#15803d" : "#dc2626",
                                border: isExamPassed ? "1px solid #bbf7d0" : "1px solid #fca5a5",
                              }}
                              title={
                                isExamPassed
                                  ? `Passed final exam with score ${bestExamScore}% (Pass mark: ${examPassMark}%)`
                                  : `Final exam score ${bestExamScore}% is below required passing mark (${examPassMark}%)`
                              }
                            >
                              {bestExamScore}%
                            </span>
                          ) : isExamPassed ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                              }}
                            >
                              Passed
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
                                color: "#9ca3af",
                                border: "1px solid #e5e7eb",
                              }}
                              title="Final exam not attempted yet"
                            >
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Stage 3: Live Attendance (Green if >= threshold, Red if < threshold, neutral if 0 sessions scheduled) */}
                        <td>
                          {isPendingAgreement ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }} title="Locked — agreement pending">—</span>
                          ) : isStagesLoading ? (
                            <div
                              className={batchStyles.skeletonShimmer}
                              style={{ width: "45px", height: "20px", borderRadius: "4px", display: "inline-block" }}
                            />
                          ) : hasZeroSessions ? (
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
                              title="No live cohort sessions scheduled yet for this batch"
                            >
                              0%
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: (attendancePct >= thresholdPercent || isAttendanceSatisfied) ? "#dcfce7" : (attendedSessionsCount === 0 || attendancePct === 0) ? "#f3f4f6" : "#fee2e2",
                                color: (attendancePct >= thresholdPercent || isAttendanceSatisfied) ? "#15803d" : (attendedSessionsCount === 0 || attendancePct === 0) ? "#6b7280" : "#dc2626",
                                border: (attendancePct >= thresholdPercent || isAttendanceSatisfied) ? "1px solid #bbf7d0" : (attendedSessionsCount === 0 || attendancePct === 0) ? "1px solid #e5e7eb" : "1px solid #fca5a5",
                              }}
                              title={`${attendedSessionsCount}/${requiredSessionsCount} live sessions attended (${attendanceDisplayText} vs ${thresholdPercent}% required)`}
                            >
                              {attendanceDisplayText}
                            </span>
                          )}
                        </td>

                        {/* Stage 4: 1:1 Session (Interactive In-Batch Management) */}
                        <td>
                          {isPendingAgreement ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }} title="Locked — agreement pending">—</span>
                          ) : isStagesLoading ? (
                            <div
                              className={batchStyles.skeletonShimmer}
                              style={{ width: "65px", height: "20px", borderRadius: "4px", display: "inline-block" }}
                            />
                          ) : isCallCompleted ? (
                            <span
                              onClick={() => openCoachingModal(learner)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                                cursor: "pointer",
                              }}
                              title="1-on-1 coaching call attended and completed. Click to view details."
                            >
                              <span>Completed</span>
                              <span>✓</span>
                            </span>
                          ) : isCallScheduled ? (
                            <button
                              type="button"
                              onClick={() => openCoachingModal(learner)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                                cursor: "pointer",
                              }}
                              title="1-on-1 coaching call is scheduled. Click to view Zoom link or complete session."
                            >
                              <span>Scheduled</span>
                              <span style={{ fontSize: "0.68rem" }}>⚙</span>
                            </button>
                          ) : isCallRequested ? (
                            <button
                              type="button"
                              onClick={() => openCoachingModal(learner)}
                              style={{
                                background: "#fef3c7",
                                border: "1px solid #fde68a",
                                color: "#b45309",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                whiteSpace: "nowrap",
                              }}
                              title="Learner requested 1-on-1 slot. Click to approve or reject directly."
                            >
                              <span>Review Slot</span>
                              <span style={{ fontSize: "0.68rem" }}>↗</span>
                            </button>
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

                        {/* Stage 5: Mission Statement (Not Submitted -> Submitted -> Approved) */}
                        <td>
                          {isPendingAgreement ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }} title="Locked — agreement pending">—</span>
                          ) : isStagesLoading ? (
                            <div
                              className={batchStyles.skeletonShimmer}
                              style={{ width: "75px", height: "20px", borderRadius: "4px", display: "inline-block" }}
                            />
                          ) : isMissionApproved ? (
                            <span
                              onClick={() => openMissionModal(learner)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                                cursor: "pointer",
                              }}
                              title="Mission Statement Approved — Learner Certified. Click to view submission details."
                            >
                              <span>Approved</span>
                              <span>✓</span>
                            </span>
                          ) : isMissionSubmitted ? (
                            <button
                              type="button"
                              onClick={() => openMissionModal(learner)}
                              style={{
                                background: "#fef3c7",
                                border: "1px solid #fde68a",
                                color: "#b45309",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                              title="Learner uploaded handwritten mission statement. Click to read document and approve."
                            >
                              <span>Submitted</span>
                              <span style={{ fontSize: "0.68rem" }}>↗</span>
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
                                border: "1px solid #e5e7eb",
                              }}
                              title="Learner has not uploaded handwritten mission statement yet"
                            >
                              Not Submitted
                            </span>
                          )}
                        </td>

                        {/* Action: View Profile */}
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <Link
                            href={`/users/${learner.userId}?enrolmentId=${learner.id}&batchId=${batchId}&batchName=${encodeURIComponent(batch?.name || "Batch")}`}
                            className={styles.secondaryBtn}
                            style={{
                              fontSize: "0.74rem",
                              padding: "0.26rem 0.55rem",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                            title="Open full student profile & progression card"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>View Profile</span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>↗</span>
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
          TAB 2: AWAITING PAYMENT (INCOMPLETE CHECKOUTS)
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "awaiting_payment" && (
        <section className={styles.tableSection}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "0.65rem 1rem",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderLeft: "4px solid #f59e0b",
              borderRadius: "8px",
              fontSize: "0.84rem",
              color: "#92400e",
              lineHeight: 1.45,
              marginBottom: "1rem",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              <strong>Note:</strong> Learners in awaiting payment have not completed checkout and do not consume batch capacity. Unpaid checkouts older than 48 hours are automatically revoked.
            </span>
          </div>

          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              padding: 0,
              marginBottom: "1rem",
            }}
          >
            <div className={styles.searchContainer} style={{ minWidth: "320px", maxWidth: "420px", width: "340px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", marginRight: "0.4rem" }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search pending checkouts by name or email..."
                value={pendingSearch}
                onChange={(e) => {
                  setPendingSearch(e.target.value);
                  setPendingPage(1);
                }}
                className={styles.searchInput}
              />
            </div>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>
              {pendingPaymentLearners.length} pending checkout{pendingPaymentLearners.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
            <table className={styles.adminTable} style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: "180px" }}>Prospect / Learner</th>
                  <th style={{ width: "150px" }}>Checkout Status</th>
                  <th style={{ width: "150px" }}>Workshop Agreement</th>
                  <th style={{ width: "130px" }}>Initiated Date</th>
                  <th style={{ width: "220px", textAlign: "right", whiteSpace: "nowrap" }}>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPendingLearners.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "3rem 1rem" }}>
                      <EmptyState
                        icon="users"
                        title={pendingSearch ? "No matching checkouts" : "No pending checkouts in this batch"}
                        description={
                          pendingSearch
                            ? `No students found matching "${pendingSearch}".`
                            : "All students who registered for this batch have either completed payment or their holds have expired."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedPendingLearners.map((learner) => {
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
                )}
              </tbody>
            </table>
          </div>

          {filteredPendingLearners.length > 0 && (
            <Pagination
              currentPage={pendingPage}
              totalItems={filteredPendingLearners.length}
              pageSize={pendingPageSize}
              onPageChange={(p) => setPendingPage(p)}
              onPageSizeChange={(sz) => {
                setPendingPageSize(sz);
                setPendingPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="checkouts"
            />
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          TAB 3: WEEKLY LIVE SESSIONS & ATTENDANCE MANAGEMENT
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
              <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 700 }}>Live Batch Sessions</h2>
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
                        description="Schedule the weekly Zoom classes for this batch."
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
                    const sessionTz = sess.timezone || selectedTz;

                    let dateDisplay = "TBD";
                    let timeDisplay = "";
                    if (startIso) {
                      try {
                        dateDisplay = new Date(startIso).toLocaleDateString(undefined, {
                          timeZone: sessionTz,
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                        const sTime = formatShortTimeInTz(startIso, sessionTz);
                        const eTime = endIso ? formatShortTimeInTz(endIso, sessionTz) : "";
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
                            {sess.sessionType === "ONE_ON_ONE" ? "1-on-1 Coaching Session" : "Batch Live Workshop"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              {dateDisplay}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {timeDisplay} ({sessionTz.split("/")[1]?.replace(/_/g, " ") || sessionTz})
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.cellText}>{sess.hostTrainer?.name || batch?.manager?.name || "Host Trainer"}</span>
                        </td>
                        <td>
                          {sess.hostUrl || sess.joinUrl ? (
                            <div style={{ display: "flex", gap: "6px" }}>
                              <a
                                href={(() => {
                                  const rawUrl = sess.hostUrl || sess.joinUrl || "";
                                  const hostName = sess.hostTrainer?.name || batch?.manager?.name || "Host";
                                  if (rawUrl && !rawUrl.includes("zak=") && !rawUrl.includes("uname=") && rawUrl.includes("zoom.us")) {
                                    const sep = rawUrl.includes("?") ? "&" : "?";
                                    return `${rawUrl}${sep}uname=${encodeURIComponent(hostName)}`;
                                  }
                                  return rawUrl;
                                })()}
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
                                title="Start or join Zoom meeting as Host"
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
                          {sess.recordingUrl ? (
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
                          ) : sess.status === "COMPLETED" && sess.meetingProvider === "ZOOM" && endIso && Date.now() - new Date(endIso).getTime() < 10 * 60 * 1000 ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  fontSize: "0.73rem",
                                  color: "#b45309",
                                  background: "#fffbeb",
                                  border: "1px solid #fde68a",
                                  padding: "2px 7px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                                title="Zoom is processing the cloud recording. It will appear automatically once ready."
                              >
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: "9px",
                                    height: "9px",
                                    borderRadius: "50%",
                                    border: "2px solid #d97706",
                                    borderTopColor: "transparent",
                                    animation: "spin 1s linear infinite",
                                  }}
                                />
                                <span>Processing...</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRecordingSessionId(sess.id);
                                  setNewRecordingUrl("");
                                }}
                                title="Manually add recording link"
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
                          <StatusBadge status={(() => {
                            const isPast = endIso && Date.now() > new Date(endIso).getTime();
                            if ((sess.status === "SCHEDULED" || sess.status === "ACTIVE" || sess.status === "IN_PROGRESS") && isPast) {
                              return "COMPLETED";
                            }
                            return sess.status;
                          })()} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
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
                              title="View and manage attendance for this session"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                              </svg>
                              <span>View Attendance</span>
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
          TAB 4: BROADCAST ANNOUNCEMENTS TO BATCH & INDIVIDUAL LEARNERS
          ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "broadcast" && (
        <section className={styles.tableSection} style={{ padding: "1.75rem 1.5rem" }}>
          <div style={{ width: "100%", maxWidth: "780px" }}>
            <div style={{ marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Batch Announcement Dispatch
              </h2>
            </div>

            <form onSubmit={handleSendBroadcast} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Audience Targeting */}
              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Recipient Audience</label>
                <div style={{ display: "flex", gap: "1.25rem", marginTop: "6px", flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="bcastTarget"
                      checked={broadcastTarget === "ALL_BATCH"}
                      onChange={() => setBroadcastTarget("ALL_BATCH")}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span>All Confirmed Learners in Batch ({confirmedLearners.length})</span>
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="bcastTarget"
                      checked={broadcastTarget === "INDIVIDUAL"}
                      onChange={() => setBroadcastTarget("INDIVIDUAL")}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span>Individual Learner</span>
                  </label>
                </div>
              </div>

              {broadcastTarget === "INDIVIDUAL" && (
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Select Learner *</label>
                  <CustomSelect
                    value={selectedLearnerUserId}
                    onChange={(val) => setSelectedLearnerUserId(val)}
                    options={confirmedLearners.map((l) => ({
                      value: l.userId,
                      label: `${l.user?.name || "Learner"} (${l.user?.email || "—"})`,
                    }))}
                    placeholder="Choose a learner from this batch..."
                  />
                </div>
              )}

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Announcement Subject *</label>
                <input
                  type="text"
                  placeholder=""
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Message Content *</label>
                <textarea
                  placeholder=""
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className={styles.formInput}
                  rows={5}
                  required
                  style={{ resize: "vertical" }}
                />

                {/* Gmail-style File Attachments Bar */}
                <div style={{ marginTop: "8px" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleAttachmentUpload}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.txt"
                    style={{ display: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "var(--bg-card-muted, #f8f6f0)",
                      border: "1px solid var(--border-light, #e2dcd2)",
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-primary, #14110f)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    <span>Attach Files (PDF, CSV, Excel, Images, Docs)</span>
                  </button>

                  {broadcastAttachments.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                      {broadcastAttachments.map((att, idx) => (
                        <div
                          key={`${att.name}-${idx}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            background: "#ffffff",
                            border: "1px solid var(--border-light, #e2dcd2)",
                            borderRadius: "6px",
                            padding: "5px 10px",
                            fontSize: "0.8rem",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span style={{ fontWeight: 600, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {att.name}
                          </span>
                          <span style={{ color: "var(--text-muted, #78716c)", fontSize: "0.75rem" }}>
                            ({formatFileSize(att.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            aria-label={`Remove ${att.name}`}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#dc2626",
                              cursor: "pointer",
                              padding: "2px",
                              marginLeft: "4px",
                              fontSize: "0.9rem",
                              lineHeight: 1,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                    <span style={{ fontWeight: broadcastInApp ? 600 : 500 }}>In-App Notification</span>
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
                    <span style={{ fontWeight: broadcastEmail ? 600 : 500 }}>Email Notification</span>
                  </label>
                </div>

              </div>

              <div style={{ paddingTop: "0.5rem" }}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={
                    isSendingBroadcast ||
                    (broadcastTarget === "ALL_BATCH" ? confirmedLearners.length === 0 : !selectedLearnerUserId)
                  }
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  {isSendingBroadcast
                    ? "Dispatching Announcement..."
                    : broadcastTarget === "INDIVIDUAL"
                    ? "Send Announcement to Selected Learner"
                    : `Send Announcement to Batch (${confirmedLearners.length} Learners)`}
                </button>
              </div>
            </form>

            {broadcastHistory.length > 0 && (
              <div style={{ marginTop: "2.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>Dispatched in this Session</h3>
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
                        <strong style={{ fontSize: "0.88rem" }}>{item.title}</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {new Date(item.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        {item.message}
                      </p>
                      <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.72rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
                        <span>Target: {item.targetLabel || `${item.recipientCount} recipient(s)`}</span>
                        <span>•</span>
                        <span>Channels: {item.channels.join(", ")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: SCHEDULE LIVE SESSION
          ───────────────────────────────────────────────────────────────────────── */}
      {isCreateSessionModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsCreateSessionModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <form onSubmit={handleCreateSession}>
              <div className={styles.modalHeader}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Schedule Live Batch Session</h3>
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

                  {/* Clean 12-Hour / 24-Hour Start Time Picker */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        Start Time *
                      </label>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.72rem", color: "var(--accent-primary, #c97a1e)", fontWeight: 700 }}>
                          {sessionWallTime ? (timeFormat === "24h" ? sessionWallTime : `${format24To12(sessionWallTime)} (${sessionWallTime})`) : ""}
                        </span>
                        <div style={{ display: "inline-flex", background: "#f5ece1", padding: "1px", borderRadius: "5px", gap: "1px" }}>
                          <button
                            type="button"
                            onClick={() => handleTimeFormatToggle("12h")}
                            style={{
                              border: "none",
                              background: timeFormat === "12h" ? "#ffffff" : "transparent",
                              color: timeFormat === "12h" ? "#14110f" : "#78716a",
                              fontWeight: timeFormat === "12h" ? 700 : 500,
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              cursor: "pointer",
                              boxShadow: timeFormat === "12h" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                            }}
                            title="12-Hour AM/PM Format"
                          >
                            12h
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTimeFormatToggle("24h")}
                            style={{
                              border: "none",
                              background: timeFormat === "24h" ? "#ffffff" : "transparent",
                              color: timeFormat === "24h" ? "#14110f" : "#78716a",
                              fontWeight: timeFormat === "24h" ? 700 : 500,
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              cursor: "pointer",
                              boxShadow: timeFormat === "24h" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                            }}
                            title="24-Hour Military Format"
                          >
                            24h
                          </button>
                        </div>
                      </div>
                    </div>

                    <TimePicker
                      value={sessionWallTime}
                      onChange={setSessionWallTime}
                      format={timeFormat}
                      ariaLabel="Start time"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", alignItems: "flex-start" }}>
                  {/* Duration Field with End Time Calculation */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Duration (Minutes) *</label>
                      {sessionEndTimeFormatted && (
                        <span style={{ fontSize: "0.75rem", color: "var(--accent-primary, #c97a1e)", fontWeight: 700 }}>
                          Ends at {sessionEndTimeFormatted}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      min={15}
                      max={360}
                      step={1}
                      value={sessionDurationMinutes}
                      onChange={(e) => setSessionDurationMinutes(e.target.value)}
                      className={styles.formInput}
                      style={{ width: "100%", height: "38px" }}
                      required
                    />
                  </div>

                  <div className={styles.formGroup} style={{ minWidth: 0 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>Timezone *</label>
                    <CustomSelect
                      value={selectedTz}
                      onChange={setSelectedTz}
                      options={tzOptions}
                      fullWidth
                      menuMaxHeight="200px"
                      ariaLabel="Timezone"
                    />
                  </div>
                </div>

                {/* Scheduled Session Window Summary */}
                <div
                  style={{
                    background: "#fdf8f0",
                    border: "1px solid #ebdccb",
                    borderRadius: "8px",
                    padding: "0.7rem 0.9rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.82rem",
                    color: "var(--text-primary)",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.035em", fontWeight: 600, display: "block" }}>
                      Session Window
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                      {timeFormat === "24h" ? sessionWallTime : format24To12(sessionWallTime)} – {sessionEndTimeFormatted || "..."}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-block", background: "#f5ece1", color: "#8a5814", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 }}>
                      {sessionDurationMinutes || 60} mins · {selectedTz.split("/")[1]?.replace(/_/g, " ") || selectedTz}
                    </span>
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
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  {isSubmittingSession && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ animation: "spin 0.8s linear infinite" }}
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  )}
                  <span>{isSubmittingSession ? "Scheduling..." : "Schedule Session"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: RECORDED VIDEO URL
          ───────────────────────────────────────────────────────────────────────── */}
      {editingRecordingSessionId && (
        <Modal
          isOpen={true}
          onClose={() => setEditingRecordingSessionId(null)}
          title="Session Recording Video"
          maxWidth="480px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Video Recording URL
              </label>
              <input
                type="url"
                placeholder="https://zoom.us/rec/share/... or Drive / MP4 link"
                value={newRecordingUrl}
                onChange={(e) => setNewRecordingUrl(e.target.value)}
                className={styles.formInput}
                style={{ width: "100%" }}
                autoFocus
              />

            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setEditingRecordingSessionId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => handleSaveRecordingUrl(editingRecordingSessionId)}
              >
                Save Video
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: MISSION STATEMENT REVIEW & CERTIFICATE APPROVAL (IN-MODAL PREVIEW & REVISION)
          ───────────────────────────────────────────────────────────────────────── */}
      {missionModalLearner && (
        <Modal
          isOpen={true}
          onClose={() => setMissionModalLearner(null)}
          title={`Mission Statement Review — ${missionModalLearner.user.name}`}
          maxWidth="780px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Inspect the handwritten personal mission statement uploaded by <strong>{missionModalLearner.user.name}</strong>. Approving awards their verified Certificate of Completion.
            </p>

            {isLoadingMissionDoc ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Loading uploaded mission statement file...
              </div>
            ) : missionSubmission ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(() => {
                  const isDataUri = missionSubmission.fileUrl?.startsWith("data:");
                  const docFileUrl = isDataUri
                    ? missionSubmission.fileUrl
                    : `${API_URL}/mission-statements/${missionSubmission.id}/file`;
                  const isImg =
                    (missionSubmission.mimeType || "").includes("image") ||
                    (isDataUri && missionSubmission.fileUrl.startsWith("data:image/")) ||
                    /\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(missionSubmission.fileName || "") ||
                    /\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(missionSubmission.fileUrl || "");

                  return (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", fontSize: "0.82rem", background: "#fdfbf7", border: "1px solid #ebdccb", padding: "8px 12px", borderRadius: "6px" }}>
                        <div>
                          <strong>Version:</strong> v{missionSubmission.version} • <strong>Uploaded:</strong> {new Date(missionSubmission.createdAt).toLocaleString()}
                          {missionSubmission.sizeBytes ? ` • ${(missionSubmission.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : ""}
                        </div>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <a
                            href={docFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "underline" }}
                          >
                            Open Full Tab ↗
                          </a>
                        </div>
                      </div>

                      {/* In-Modal Visual Document Viewer */}
                      <div
                        style={{
                          width: "100%",
                          minHeight: "350px",
                          maxHeight: "55vh",
                          overflow: "auto",
                          background: "#22201e",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isImg ? (
                          <img
                            src={docFileUrl}
                            alt="Mission Statement Preview"
                            style={{ maxWidth: "100%", maxHeight: "52vh", objectFit: "contain", borderRadius: 4 }}
                          />
                        ) : (
                          <iframe
                            src={docFileUrl}
                            title="Mission Statement Document Preview"
                            style={{ width: "100%", height: "420px", border: "none", borderRadius: 4 }}
                          />
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
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
            )}

            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Coach Approval or Revision Feedback</label>
              <textarea
                placeholder="Add personalized congratulatory feedback or revision guidance for the student..."
                value={missionFeedback}
                onChange={(e) => setMissionFeedback(e.target.value)}
                className={styles.formInput}
                rows={3}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "0.5rem" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setMissionModalLearner(null)}
                disabled={isApprovingMission}
              >
                Cancel
              </button>
              {missionSubmission && missionSubmission.status === "SUBMITTED" && (
                <button
                  type="button"
                  className={styles.dangerBtnSmall}
                  disabled={isApprovingMission}
                  onClick={async () => {
                    const reason = missionFeedback.trim() || prompt("Enter revision feedback for the learner:") || "";
                    if (!reason.trim()) return;
                    setIsApprovingMission(true);
                    try {
                      await rejectMissionStatement(missionSubmission.id, reason.trim());
                      toastSuccess(`Revision requested for ${missionModalLearner.user.name}.`);
                      setMissionModalLearner(null);
                      await loadBatchData();
                    } catch (err: any) {
                      toastError(err.message || "Failed to request revision.");
                    } finally {
                      setIsApprovingMission(false);
                    }
                  }}
                  style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem" }}
                >
                  Request Revision
                </button>
              )}
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={async () => {
                  if (missionSubmission?.id) {
                    setIsApprovingMission(true);
                    try {
                      await approveMissionStatement(missionSubmission.id);
                      toastSuccess(`Mission statement approved for ${missionModalLearner.user.name}. Certificate issued!`);
                      setMissionModalLearner(null);
                      await loadBatchData();
                    } catch (err: any) {
                      toastError(err.message || "Failed to approve mission statement.");
                    } finally {
                      setIsApprovingMission(false);
                    }
                  } else {
                    await handleApproveMission();
                  }
                }}
                disabled={isApprovingMission}
                style={{ background: "#16a34a", borderColor: "#16a34a" }}
              >
                {isApprovingMission ? "Approving..." : "Approve & Issue Certificate ✓"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODAL: 1-ON-1 COACHING CALL IN-BATCH ACTIONS (APPROVE / REJECT / COMPLETE)
          ───────────────────────────────────────────────────────────────────────── */}
      {coachingModalLearner && (
        <Modal
          isOpen={true}
          onClose={() => setCoachingModalLearner(null)}
          title={`1-on-1 Coaching Consultation — ${coachingModalLearner.user.name}`}
          maxWidth="640px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Manage 1-on-1 closing consultation slot, meeting links, and milestone completion for <strong>{coachingModalLearner.user.name}</strong>.
            </p>

            {isLoadingCoaching ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Loading coaching consultation record...
              </div>
            ) : coachingRequest ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", background: "var(--bg-card-muted, #fdfbf7)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Requested Slot</span>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                      {formatWhenInTz(coachingRequest.requestedStart, coachingRequest.requestedEnd, selectedTz)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Learner TZ: {coachingRequest.learnerTimezone || "UTC"}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Status</span>
                    <div style={{ marginTop: "4px" }}>
                      <StatusBadge status={coachingRequest.status} />
                    </div>
                  </div>
                </div>

                {coachingRequest.notes && (
                  <div style={{ background: "#ffffff", padding: "0.85rem 1rem", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Breakthroughs &amp; Reflections</span>
                    <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.5 }}>
                      "{coachingRequest.notes}"
                    </p>
                  </div>
                )}

                {coachingRequest.session?.joinUrl && (
                  <div style={{ padding: "0.85rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 700, textTransform: "uppercase" }}>Zoom Meeting Configured</span>
                      <div style={{ fontSize: "0.82rem", color: "#15803d", marginTop: "2px" }}>
                        Host: {coachingRequest.session?.hostTrainer?.name || "Roweena Britto"}
                      </div>
                    </div>
                    <a
                      href={coachingRequest.session.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0284c7", fontWeight: 700, fontSize: "0.85rem", textDecoration: "underline" }}
                    >
                      Join Call ↗
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "1.25rem", background: "var(--bg-card-muted, #fdfbf7)", borderRadius: "8px", border: "1px solid var(--border-light)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                No active 1-on-1 coaching booking request found on record for this learner.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "0.5rem" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setCoachingModalLearner(null)}
                disabled={actingCoaching}
              >
                Close
              </button>

              {coachingRequest && coachingRequest.status === "PENDING_APPROVAL" && (
                <>
                  <button
                    type="button"
                    className={styles.dangerBtnSmall}
                    disabled={actingCoaching}
                    onClick={async () => {
                      const reason = prompt("Enter rejection reason for learner:") || "";
                      if (!reason.trim()) return;
                      setActingCoaching(true);
                      try {
                        await rejectOneOnOneRequest(coachingRequest.id, reason.trim());
                        toastSuccess("1:1 Call booking request rejected.");
                        setCoachingModalLearner(null);
                        await loadBatchData();
                      } catch (err: any) {
                        toastError(err.message || "Failed to reject request");
                      } finally {
                        setActingCoaching(false);
                      }
                    }}
                    style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem" }}
                  >
                    Reject Request
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={actingCoaching}
                    onClick={async () => {
                      setActingCoaching(true);
                      try {
                        await approveOneOnOneRequest(coachingRequest.id, {
                          startTime: coachingRequest.requestedStart,
                          endTime: coachingRequest.requestedEnd,
                        });
                        toastSuccess("1:1 Call booking approved with Zoom meeting link!");
                        setCoachingModalLearner(null);
                        await loadBatchData();
                      } catch (err: any) {
                        toastError(err.message || "Failed to approve slot");
                      } finally {
                        setActingCoaching(false);
                      }
                    }}
                    style={{ background: "#15803d", borderColor: "#15803d" }}
                  >
                    {actingCoaching ? "Approving..." : "Approve & Schedule Slot ✓"}
                  </button>
                </>
              )}

              {((coachingRequest && coachingRequest.status === "APPROVED") || (coachingModalLearner.stages?.STAGE_4_ONE_ON_ONE?.details as any)?.isScheduled) && !coachingModalLearner.stages?.STAGE_4_ONE_ON_ONE?.isCompleted && (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={actingCoaching}
                  onClick={async () => {
                    const sessionId = coachingRequest?.sessionId || coachingRequest?.session?.id;
                    if (!sessionId) {
                      toastError("No active session ID found to mark completed.");
                      return;
                    }
                    setActingCoaching(true);
                    try {
                      const res = await cachedFetch(`${API_URL}/sessions/${sessionId}`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ status: "COMPLETED" }),
                      });
                      if (!res.ok) throw new Error(await errorMessage(res, "Failed to complete session"));
                      toastSuccess("1:1 Call marked completed! Stage 5 unlocked for student.");
                      setCoachingModalLearner(null);
                      await loadBatchData();
                    } catch (err: any) {
                      toastError(err.message || "Failed to mark call completed");
                    } finally {
                      setActingCoaching(false);
                    }
                  }}
                  style={{ background: "#15803d", borderColor: "#15803d" }}
                >
                  {actingCoaching ? "Completing..." : "Mark Session Completed ✓"}
                </button>
              )}
            </div>
          </div>
        </Modal>
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
                Edit Batch
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
                <label>
                  Assign Program <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                </label>
                <CustomSelect
                  value={settingsProgramId}
                  onChange={(val) => {
                    setSettingsProgramId(val);
                    const sel = programs.find((prog) => prog.id === val);
                    if (sel) {
                      setSettingsAwardCertificate(sel.hasCertificate ?? true);
                    }
                  }}
                  fullWidth
                  ariaLabel="Assign Program"
                  placeholder="Select a Program..."
                  options={
                    programs.length > 0
                      ? programs.map((p) => ({
                          value: p.id,
                          label: p.title,
                        }))
                      : batch?.program
                      ? [{ value: batch.programId || batch.program.id || "", label: batch.program.title || "Program" }]
                      : []
                  }
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
                    <div className={styles.helpTooltipContent} style={{ width: "270px", lineHeight: "1.4" }}>
                      <strong>Registration Deadline:</strong>
                      <ul style={{ margin: "6px 0 0", paddingLeft: "16px", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <li>Registration closes for this batch after this date.</li>
                        <li>New students will be added to the upcoming batch or to the waitlist.</li>
                        <li>Even if this batch has open seats, no new students can join this batch after this deadline.</li>
                      </ul>
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
                    placeholder="50"
                    min="1"
                    required
                    value={settingsCapacity}
                    onChange={(e) => setSettingsCapacity(e.target.value)}
                  />
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
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Batch Status</label>
                  <CustomSelect
                    value={settingsStatus}
                    onChange={setSettingsStatus}
                    fullWidth
                    ariaLabel="Batch Status"
                    placeholder="Auto (Based on Start & End Date)"
                    options={[
                      { value: "", label: "Auto (Active if started today or earlier)" },
                      { value: "ACTIVE", label: "Active" },
                      { value: "UPCOMING", label: "Upcoming" },
                      { value: "COMPLETED", label: "Completed" },
                    ]}
                  />
                </div>
              </div>

              {/* Certificate Award Option */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: settingsAwardCertificate ? "rgba(201, 122, 30, 0.06)" : "var(--bg-card-muted, #fdfbf7)",
                  border: `1px solid ${settingsAwardCertificate ? "var(--accent-primary, #c97a1e)" : "var(--border-light)"}`,
                  borderRadius: "8px",
                  marginTop: "0.25rem",
                  transition: "all 0.15s ease",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    cursor: "pointer",
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settingsAwardCertificate}
                    onChange={(e) => setSettingsAwardCertificate(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      accentColor: "var(--accent-primary, #c97a1e)",
                      cursor: "pointer",
                    }}
                  />
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent-primary, #c97a1e)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="8" r="6" />
                      <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                    </svg>
                    <span>Award Certificate of Completion</span>
                  </div>
                </label>
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
                  {isSavingSettings ? "Saving..." : "Update Batch"}
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
