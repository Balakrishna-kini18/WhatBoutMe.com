"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import calStyles from "./calendar.module.css";
import CalendarShell, { CLEAN_TZ_LABELS } from "./calendar/CalendarShell";
import {
  API_URL,
  errorMessage,
  detectCalendarConflict,
  cachedFetch,
  fetchOneOnOneRequests,
  approveOneOnOneRequest,
  rejectOneOnOneRequest,
  acceptDiscoveryCall,
  type OneOnOneRequestItem,
} from "../lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  localWallTimeToUtc,
  getSessionDateInTz,
  utcToWallClock,
  formatWhenInTz,
  formatShortTimeInTz,
} from "../lib/timezone";
import {
  CustomSelect,
  ConfirmDialog,
  InputDialog,
  useToast,
  Modal,
  StatusBadge,
  TableSkeleton,
  EmptyState,
  DatePicker,
  TimePicker,
} from "../components";

interface TrainerInfo {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface Batch {
  id: string;
  name: string;
  capacity?: number;
  program: { id: string; title: string } | string;
  managerId?: string;
  manager?: TrainerInfo | null;
  trainers?: Array<{ trainerId?: string; trainer?: TrainerInfo | null }>;
  enrolments?: Array<{ user?: { id: string; name: string; email: string } }>;
  students?: number;
}

export type SessionTypeEnum =
  | "GROUP_COHORT"
  | "ONE_ON_ONE"
  | "WELCOME_CALL_11_STEPS"
  | "CLOSING_CALL_11_STEPS"
  | "ONE_ON_ONE_WITH_RO"
  | "VISION_BOARD_WORKSHOP"
  | "VISION_BOARD_ONLINE"
  | "SPEAKER_DISCOVERY_CALL"
  | "BATCH_CLASS";

export type CommitmentCategory =
  | "ALL"
  | "DISCOVERY"
  | "ONE_ON_ONE"
  | "BATCH";

export interface Meeting {
  id: string;
  title: string;
  sessionType: SessionTypeEnum;
  capacity: number;
  startTime: string;
  endTime: string;
  timezone?: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  joinUrl: string | null;
  hostUrl?: string | null;
  recordingUrl?: string | null;
  hostTrainer?: TrainerInfo | null;
  learner?: { id: string; name: string; email: string } | null;
  batch?: { id: string; name: string; program: { id: string; title: string } | null } | null;
  _count?: { attendances?: number; bookings?: number };
  description?: string | null;
  agenda?: string | null;
}

const isDiscoveryCall = (m: Meeting) => m.sessionType === "SPEAKER_DISCOVERY_CALL";
const isOneOnOneCall = (m: Meeting) =>
  m.sessionType === "ONE_ON_ONE" ||
  m.sessionType === "ONE_ON_ONE_WITH_RO" ||
  m.sessionType === "WELCOME_CALL_11_STEPS" ||
  m.sessionType === "CLOSING_CALL_11_STEPS";
const isBatchSession = (m: Meeting) =>
  m.sessionType === "GROUP_COHORT" ||
  m.sessionType === "BATCH_CLASS" ||
  m.sessionType === "VISION_BOARD_WORKSHOP" ||
  m.sessionType === "VISION_BOARD_ONLINE";

const parseDiscoveryCallDetails = (m: Meeting) => {
  const prospectName =
    m.learner?.name ||
    m.title.replace(/^1-to-1 Discovery Call:\s*Roweena\s*&\s*/i, "").trim() ||
    "Discovery Prospect";
  const prospectEmail = m.learner?.email || "";

  let courseInquiry = m.batch?.program?.title || "";
  if (!courseInquiry && m.description) {
    const match = m.description.match(/Course:\s*([^\n\r|]+)/i);
    if (match && match[1]) courseInquiry = match[1].trim();
  }
  if (!courseInquiry) courseInquiry = "11 Steps to U / General Course Inquiry";

  let leadId = "";
  if (m.agenda) {
    const match = m.agenda.match(/LeadId:\s*([a-zA-Z0-9-]+)/i);
    if (match && match[1] && match[1] !== "N/A") leadId = match[1].trim();
  }
  if (!leadId && m.description) {
    const match = m.description.match(/lead\s+([a-zA-Z0-9-]+)/i);
    if (match && match[1] && match[1] !== "Direct") leadId = match[1].trim();
  }

  const zoomLink =
    m.joinUrl || `https://zoom.us/j/staging-${m.id.slice(0, 8)}?pwd=wbm123`;

  return {
    prospectName,
    prospectEmail,
    courseInquiry,
    leadId,
    zoomLink,
  };
};

const ALL_COHORTS = "all";

const SCHEDULE_SESSION_TYPE_OPTIONS: Array<{ value: SessionTypeEnum; label: string }> = [
  { value: "GROUP_COHORT", label: "Batch Live Session" },
  { value: "ONE_ON_ONE", label: "1:1 Call" },
];

const SESSION_TYPE_OPTIONS: Array<{ value: SessionTypeEnum; label: string }> = [
  { value: "GROUP_COHORT", label: "Batch Live Session" },
  { value: "ONE_ON_ONE", label: "1:1 Call" },
  { value: "WELCOME_CALL_11_STEPS", label: "11 Steps Welcome Call" },
  { value: "CLOSING_CALL_11_STEPS", label: "11 Steps Closing Call" },
  { value: "ONE_ON_ONE_WITH_RO", label: "1:1 with Ro" },
  { value: "VISION_BOARD_WORKSHOP", label: "Vision Board Workshop" },
  { value: "VISION_BOARD_ONLINE", label: "Vision Board Online" },
  { value: "SPEAKER_DISCOVERY_CALL", label: "Speaker Discovery Call" },
  { value: "BATCH_CLASS", label: "Batch Curriculum Class" },
];

const formatWhen = (start: string, end: string, timeZone?: string) => {
  return formatWhenInTz(start, end, timeZone || "UTC");
};

const formatShortTime = (iso: string, timeZone?: string) => {
  return formatShortTimeInTz(iso, timeZone || "UTC");
};

const getProgramTitle = (batch: Batch): string => {
  if (typeof batch.program === "object" && batch.program !== null) {
    return batch.program.title;
  }
  return typeof batch.program === "string" ? batch.program : "Untitled Program";
};

const getPillStyleClass = (type: SessionTypeEnum, status: string) => {
  if (status === "CANCELLED") return calStyles.pillCancelled;
  switch (type) {
    case "ONE_ON_ONE":
    case "ONE_ON_ONE_WITH_RO":
    case "WELCOME_CALL_11_STEPS":
    case "CLOSING_CALL_11_STEPS":
      return calStyles.pillOneOnOne;
    case "VISION_BOARD_WORKSHOP":
    case "VISION_BOARD_ONLINE":
      return calStyles.pillWorkshop;
    case "SPEAKER_DISCOVERY_CALL":
      return calStyles.pillDiscovery;
    default:
      return calStyles.pillCohort;
  }
};

// SVG Icons
const Icons = {
  Calendar: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Table: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
    </svg>
  ),
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Plus: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  ExternalLink: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  Users: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

export default function MeetingsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View state: 'calendar', 'table', or 'requests' (Stage 4 1-on-1 Coaching Queue)
  const [viewMode, setViewMode] = useState<"calendar" | "table" | "requests">("calendar");
  const [, setCurrentCalendarDate] = useState<Date>(new Date());
  const [urlDate, setUrlDate] = useState<string | undefined>(undefined);

  // 1:1 Call Requests Queue state (Phase 4)
  const [oneOnOneRequests, setOneOnOneRequests] = useState<OneOnOneRequestItem[]>([]);
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsFilter, setRequestsFilter] = useState<string>("ALL");

  // Approve 1-on-1 Request Modal state
  const [approvingRequest, setApprovingRequest] = useState<OneOnOneRequestItem | null>(null);
  const [approvalHostTrainerId, setApprovalHostTrainerId] = useState<string>("");
  const [approvalDate, setApprovalDate] = useState<string>("");
  const [approvalStartTime, setApprovalStartTime] = useState<string>("10:00");
  const [approvalEndTime, setApprovalEndTime] = useState<string>("10:30");
  const [approvalNotes, setApprovalNotes] = useState<string>("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Reject 1-on-1 Request state
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  // Modals state
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);

  // Detail modal state
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // Day Sessions Popover / Modal (for "+N more")
  const [viewingDaySessions, setViewingDaySessions] = useState<{
    dateString: string;
    dateFormatted: string;
    events: Meeting[];
  } | null>(null);

  // Edit / Reschedule Modal state
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("10:00");
  const [editEndTime, setEditEndTime] = useState("11:00");
  const [editCapacity, setEditCapacity] = useState<number>(25);
  const [editHostTrainerId, setEditHostTrainerId] = useState<string>("");
  const [editJoinUrl, setEditJoinUrl] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState("");

  const router = useRouter();
  const [commitmentCategory, setCommitmentCategory] = useState<CommitmentCategory>("ALL");
  const [isCompletingAndConverting, setIsCompletingAndConverting] = useState(false);
  const [isCompletingOneOnOne, setIsCompletingOneOnOne] = useState(false);

  // Sync with ?date=YYYY-MM-DD and ?sessionId=XYZ from Approvals or LMS links
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    if (dateParam) {
      const parsed = new Date(dateParam);
      if (!isNaN(parsed.getTime())) {
        setCurrentCalendarDate(parsed);
        if (/^\d{4}-\d{2}-\d{2}/.test(dateParam)) setUrlDate(dateParam.slice(0, 10));
      }
    }
    const sessionIdParam = params.get("sessionId");
    if (sessionIdParam && meetings.length > 0) {
      const target = meetings.find((m) => m.id === sessionIdParam);
      if (target) {
        setSelectedMeeting(target);
      }
    }
  }, [meetings]);

  const handleCompleteSession = async (meeting: Meeting) => {
    setIsCompletingOneOnOne(true);
    try {
      await cachedFetch(`${API_URL}/sessions/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      setMeetings((prev) =>
        prev.map((m) => (m.id === meeting.id ? { ...m, status: "COMPLETED" as const } : m))
      );
      setSelectedMeeting((prev) =>
        prev && prev.id === meeting.id ? { ...prev, status: "COMPLETED" as const } : prev
      );
      toastSuccess(
        isOneOnOneCall(meeting)
          ? "1:1 Call marked Completed! Stage 5 (Mission Statement) unlocked for learner."
          : "Session marked Completed!"
      );
    } catch (err: any) {
      toastError(err?.message || "Failed to mark session completed");
    } finally {
      setIsCompletingOneOnOne(false);
    }
  };

  const commitmentCounts = useMemo(() => {
    let discovery = 0;
    let oneOnOne = 0;
    let batch = 0;
    for (const m of meetings) {
      if (isDiscoveryCall(m)) discovery++;
      else if (isOneOnOneCall(m)) oneOnOne++;
      else batch++;
    }
    return { all: meetings.length, discovery, oneOnOne, batch };
  }, [meetings]);

  const handleSelectCommitmentCategory = (cat: CommitmentCategory) => {
    setCommitmentCategory(cat);
    setFilterType("ALL");
    if (viewMode === "requests") {
      setViewMode("calendar");
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("tab");
      url.searchParams.set("category", cat.toLowerCase());
      window.history.pushState({}, "", url.toString());
    }
  };

  const handleAcceptDiscovery = async (sessionId: string) => {
    try {
      await acceptDiscoveryCall({ sessionId });
      toastSuccess("Discovery Call accepted! Zoom room generated and confirmed invite sent to prospect.");
      await load();
    } catch (err: any) {
      toastError(err?.message || "Failed to accept discovery call");
    }
  };

  const handleCompleteAndConvert = async (meeting: Meeting) => {
    setIsCompletingAndConverting(true);
    try {
      if (meeting.status !== "COMPLETED") {
        await cachedFetch(`${API_URL}/sessions/${meeting.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        }).catch(() => null);

        setMeetings((prev) =>
          prev.map((m) => (m.id === meeting.id ? { ...m, status: "COMPLETED" as const } : m))
        );
      }

      toastSuccess("Discovery Call marked Completed! Opening Lead Conversion...");

      const details = parseDiscoveryCallDetails(meeting);
      const queryParams = new URLSearchParams();
      queryParams.set("action", "convert");
      if (details.leadId) queryParams.set("leadId", details.leadId);
      if (details.prospectEmail) queryParams.set("email", details.prospectEmail);
      if (details.courseInquiry) queryParams.set("course", details.courseInquiry);

      setSelectedMeeting(null);
      router.push(`/leads?${queryParams.toString()}`);
    } catch (e) {
      console.error(e);
      toastError("Could not complete call. Redirecting to Enquiries...");
      router.push("/leads");
    } finally {
      setIsCompletingAndConverting(false);
    }
  };

  // Schedule Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Filters
  const [filterType, setFilterType] = useState<"ALL" | SessionTypeEnum>("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "SCHEDULED" | "CANCELLED">("ALL");

  // Form State
  const [sessionType, setSessionType] = useState<SessionTypeEnum>("GROUP_COHORT");
  const [course, setCourse] = useState("");
  const [cohort, setCohort] = useState(ALL_COHORTS);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [capacity, setCapacity] = useState<number>(25);
  const [hostTrainerId, setHostTrainerId] = useState<string>("");
  const [learnerId, setLearnerId] = useState<string>("");
  const [joinUrl, setJoinUrl] = useState("");

  // Initialize to UTC to ensure identical SSR and client initial hydration tree
  const [displayTimezone, setDisplayTimezone] = useState<string>("Asia/Kolkata");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");

  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  // Hydrate timezone and time format from localStorage on mount
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

  // Hydrate timezone from localStorage / system on client mount
  useEffect(() => {
    const saved = localStorage.getItem("wbm_display_tz");
    if (saved) {
      setDisplayTimezone(saved);
    } else {
      const sys = getSystemTimezone();
      if (sys) setDisplayTimezone(sys);
    }

    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (profile?.timezone) {
          setDisplayTimezone(profile.timezone);
          localStorage.setItem("wbm_display_tz", profile.timezone);
        }
      })
      .catch(() => null);
  }, []);

  const handleTimezoneChange = (newTz: string) => {
    setDisplayTimezone(newTz);
    if (typeof window !== "undefined") {
      localStorage.setItem("wbm_display_tz", newTz);
    }
    fetch(`${API_URL}/auth/me/timezone`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ timezone: newTz }),
    }).catch(() => null);
  };

  const localTimezone = displayTimezone;

  const courses = useMemo(
    () => [...new Set(batches.map((b) => getProgramTitle(b)))],
    [batches],
  );

  const cohorts = useMemo(
    () => batches.filter((b) => getProgramTitle(b) === course),
    [batches, course],
  );

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === cohort),
    [batches, cohort],
  );

  // Available trainers for selected cohort
  const availableTrainers = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    if (currentBatch) {
      if (currentBatch.manager) {
        list.push({
          id: currentBatch.manager.id,
          label: `${currentBatch.manager.name || currentBatch.manager.email} (Batch Manager)`,
        });
      }
      if (currentBatch.trainers) {
        currentBatch.trainers.forEach((t) => {
          if (t.trainer && !list.some((item) => item.id === t.trainer?.id)) {
            list.push({
              id: t.trainer.id,
              label: `${t.trainer.name || t.trainer.email} (Cohort Trainer)`,
            });
          }
        });
      }
    }
    return list;
  }, [currentBatch]);

  // Available learners for 1-on-1 session
  const enrolledLearners = useMemo(() => {
    if (!currentBatch || !currentBatch.enrolments) return [];
    return currentBatch.enrolments
      .filter((e) => e.user)
      .map((e) => ({
        id: e.user!.id,
        name: e.user!.name || e.user!.email,
        email: e.user!.email,
      }));
  }, [currentBatch]);

  const allTrainers = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    batches.forEach((b) => {
      if (b.manager) {
        map.set(b.manager.id, {
          id: b.manager.id,
          label: `${b.manager.name || b.manager.email} (Batch Manager)`,
        });
      }
      b.trainers?.forEach((t) => {
        if (t.trainer) {
          map.set(t.trainer.id, {
            id: t.trainer.id,
            label: `${t.trainer.name || t.trainer.email} (Trainer)`,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [batches]);

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const data = await fetchOneOnOneRequests(requestsFilter);
      setOneOnOneRequests(data);
    } catch (e) {
      console.error("Failed to load 1:1 call requests", e);
    } finally {
      setLoadingRequests(false);
    }
  };

  const pendingRequests = useMemo(() => {
    return oneOnOneRequests.filter((r) => r.status === "PENDING_APPROVAL");
  }, [oneOnOneRequests]);

  const pendingRequestsCount = pendingRequests.length;

  const openApproveModal = (req: OneOnOneRequestItem) => {
    setApprovingRequest(req);
    setApprovalError(null);
    setApprovalHostTrainerId(allTrainers[0]?.id || "");
    const startD = new Date(req.requestedStart);
    const endD = new Date(req.requestedEnd);
    const isPast = startD.getTime() < Date.now();

    if (isPast) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const todayStr = now.toISOString().split("T")[0] || "";

      // If before 19:00, allow scheduling today at upcoming time, else tomorrow
      if (currentHour < 19) {
        setApprovalDate(todayStr);
        const nextHour = currentMin >= 30 ? currentHour + 2 : currentHour + 1;
        const clampedH = Math.min(Math.max(nextHour, 10), 20);
        setApprovalStartTime(String(clampedH).padStart(2, '0') + ':00');
        setApprovalEndTime(String(clampedH).padStart(2, '0') + ':45');
      } else {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        setApprovalDate(tomorrow.toISOString().split("T")[0] || "");
        setApprovalStartTime("10:00");
        setApprovalEndTime("10:45");
      }
    } else {
      setApprovalDate(startD.toISOString().split("T")[0] || "");
      setApprovalStartTime(startD.toTimeString().slice(0, 5) || "10:00");
      setApprovalEndTime(endD.toTimeString().slice(0, 5) || "10:30");
    }
    setApprovalNotes(req.notes || "");
  };

  const handleConfirmApproval = async (e: FormEvent) => {
    e.preventDefault();
    if (!approvingRequest) return;
    setApprovalError(null);

    const start = localWallTimeToUtc(approvalDate, approvalStartTime, displayTimezone);
    const end = localWallTimeToUtc(approvalDate, approvalEndTime, displayTimezone);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setApprovalError("Invalid date or time selected.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setApprovalError("Session end time must be strictly after start time.");
      return;
    }

    if (start.getTime() < Date.now() - 60 * 1000) {
      setApprovalError("Cannot schedule a 1:1 call in the past. Please select an upcoming date and time.");
      return;
    }

    setIsSubmittingApproval(true);
    try {
      await approveOneOnOneRequest(approvingRequest.id, {
        hostTrainerId: approvalHostTrainerId || undefined,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        notes: approvalNotes,
      });
      toastSuccess("1:1 call approved and Zoom meeting generated!");
      setApprovingRequest(null);
      loadRequests();
      load();
    } catch (err: any) {
      setApprovalError(err?.message || "Failed to approve 1-on-1 request");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectingRequestId) return;
    setIsSubmittingReject(true);
    try {
      await rejectOneOnOneRequest(rejectingRequestId, reason);
      toastSuccess("1-on-1 request rejected.");
      setRejectingRequestId(null);
      loadRequests();
    } catch (err: any) {
      toastError(err?.message || "Failed to reject request");
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const load = async () => {
    try {
      const [meetingsRes, batchesRes] = await Promise.all([
        cachedFetch(`${API_URL}/sessions/all`),
        cachedFetch(`${API_URL}/batches`),
      ]);
      if (meetingsRes.ok) setMeetings(await meetingsRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
      loadRequests();
    } catch (e) {
      console.error("Failed to load meetings", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const v = searchParams.get("view") || searchParams.get("tab");
      if (v === "requests" || v === "coaching_requests") {
        setViewMode("requests");
      } else if (v === "table") {
        setViewMode("table");
      } else if (v === "calendar") {
        setViewMode("calendar");
      }

      const cat = searchParams.get("category");
      if (cat === "discovery") {
        setCommitmentCategory("DISCOVERY");
      } else if (cat === "coaching" || cat === "one_on_one") {
        setCommitmentCategory("ONE_ON_ONE");
      } else if (cat === "batch") {
        setCommitmentCategory("BATCH");
      } else if (cat === "all") {
        setCommitmentCategory("ALL");
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (viewMode === "requests") {
      loadRequests();
    }
  }, [requestsFilter, viewMode]);

  // Sync capacity when cohort or sessionType changes
  useEffect(() => {
    if (
      sessionType === "ONE_ON_ONE" ||
      sessionType === "ONE_ON_ONE_WITH_RO"
    ) {
      setCapacity(1);
    } else if (currentBatch?.capacity) {
      setCapacity(currentBatch.capacity);
    }
  }, [sessionType, currentBatch]);

  const openModal = (initialDate?: string, initialTime?: string) => {
    const defaultCourse = courses[0] || "";
    setSessionType("GROUP_COHORT");
    setCourse(defaultCourse);
    const initialCohorts = batches.filter((b) => getProgramTitle(b) === defaultCourse);
    const initialCohortId = initialCohorts[0]?.id || ALL_COHORTS;
    setCohort(initialCohortId);
    setTitle("");
    setDate(initialDate || (new Date().toISOString().split("T")[0] ?? ""));
    setStartTime(initialTime || "10:00");
    setEndTime(
      initialTime
        ? `${String((parseInt(initialTime.slice(0, 2), 10) + 1) % 24).padStart(2, "0")}:${initialTime.slice(3, 5)}`
        : "11:00",
    );
    setCapacity(initialCohorts[0]?.capacity || 25);
    setHostTrainerId("");
    setLearnerId("");
    setJoinUrl("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setEditTitle(meeting.title);
    const sParts = utcToWallClock(meeting.startTime, displayTimezone);
    const eParts = utcToWallClock(meeting.endTime, displayTimezone);
    setEditDate(sParts.date);
    setEditStartTime(sParts.time);
    setEditEndTime(eParts.time);
    setEditCapacity(meeting.capacity);
    setEditHostTrainerId(meeting.hostTrainer?.id || "");
    setEditJoinUrl(meeting.joinUrl || "");
    setEditError("");
    setSelectedMeeting(null);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingMeeting) return;
    setEditError("");

    if (!editDate) {
      setEditError("Please select a date.");
      return;
    }

    const start = localWallTimeToUtc(editDate, editStartTime, displayTimezone);
    const end = localWallTimeToUtc(editDate, editEndTime, displayTimezone);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setEditError("Invalid date or time format.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setEditError("Session end time must be strictly after start time.");
      return;
    }

    // Double-booking conflict detection against Roweena's unified schedule
    const conflictCheck = detectCalendarConflict(
      meetings,
      start,
      end,
      editHostTrainerId || null,
      editingMeeting.id,
    );

    if (conflictCheck.hasConflict && conflictCheck.conflictingSession) {
      const c = conflictCheck.conflictingSession;
      setEditError(
        `Double-booking conflict: Coach already has "${c.title}" scheduled from ${formatShortTime(c.startTime, displayTimezone)} to ${formatShortTime(c.endTime, displayTimezone)} (${displayTimezone}).`
      );
      return;
    }

    setIsUpdating(true);
    try {
      const payload: Record<string, any> = {
        title: editTitle.trim(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: Number(editCapacity),
        joinUrl: editJoinUrl.trim() || undefined,
      };

      if (editHostTrainerId) {
        payload.hostTrainerId = editHostTrainerId;
      }

      const res = await cachedFetch(`${API_URL}/sessions/${editingMeeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await errorMessage(res, "Failed to update session.");
        setEditError(msg);
        return;
      }

      toastSuccess("Session updated and synchronized with calendar.");
      setEditingMeeting(null);
      load();
    } catch (err: any) {
      setEditError("Could not reach server to update session.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSchedule = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!date) {
      setFormError("Please select a session date.");
      return;
    }

    const start = localWallTimeToUtc(date, startTime, displayTimezone);
    const end = localWallTimeToUtc(date, endTime, displayTimezone);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError("Invalid date or time entered.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setFormError("Session end time must be strictly after the start time.");
      return;
    }

    const durationMin = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMin < 5) {
      setFormError("Session duration must be at least 5 minutes.");
      return;
    }

    // Double-booking conflict detection against Roweena's unified schedule
    const conflictCheck = detectCalendarConflict(
      meetings,
      start,
      end,
      hostTrainerId || null,
      null,
    );

    if (conflictCheck.hasConflict && conflictCheck.conflictingSession) {
      const c = conflictCheck.conflictingSession;
      setFormError(
        `Double-booking conflict: Roweena/Coach already has "${c.title}" scheduled from ${formatShortTime(c.startTime, displayTimezone)} to ${formatShortTime(c.endTime, displayTimezone)} (${displayTimezone}). Please select another time window to avoid clashes with Roweena's schedule.`
      );
      return;
    }

    const isSingleSeat = sessionType === "ONE_ON_ONE" || sessionType === "ONE_ON_ONE_WITH_RO";

    if (isSingleSeat && cohort === ALL_COHORTS) {
      setFormError("1:1 call sessions must be scheduled for a specific batch.");
      return;
    }

    const targets = cohorts.filter((b) => cohort === ALL_COHORTS || b.id === cohort);
    if (targets.length === 0) {
      setFormError("No batches available for this program. Create an active batch first.");
      return;
    }

    if (cohort === ALL_COHORTS && hostTrainerId && targets.length > 1) {
      setFormError("Assigning a specific trainer to multiple batches simultaneously creates a scheduling conflict. Please schedule each batch individually or select a single batch.");
      return;
    }

    const finalCapacity = isSingleSeat ? 1 : (currentBatch?.capacity || 25);

    setIsSaving(true);
    try {
      const activeTargets = targets.length > 0 ? targets : [{ id: undefined }];
      for (const target of activeTargets) {
        const payload: Record<string, any> = {
          batchId: target.id,
          title: title.trim(),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          sessionType,
          capacity: finalCapacity,
          meetingProvider: joinUrl.trim() ? undefined : "ZOOM",
        };

        if (joinUrl.trim()) {
          payload.joinUrl = joinUrl.trim();
        }
        if (hostTrainerId) {
          payload.hostTrainerId = hostTrainerId;
        }
        if (isSingleSeat && learnerId) {
          payload.learnerId = learnerId;
        }

        const res = await cachedFetch(`${API_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await errorMessage(
            res,
            `Could not schedule session${'name' in target ? ` for cohort ${target.name}` : ''}`,
          );
          setFormError(msg);
          setIsSaving(false);
          return;
        }
      }

      toastSuccess("Session created and synchronized with calendar.");
      setIsModalOpen(false);
      load();
    } catch (err) {
      console.error("Failed to schedule session", err);
      setFormError("Could not reach the server. Verify that the API is running.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmCancelSession = async (reason: string) => {
    if (!cancellingSessionId) return;
    const targetId = cancellingSessionId;
    const previousMeetings = meetings;

    // Optimistic UI update: immediately mark session status as CANCELLED
    setMeetings((prev) =>
      prev.map((m) => (m.id === targetId ? { ...m, status: "CANCELLED" as const } : m))
    );
    toastSuccess("Session cancelled.");
    setCancellingSessionId(null);
    setIsCancelling(true);
    try {
      const res = await cachedFetch(`${API_URL}/sessions/${targetId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Administrative cancellation" }),
      });
      if (res.ok) {
        toastSuccess("Session cancelled and calendar invite updated.");
        setCancellingSessionId(null);
        setSelectedMeeting(null);
        load();
      } else {
        // Rollback on server error
        setMeetings(previousMeetings);
        const err = await errorMessage(res, "Could not cancel the session.");
        setCancelError(err);
        toastError(err);
      }
    } catch (e) {
      setMeetings(previousMeetings);
      console.error(e);
      setCancelError("Failed to communicate with the server.");
      toastError("Failed to communicate with the server.");
    } finally {
      setIsCancelling(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!deletingSessionId) return;
    const targetId = deletingSessionId;
    const previousMeetings = meetings;

    // Optimistic UI update: immediately remove meeting from local view
    setMeetings((prev) => prev.filter((m) => m.id !== targetId));
    setDeletingSessionId(null);
    setIsDeletingSession(true);
    setDeleteSessionError(null);

    try {
      const res = await cachedFetch(`${API_URL}/sessions/${targetId}`, { method: "DELETE" });
      if (res.ok) {
        toastSuccess("Session record permanently deleted from database and calendar.");
        setDeletingSessionId(null);
        setSelectedMeeting(null);
        load();
      } else {
        // Rollback on server error
        setMeetings(previousMeetings);
        const err = await errorMessage(res, "Could not delete session.");
        setDeleteSessionError(err);
        toastError(err);
      }
    } catch (e) {
      setMeetings(previousMeetings);
      console.error(e);
      setDeleteSessionError("Failed to communicate with the server.");
      toastError("Failed to communicate with the server.");
    } finally {
      setIsDeletingSession(false);
    }
  };

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (commitmentCategory === "DISCOVERY" && !isDiscoveryCall(m)) return false;
      if (commitmentCategory === "ONE_ON_ONE" && !isOneOnOneCall(m)) return false;
      if (commitmentCategory === "BATCH" && !isBatchSession(m)) return false;

      if (filterType !== "ALL" && m.sessionType !== filterType) return false;
      if (filterStatus === "SCHEDULED" && m.status !== "SCHEDULED") return false;
      if (filterStatus === "CANCELLED" && m.status !== "CANCELLED") return false;
      return true;
    });
  }, [meetings, commitmentCategory, filterType, filterStatus]);

  const isSingleSeatSession = useMemo(() => {
    return sessionType === "ONE_ON_ONE" || sessionType === "ONE_ON_ONE_WITH_RO";
  }, [sessionType]);

  return (
    <div className={calStyles.meetingsContainer}>
      {/* ── 1. Page Header with Title, Description & Orange CTA ── */}
      <div className={calStyles.pageHeader}>
        <div className={calStyles.headerInfo}>
          <h1 className={calStyles.headerTitle}>Calendar</h1>
        </div>
        <div className={calStyles.headerActions} style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className={calStyles.primaryOrangeBtn}
            onClick={() => openModal()}
          >
            <Icons.Plus />
            Schedule Session
          </button>
        </div>
      </div>

      {viewMode !== "calendar" && (
      <>
      {/* ── Roweena's Unified Commitment Switcher ── */}
      <div className={calStyles.commitmentBar}>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            viewMode !== "requests" && commitmentCategory === "ALL" ? calStyles.commitmentBtnActive : ""
          }`}
          onClick={() => handleSelectCommitmentCategory("ALL")}
        >
          <span>All Commitments</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.all}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            viewMode !== "requests" && commitmentCategory === "DISCOVERY" ? calStyles.commitmentBtnActiveDiscovery : ""
          }`}
          onClick={() => handleSelectCommitmentCategory("DISCOVERY")}
        >
          <span className={calStyles.commitmentDotDiscovery} />
          <span>15-Min Discovery Calls</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.discovery}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            viewMode !== "requests" && commitmentCategory === "ONE_ON_ONE" ? calStyles.commitmentBtnActiveCoaching : ""
          }`}
          onClick={() => handleSelectCommitmentCategory("ONE_ON_ONE")}
        >
          <span className={calStyles.commitmentDotCoaching} />
          <span>1:1 Calls</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.oneOnOne}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            viewMode !== "requests" && commitmentCategory === "BATCH" ? calStyles.commitmentBtnActiveBatch : ""
          }`}
          onClick={() => handleSelectCommitmentCategory("BATCH")}
        >
          <span className={calStyles.commitmentDotBatch} />
          <span>Batch Live Sessions</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.batch}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            viewMode === "requests" ? calStyles.commitmentBtnActiveRequests : ""
          }`}
          onClick={() => {
            setViewMode("requests");
            loadRequests();
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("view", "requests");
              url.searchParams.delete("category");
              window.history.pushState({}, "", url.toString());
            }
          }}
        >
          <span className={calStyles.commitmentDotRequests} />
          <span>1:1 Call Requests</span>
          {pendingRequestsCount > 0 && (
            <span
              className={calStyles.commitmentBadge}
              style={{
                background: viewMode === "requests" ? "#ef4444" : "#fee2e2",
                color: viewMode === "requests" ? "#ffffff" : "#991b1b",
              }}
            >
              {pendingRequestsCount}
            </span>
          )}
        </button>
      </div>

      {/* ── 2. Responsive Controls Toolbar ── */}
      <div className={calStyles.controlsToolbar}>
        <div className={calStyles.filtersGroup}>
          <div className={calStyles.filterItem}>
            <span className={calStyles.filterLabel}>Session Type:</span>
            <CustomSelect
              ariaLabel="Filter meetings by type"
              value={filterType}
              onChange={(val) => setFilterType(val as any)}
              minWidth="200px"
              options={[
                { value: "ALL", label: "All Session Types" },
                ...SESSION_TYPE_OPTIONS,
              ]}
            />
          </div>

          <div className={calStyles.filterItem}>
            <span className={calStyles.filterLabel}>Status:</span>
            <CustomSelect
              ariaLabel="Filter meetings by status"
              value={filterStatus}
              onChange={(val) => setFilterStatus(val as any)}
              minWidth="150px"
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "SCHEDULED", label: "Scheduled Only" },
                { value: "CANCELLED", label: "Cancelled Only" },
              ]}
            />
          </div>
        </div>

        <div className={calStyles.toolbarRight}>
          {/* Segmented View Switcher */}
          <div className={calStyles.viewSwitcher}>
            <button
              type="button"
              className={`${calStyles.viewSwitcherBtn} ${
                (viewMode as string) === "calendar" ? calStyles.viewSwitcherBtnActive : ""
              }`}
              onClick={() => {
                setViewMode("calendar");
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("view");
                  window.history.pushState({}, "", url.toString());
                }
              }}
            >
              <Icons.Calendar />
              Calendar Grid
            </button>
            <button
              type="button"
              className={`${calStyles.viewSwitcherBtn} ${
                viewMode === "table" ? calStyles.viewSwitcherBtnActive : ""
              }`}
              onClick={() => {
                setViewMode("table");
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("view", "table");
                  window.history.pushState({}, "", url.toString());
                }
              }}
            >
              <Icons.Table />
              Table View
            </button>
            <button
              type="button"
              className={`${calStyles.viewSwitcherBtn} ${
                viewMode === "requests" ? calStyles.viewSwitcherBtnActive : ""
              }`}
              onClick={() => {
                setViewMode("requests");
                loadRequests();
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("view", "requests");
                  url.searchParams.delete("category");
                  window.history.pushState({}, "", url.toString());
                }
              }}
            >
              <Icons.Users />
              1:1 Requests
              {pendingRequestsCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: "1px 7px",
                    borderRadius: "10px",
                    background: "#e11d48",
                    color: "#fff",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                  }}
                >
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          </div>

          {/* Timezone Selector Dropdown */}
          <div className={calStyles.timezoneBadge} title="Display timezone · Preserves underlying UTC instant">
            <span className={calStyles.syncDot} />
            <Icons.Clock />
            <select
              aria-label="Display timezone"
              value={displayTimezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className={calStyles.timezoneSelect}
            >
              {timezoneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      </>
      )}

      {/* High-Visibility Banner for Pending Coaching Requests */}
      {pendingRequestsCount > 0 && viewMode === "table" && (
        <div style={{
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 10,
          padding: "12px 18px",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#92400e" }}>
            <span style={{ fontSize: "1.25rem" }}>⚡</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                {pendingRequestsCount} 1:1 Call Booking Request{pendingRequestsCount > 1 ? "s" : ""} Pending Approval
              </span>
              {pendingRequests[0]?.user && (
                <div style={{ fontSize: "0.8rem", color: "#b45309", marginTop: 2 }}>
                  Latest request: <strong>{pendingRequests[0].user.name || pendingRequests[0].user.email}</strong>
                  {pendingRequests[0].enrolment?.program?.title && ` for ${pendingRequests[0].enrolment.program.title}`}
                  {` (Preferred: ${new Date(pendingRequests[0].requestedStart).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})`}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {pendingRequests[0] && (
              <button
                type="button"
                onClick={() => {
                  const req = pendingRequests[0];
                  if (req) openApproveModal(req);
                }}
                style={{
                  background: "#b8860b",
                  color: "#ffffff",
                  border: "none",
                  padding: "7px 16px",
                  borderRadius: 6,
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>Approve &amp; Place on Calendar</span>
                <span aria-hidden="true">&rarr;</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setViewMode("requests");
                loadRequests();
              }}
              style={{
                background: "#ffffff",
                color: "#92400e",
                border: "1px solid #fde68a",
                padding: "7px 14px",
                borderRadius: 6,
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Review Requests Queue ({pendingRequestsCount})
            </button>
          </div>
        </div>
      )}

      {/* ── 3. View 1: Calendar View ── */}
      {viewMode === "calendar" && (
        <CalendarShell
          meetings={meetings}
          timeZone={displayTimezone}
          timezoneOptions={timezoneOptions}
          onTimezoneChange={handleTimezoneChange}
          onSelect={setSelectedMeeting}
          onCreate={(d, t) => openModal(d, t)}
          initialDate={urlDate}
          timeFormat={timeFormat}
          onTimeFormatChange={handleTimeFormatToggle}
        />
      )}

      {/* ── 4. View 2: Table View ── */}
      {viewMode === "table" && (
        <div className={calStyles.tableCard}>
          <div className={calStyles.tableHeaderBar}>
            <h2 className={calStyles.tableTitle}>Scheduled Sessions</h2>
            <span className={calStyles.tableCountBadge}>
              Showing {filteredMeetings.length} of {meetings.length} sessions
            </span>
          </div>

          <div className={calStyles.tableWrapper}>
            <table className={calStyles.sessionsTable}>
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>Session Title</th>
                  <th style={{ width: "14%" }}>Type</th>
                  <th style={{ width: "16%" }}>Course &amp; Cohort</th>
                  <th style={{ width: "14%" }}>Host Trainer / Learner</th>
                  <th style={{ width: "9%" }}>Capacity</th>
                  <th style={{ width: "12%" }}>When (Local)</th>
                  <th style={{ width: "11%" }}>Meeting Link</th>
                  <th style={{ width: "8%" }}>Status</th>
                  <th style={{ width: "8%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton columns={9} rows={6} />
                ) : filteredMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: "32px 16px" }}>
                      <EmptyState
                        icon="calendar"
                        title="No sessions found"
                        description={filterType !== "ALL" || filterStatus !== "ALL" || commitmentCategory !== "ALL"
                          ? "No sessions matched your current filter criteria."
                          : "Schedule your first live workshop session, coaching call, or 15-min discovery meeting."}
                        actionLabel={filterType !== "ALL" || filterStatus !== "ALL" || commitmentCategory !== "ALL" ? "Reset Filters" : "Schedule New Session"}
                        onAction={filterType !== "ALL" || filterStatus !== "ALL" || commitmentCategory !== "ALL"
                          ? () => { setFilterType("ALL"); setFilterStatus("ALL"); setCommitmentCategory("ALL"); }
                          : () => openModal()}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredMeetings.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span
                          className={calStyles.sessionTitleLink}
                          onClick={() => setSelectedMeeting(m)}
                        >
                          {m.title}
                        </span>
                      </td>
                      <td>
                        <span
                          className={calStyles.typeBadge}
                          style={{
                            background:
                              m.sessionType.includes("ONE_ON_ONE") ||
                              m.sessionType.includes("WELCOME")
                                ? "#e0f2fe"
                                : m.sessionType.includes("WORKSHOP")
                                ? "#f3e8ff"
                                : "#fef3c7",
                            color:
                              m.sessionType.includes("ONE_ON_ONE") ||
                              m.sessionType.includes("WELCOME")
                                ? "#0369a1"
                                : m.sessionType.includes("WORKSHOP")
                                ? "#6b21a8"
                                : "#92400e",
                          }}
                        >
                          {m.sessionType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {m.batch?.program?.title || "Independent Program"}
                          </span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            {m.batch?.name || "Direct Booking"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: 500 }}>
                            {m.hostTrainer?.name || m.hostTrainer?.email || "Unassigned"}
                          </span>
                          {m.learner && (
                            <span style={{ fontSize: "0.78rem", color: "var(--accent-primary)" }}>
                              Learner: {m.learner.name || m.learner.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>
                          {m.capacity} {m.capacity === 1 ? "seat" : "seats"}
                        </span>
                        {m._count?.bookings ? (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            ({m._count.bookings} booked)
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span style={{ fontSize: "0.82rem", whiteSpace: "nowrap", fontWeight: 500 }}>
                          {formatWhen(m.startTime, m.endTime, displayTimezone)}
                        </span>
                      </td>
                      <td>
                        {m.joinUrl ? (
                          <a
                            href={m.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "0.82rem",
                              color: "var(--accent-primary)",
                              textDecoration: "underline",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            Open Link
                            <Icons.ExternalLink />
                          </a>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Zoom auto-synced
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          status={m.status}
                          tone={
                            m.status === "SCHEDULED"
                              ? "pending"
                              : m.status === "COMPLETED"
                              ? "completed"
                              : "error"
                          }
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className={calStyles.actionBtnGroup}>
                          {isDiscoveryCall(m) && !m.joinUrl && m.status !== "CANCELLED" && (
                            <button
                              type="button"
                              className={calStyles.tableActionBtn}
                              style={{
                                color: "#15803d",
                                borderColor: "#bbf7d0",
                                background: "#f0fdf4",
                                fontWeight: 700,
                              }}
                              onClick={() => handleAcceptDiscovery(m.id)}
                              title="Accept discovery call and generate Zoom meeting link"
                            >
                              Accept &amp; Generate Zoom
                            </button>
                          )}
                          {isDiscoveryCall(m) && m.joinUrl && m.status !== "CANCELLED" && (
                            <button
                              type="button"
                              className={calStyles.tableActionBtn}
                              style={{
                                color: "#be123c",
                                borderColor: "#fecdd3",
                                background: "#fff1f2",
                                fontWeight: 700,
                              }}
                              disabled={isCompletingAndConverting}
                              onClick={() => handleCompleteAndConvert(m)}
                              title="Mark discovery call completed and send personalized checkout link"
                            >
                              Complete &amp; Convert &rarr;
                            </button>
                          )}
                          <button
                            type="button"
                            className={calStyles.tableActionBtn}
                            onClick={() => openEditModal(m)}
                          >
                            Edit
                          </button>
                          {m.status === "SCHEDULED" && (
                            <button
                              type="button"
                              className={`${calStyles.tableActionBtn} ${calStyles.tableCancelBtn}`}
                              onClick={() => setCancellingSessionId(m.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. View 3: 1-on-1 Coaching Requests Queue (Stage 4) ── */}
      {viewMode === "requests" && (
        <div className={calStyles.tableViewContainer}>
          {/* Quick Notice to Switch Back to Calendar */}
          <div
            style={{
              padding: "0.65rem 1rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "0.84rem", color: "#334155" }}>
              Viewing <strong>1:1 Call Approval Requests Queue</strong>. To view or filter scheduled meetings on the calendar, click any commitment pill above or switch to Calendar Grid.
            </div>
            <button
              type="button"
              onClick={() => handleSelectCommitmentCategory("ALL")}
              style={{
                fontSize: "0.78rem",
                padding: "5px 12px",
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Back to Calendar &rarr;
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {(["ALL", "PENDING_APPROVAL", "APPROVED", "REJECTED"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={calStyles.tableActionBtn}
                  style={{
                    background: requestsFilter === st ? "#0f172a" : "#fff",
                    color: requestsFilter === st ? "#fff" : "var(--text-primary)",
                    borderColor: requestsFilter === st ? "#0f172a" : "#e2e8f0",
                    fontWeight: requestsFilter === st ? 700 : 500,
                  }}
                  onClick={() => setRequestsFilter(st)}
                >
                  {st.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={calStyles.tableActionBtn}
              onClick={loadRequests}
              disabled={loadingRequests}
            >
              {loadingRequests ? "Refreshing..." : "Refresh Queue"}
            </button>
          </div>

          <div className={calStyles.tableResponsiveWrapper}>
            <table className={calStyles.meetingsTable}>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Program / Cohort</th>
                  <th>Requested Slot</th>
                  <th>Learner Timezone</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingRequests ? (
                  <TableSkeleton rows={4} columns={7} />
                ) : oneOnOneRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        title="No 1:1 Call Requests"
                        description="There are currently no 1:1 call requests matching the selected filter."
                      />
                    </td>
                  </tr>
                ) : (
                  oneOnOneRequests.map((req) => {
                    const isPastSlot = req.status === "PENDING_APPROVAL" && Boolean(req.requestedStart) && new Date(req.requestedStart).getTime() < Date.now();
                    return (
                    <tr key={req.id}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600 }}>{req.user?.name || "Learner"}</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            {req.user?.email}
                          </span>
                          {req.user?.phone && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {req.user.phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 500 }}>
                            {req.enrolment?.program?.title || "Enrolled Program"}
                          </span>
                          {req.enrolment?.batch?.name && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Cohort: {req.enrolment.batch.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 500, color: isPastSlot ? "#b91c1c" : "inherit" }}>
                            {formatWhen(req.requestedStart, req.requestedEnd, displayTimezone)}
                          </span>
                          {isPastSlot && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "0.7rem",
                                color: "#b91c1c",
                                fontWeight: 600,
                                background: "#fef2f2",
                                border: "1px solid #fecaca",
                                borderRadius: "4px",
                                padding: "1px 6px",
                                width: "fit-content",
                                marginTop: "2px",
                              }}
                            >
                              ⚠️ Slot passed
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {req.learnerTimezone || "UTC"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.8rem", maxWidth: "200px", display: "inline-block" }}>
                          {req.notes || "—"}
                        </span>
                      </td>
                      <td>
                        {isPastSlot ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "flex-start" }}>
                            <StatusBadge status="EXPIRED" tone="error" />
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Past due</span>
                          </div>
                        ) : (
                          <StatusBadge
                            status={req.status}
                            tone={
                              req.status === "PENDING_APPROVAL"
                                ? "pending"
                                : req.status === "APPROVED"
                                ? "completed"
                                : "error"
                            }
                          />
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className={calStyles.actionBtnGroup}>
                          {req.status === "PENDING_APPROVAL" && (
                            <>
                              <button
                                type="button"
                                className={calStyles.tableActionBtn}
                                style={{
                                  background: isPastSlot ? "var(--accent-primary, #b8860b)" : "#10b981",
                                  color: "#fff",
                                  borderColor: isPastSlot ? "var(--accent-primary, #b8860b)" : "#10b981",
                                  fontWeight: 600,
                                }}
                                onClick={() => openApproveModal(req)}
                                title={isPastSlot ? "Slot has passed - reschedule for today or future" : "Approve and schedule session"}
                              >
                                {isPastSlot ? "Reschedule" : "Approve & Schedule"}
                              </button>
                              <button
                                type="button"
                                className={`${calStyles.tableActionBtn} ${calStyles.tableCancelBtn}`}
                                onClick={() => setRejectingRequestId(req.id)}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {req.status === "APPROVED" && req.session?.joinUrl && (
                            <a
                              href={req.session.joinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={calStyles.tableActionBtn}
                              style={{
                                color: "var(--accent-primary)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                textDecoration: "none",
                              }}
                            >
                              Join Zoom
                              <Icons.ExternalLink />
                            </a>
                          )}
                          {req.status === "REJECTED" && req.decisionReason && (
                            <span style={{ fontSize: "0.75rem", color: "#dc2626" }}>
                              Reason: {req.decisionReason}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 5. Schedule Session Modal (Highest Priority) ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Session"
        maxWidth="720px"
        footer={
          <div className={calStyles.modalFooterActions}>
            <button
              type="button"
              className={calStyles.modalCancelBtn}
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="schedule-session-form"
              className={calStyles.modalSubmitBtn}
              disabled={isSaving}
            >
              {isSaving ? "Scheduling Session..." : "Schedule Session"}
            </button>
          </div>
        }
      >
        <form
          id="schedule-session-form"
          onSubmit={handleSchedule}
          className={calStyles.modalForm}
        >
          {formError && (
            <div className={calStyles.errorBanner} role="alert">
              <span>&bull;</span>
              <span>{formError}</span>
            </div>
          )}

          <div className={calStyles.formGrid2}>
            {/* Session Format / Type */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Session Format <span className={calStyles.requiredStar}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select session format"
                value={sessionType}
                onChange={(val) => setSessionType(val as SessionTypeEnum)}
                options={SCHEDULE_SESSION_TYPE_OPTIONS}
              />
            </div>

            {/* Program */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Program <span className={calStyles.requiredStar}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select program"
                value={course}
                onChange={(val) => {
                  setCourse(val);
                  const filtered = batches.filter((b) => getProgramTitle(b) === val);
                  setCohort(filtered[0]?.id || ALL_COHORTS);
                }}
                options={courses.map((c) => ({ value: c, label: c }))}
              />
            </div>

            {/* Batch */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Batch <span className={calStyles.requiredStar}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select batch"
                value={cohort}
                onChange={(val) => setCohort(val)}
                options={[
                  ...(sessionType === "GROUP_COHORT"
                    ? [{ value: ALL_COHORTS, label: "All Batches" }]
                    : []),
                  ...cohorts.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>

            {/* Date */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Session Date <span className={calStyles.requiredStar}>*</span>
              </label>
              <DatePicker
                value={date}
                onChange={setDate}
                minDate={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Session Title (Full Width) */}
            <div className={calStyles.formFieldFull}>
              <label className={calStyles.formLabel}>
                Session Title <span className={calStyles.requiredStar}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Week 1: Introduction to Framework or Orientation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={calStyles.inputControl}
              />
            </div>

            {/* Start Time */}
            <div className={calStyles.formField}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                <label className={calStyles.formLabel}>
                  Start Time ({CLEAN_TZ_LABELS[displayTimezone] || displayTimezone}) <span className={calStyles.requiredStar}>*</span>
                </label>
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
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                format={timeFormat}
                ariaLabel="Start time"
              />
            </div>

            {/* End Time */}
            <div className={calStyles.formField}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                <label className={calStyles.formLabel}>
                  End Time ({CLEAN_TZ_LABELS[displayTimezone] || displayTimezone}) <span className={calStyles.requiredStar}>*</span>
                </label>
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
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                format={timeFormat}
                ariaLabel="End time"
              />
            </div>

            {/* Host Trainer */}
            <div className={isSingleSeatSession ? calStyles.formField : calStyles.formFieldFull}>
              <label className={calStyles.formLabel}>Host Trainer (Optional)</label>
              <CustomSelect
                ariaLabel="Select host trainer"
                value={hostTrainerId}
                onChange={(val) => setHostTrainerId(val)}
                options={[
                  { value: "", label: "Roweena Britto (Lead Trainer)" },
                  ...availableTrainers.map((t) => ({ value: t.id, label: t.label })),
                ]}
              />
            </div>

            {/* Learner Assignment (Visible for 1:1 Call Sessions) */}
            {isSingleSeatSession ? (
              <div className={calStyles.formField}>
                <label className={calStyles.formLabel}>Assign to Enrolled Learner</label>
                <CustomSelect
                  ariaLabel="Assign learner"
                  value={learnerId}
                  onChange={(val) => setLearnerId(val)}
                  options={[
                    { value: "", label: "Open for Learner Self-Booking" },
                    ...enrolledLearners.map((l) => ({
                      value: l.id,
                      label: `${l.name} (${l.email})`,
                    })),
                  ]}
                />
              </div>
            ) : null}

            {/* Meeting Join Link */}
            <div className={calStyles.formFieldFull}>
              <label className={calStyles.formLabel}>
                Meeting Join Link (Optional)
              </label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... (Leave blank to auto-generate Zoom)"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                className={calStyles.inputControl}
              />
              <span className={calStyles.formHelpText}>
                Leave blank to automatically provision a Zoom room.
              </span>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── 6. Edit / Reschedule Modal ── */}
      <Modal
        isOpen={Boolean(editingMeeting)}
        onClose={() => setEditingMeeting(null)}
        title="Edit / Reschedule Session"
        maxWidth="640px"
        footer={
          <div className={calStyles.modalFooterActions}>
            <button
              type="button"
              className={calStyles.modalCancelBtn}
              onClick={() => setEditingMeeting(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-session-form"
              className={calStyles.modalSubmitBtn}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <span className="spinner" /> Saving...
                </>
              ) : (
                "Save & Sync Calendar"
              )}
            </button>
          </div>
        }
      >
        <form
          id="edit-session-form"
          onSubmit={handleEditSubmit}
          className={calStyles.modalForm}
        >
          {editError && (
            <div className={calStyles.errorBanner} role="alert">
              <span>&bull;</span>
              <span>{editError}</span>
            </div>
          )}

          <div className={calStyles.formGrid2}>
            <div className={calStyles.formFieldFull}>
              <label className={calStyles.formLabel}>
                Session Title <span className={calStyles.requiredStar}>*</span>
              </label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className={calStyles.inputControl}
              />
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Session Date <span className={calStyles.requiredStar}>*</span>
              </label>
              <DatePicker
                value={editDate}
                onChange={setEditDate}
              />
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>Host Trainer</label>
              <CustomSelect
                ariaLabel="Select host trainer"
                value={editHostTrainerId}
                onChange={(val) => setEditHostTrainerId(val)}
                options={[
                  { value: "", label: "Roweena Britto (Lead Trainer)" },
                  ...availableTrainers.map((t) => ({ value: t.id, label: t.label })),
                ]}
              />
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Start Time ({CLEAN_TZ_LABELS[displayTimezone] || displayTimezone}) <span className={calStyles.requiredStar}>*</span>
              </label>
              <TimePicker
                value={editStartTime}
                onChange={setEditStartTime}
                format={timeFormat}
                ariaLabel="Start time"
              />
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                End Time ({CLEAN_TZ_LABELS[displayTimezone] || displayTimezone}) <span className={calStyles.requiredStar}>*</span>
              </label>
              <TimePicker
                value={editEndTime}
                onChange={setEditEndTime}
                format={timeFormat}
                ariaLabel="End time"
              />
            </div>

            <div className={calStyles.formFieldFull}>
              <label className={calStyles.formLabel}>Meeting Join URL</label>
              <input
                type="url"
                value={editJoinUrl}
                placeholder="https://zoom.us/j/..."
                onChange={(e) => setEditJoinUrl(e.target.value)}
                className={calStyles.inputControl}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── 7. Clean Event Detail Modal ── */}
      <Modal
        isOpen={Boolean(selectedMeeting)}
        onClose={() => setSelectedMeeting(null)}
        title={
          selectedMeeting
            ? isDiscoveryCall(selectedMeeting)
              ? `Enquiry Call · ${parseDiscoveryCallDetails(selectedMeeting).prospectName || "Lead"}`
              : isOneOnOneCall(selectedMeeting)
              ? `1:1 Call · ${selectedMeeting.learner?.name || selectedMeeting.title}`
              : selectedMeeting.title
            : "Session Details"
        }
        subtitle={
          selectedMeeting
            ? isDiscoveryCall(selectedMeeting)
              ? "15-Minute Discovery Session"
              : isOneOnOneCall(selectedMeeting)
              ? "1:1 Call · Progression"
              : selectedMeeting.batch?.name || "Batch Live Session"
            : ""
        }
        maxWidth="560px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: "8px", flexWrap: "wrap" }}>
            <div>
              {selectedMeeting?.status === "SCHEDULED" && (
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    color: "#dc2626",
                    border: "none",
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    padding: "6px 4px",
                  }}
                  onClick={() => {
                    if (selectedMeeting) setCancellingSessionId(selectedMeeting.id);
                  }}
                >
                  Cancel Session
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className={calStyles.modalCancelBtn}
                onClick={() => {
                  if (selectedMeeting) openEditModal(selectedMeeting);
                }}
              >
                Reschedule
              </button>
              {selectedMeeting && selectedMeeting.status === "SCHEDULED" && (
                <button
                  type="button"
                  className={calStyles.modalSubmitBtn}
                  style={{ background: "#15803d" }}
                  disabled={isCompletingOneOnOne}
                  onClick={() => handleCompleteSession(selectedMeeting)}
                >
                  {isCompletingOneOnOne ? "Completing..." : "Mark Completed ✓"}
                </button>
              )}
              <button
                type="button"
                className={calStyles.modalCancelBtn}
                onClick={() => setSelectedMeeting(null)}
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {selectedMeeting && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "4px 0" }}>
            {/* Status & Category Banner */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: isDiscoveryCall(selectedMeeting) ? "#fff1f2" : isOneOnOneCall(selectedMeeting) ? "#f0f9ff" : "#fffbeb",
              borderRadius: "8px",
              border: `1px solid ${isDiscoveryCall(selectedMeeting) ? "#fecdd3" : isOneOnOneCall(selectedMeeting) ? "#bae6fd" : "#fde68a"}`
            }}>
              <span style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: isDiscoveryCall(selectedMeeting) ? "#9f1239" : isOneOnOneCall(selectedMeeting) ? "#0369a1" : "#92400e"
              }}>
                {isDiscoveryCall(selectedMeeting) ? "Enquiry Call (15-min)" : isOneOnOneCall(selectedMeeting) ? "1:1 Call" : "Batch Live Session"}
              </span>
              <StatusBadge
                status={selectedMeeting.status}
                tone={
                  selectedMeeting.status === "SCHEDULED"
                    ? "pending"
                    : selectedMeeting.status === "COMPLETED"
                    ? "completed"
                    : "error"
                }
              />
            </div>

            {/* Structured Session Details Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "10px 14px", fontSize: "0.86rem", alignItems: "baseline" }}>
              <span style={{ color: "#78716c", fontWeight: 600 }}>Scheduled For:</span>
              <span style={{ color: "#1c1917", fontWeight: 600 }}>
                {formatWhen(selectedMeeting.startTime, selectedMeeting.endTime, displayTimezone)} ({displayTimezone})
              </span>

              {isDiscoveryCall(selectedMeeting) ? (
                <>
                  <span style={{ color: "#78716c", fontWeight: 600 }}>Prospect:</span>
                  <span style={{ color: "#1c1917", fontWeight: 600 }}>
                    {parseDiscoveryCallDetails(selectedMeeting).prospectName}
                    {parseDiscoveryCallDetails(selectedMeeting).prospectEmail && (
                      <span style={{ color: "#78716c", fontWeight: 400, marginLeft: "6px" }}>
                        ({parseDiscoveryCallDetails(selectedMeeting).prospectEmail})
                      </span>
                    )}
                  </span>

                  <span style={{ color: "#78716c", fontWeight: 600 }}>Course Inquiry:</span>
                  <span style={{ color: "#1c1917" }}>
                    {parseDiscoveryCallDetails(selectedMeeting).courseInquiry}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: "#78716c", fontWeight: 600 }}>Program / Batch:</span>
                  <span style={{ color: "#1c1917" }}>
                    {selectedMeeting.batch?.program?.title || "Program"} &bull; {selectedMeeting.batch?.name || "Direct Booking"}
                  </span>

                  {selectedMeeting.learner && (
                    <>
                      <span style={{ color: "#78716c", fontWeight: 600 }}>Learner:</span>
                      <span style={{ color: "#1c1917", fontWeight: 600 }}>
                        {selectedMeeting.learner.name || selectedMeeting.learner.email}
                      </span>
                    </>
                  )}
                </>
              )}

              <span style={{ color: "#78716c", fontWeight: 600 }}>Host Trainer:</span>
              <span style={{ color: "#1c1917" }}>
                {selectedMeeting.hostTrainer?.name || selectedMeeting.hostTrainer?.email || "Roweena Britto"}
              </span>

              <span style={{ color: "#78716c", fontWeight: 600 }}>Video Link:</span>
              <span>
                {selectedMeeting.joinUrl ? (
                  <a
                    href={selectedMeeting.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#b8860b",
                      textDecoration: "underline",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    Open Zoom Meeting &rarr;
                  </a>
                ) : (
                  <span style={{ color: "#78716c", fontStyle: "italic" }}>Zoom link automatically generated on booking</span>
                )}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* ── 8. Day Sessions Modal ("+N more" Expander) ── */}
      <Modal
        isOpen={Boolean(viewingDaySessions)}
        onClose={() => setViewingDaySessions(null)}
        title={
          viewingDaySessions ? `Sessions on ${viewingDaySessions.dateFormatted}` : "Day Sessions"
        }
        subtitle={`${viewingDaySessions?.events.length || 0} scheduled sessions`}
        maxWidth="560px"
        footer={
          <div className={calStyles.modalFooterActions}>
            <button
              type="button"
              className={calStyles.modalCancelBtn}
              onClick={() => {
                const targetDate = viewingDaySessions?.dateString;
                setViewingDaySessions(null);
                openModal(targetDate);
              }}
            >
              + Schedule on This Day
            </button>
            <button
              type="button"
              className={calStyles.modalSubmitBtn}
              onClick={() => setViewingDaySessions(null)}
            >
              Close
            </button>
          </div>
        }
      >
        <div className={calStyles.daySessionList}>
          {viewingDaySessions?.events.map((evt) => (
            <div
              key={evt.id}
              className={calStyles.daySessionCard}
              onClick={() => {
                setViewingDaySessions(null);
                setSelectedMeeting(evt);
              }}
            >
              <div className={calStyles.daySessionCardLeft}>
                <span className={calStyles.daySessionCardTitle}>{evt.title}</span>
                <span className={calStyles.daySessionCardMeta}>
                  <strong>{formatShortTime(evt.startTime, displayTimezone)} – {formatShortTime(evt.endTime, displayTimezone)}</strong>
                  &bull;
                  <span>{evt.hostTrainer?.name || "Roweena Britto"}</span>
                </span>
              </div>
              <span
                className={calStyles.typeBadge}
                style={{
                  background:
                    evt.sessionType.includes("ONE_ON_ONE") || evt.sessionType.includes("WELCOME")
                      ? "#e0f2fe"
                      : evt.sessionType.includes("WORKSHOP")
                      ? "#f3e8ff"
                      : "#fef3c7",
                  color:
                    evt.sessionType.includes("ONE_ON_ONE") || evt.sessionType.includes("WELCOME")
                      ? "#0369a1"
                      : evt.sessionType.includes("WORKSHOP")
                      ? "#6b21a8"
                      : "#92400e",
                }}
              >
                {evt.sessionType.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── 9. Cancel Confirmation Dialog ── */}
      <InputDialog
        isOpen={Boolean(cancellingSessionId)}
        title="Cancel Session"
        description="Please provide a cancellation reason. Attendees will be notified."
        label="Cancellation Reason"
        placeholder="e.g., Coach emergency reschedule"
        initialValue="Administrative cancellation"
        confirmText={isCancelling ? "Cancelling..." : "Confirm Cancellation"}
        tone="danger"
        isLoading={isCancelling}
        onSubmit={confirmCancelSession}
        onClose={() => {
          setCancellingSessionId(null);
          setCancelError(null);
        }}
      />

      {/* ── 10. Delete Confirmation Dialog ── */}
      <ConfirmDialog
        isOpen={Boolean(deletingSessionId)}
        title="Permanently Delete Session"
        description="Are you sure you want to permanently delete this session? This action cannot be undone and will remove it from all calendars."
        confirmText={isDeletingSession ? "Deleting..." : "Permanently Delete"}
        tone="danger"
        isLoading={isDeletingSession}
        onConfirm={confirmDeleteSession}
        onClose={() => {
          setDeletingSessionId(null);
          setDeleteSessionError(null);
        }}
      />

      {/* ── 11. Approve 1-on-1 Request Modal ── */}
      <Modal
        isOpen={Boolean(approvingRequest)}
        onClose={() => setApprovingRequest(null)}
        title="Approve 1:1 Call Session"
        subtitle={`Schedule 1:1 call for ${approvingRequest?.user?.name || approvingRequest?.user?.email || "Learner"}`}
        maxWidth="600px"
        footer={
          <div className={calStyles.modalFooterActions}>
            <button
              type="button"
              className={calStyles.modalCancelBtn}
              onClick={() => setApprovingRequest(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="approve-one-on-one-form"
              className={calStyles.modalSubmitBtn}
              disabled={isSubmittingApproval}
            >
              {isSubmittingApproval ? "Scheduling & Generating Zoom..." : "Confirm & Schedule"}
            </button>
          </div>
        }
      >
        <form
          id="approve-one-on-one-form"
          onSubmit={handleConfirmApproval}
          className={calStyles.modalForm}
        >
          {approvalError && (
            <div className={calStyles.errorBanner} role="alert">
              <span>&bull;</span>
              <span>{approvalError}</span>
            </div>
          )}

          {approvingRequest && new Date(approvingRequest.requestedStart).getTime() < Date.now() && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: "12px",
                color: "#991b1b",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <strong>Requested Slot Has Passed:</strong>
              </div>
              The slot originally requested by the learner (
              {new Date(approvingRequest.requestedStart).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              ) has already passed. A past slot cannot be accepted. Please select a future date and time below to schedule this session.
            </div>
          )}

          <div className={calStyles.formField}>
            <label className={calStyles.formLabel}>
              Assign Host Trainer <span className={calStyles.requiredStar}>*</span>
            </label>
            <CustomSelect
              ariaLabel="Select Host Trainer"
              value={approvalHostTrainerId}
              onChange={(val) => setApprovalHostTrainerId(val)}
              options={
                allTrainers.length > 0
                  ? allTrainers.map((t) => ({ value: t.id, label: t.label }))
                  : [{ value: "", label: "Roweena Kini / Lead Instructor" }]
              }
            />
          </div>

          <div className={calStyles.formField}>
            <label className={calStyles.formLabel}>
              Session Date <span className={calStyles.requiredStar}>*</span>
            </label>
            <DatePicker
              value={approvalDate}
              onChange={setApprovalDate}
              minDate={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div className={calStyles.formGrid2}>
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Start Time ({CLEAN_TZ_LABELS[displayTimezone] || displayTimezone}) <span className={calStyles.requiredStar}>*</span>
              </label>
              <TimePicker
                value={approvalStartTime}
                onChange={setApprovalStartTime}
                format={timeFormat}
                ariaLabel="Start time"
              />
            </div>
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                End Time ({CLEAN_TZ_LABELS[displayTimezone] || displayTimezone}) <span className={calStyles.requiredStar}>*</span>
              </label>
              <TimePicker
                value={approvalEndTime}
                onChange={setApprovalEndTime}
                format={timeFormat}
                ariaLabel="End time"
              />
            </div>
          </div>

          <div className={calStyles.formField}>
            <label className={calStyles.formLabel}>Session Notes / Agenda</label>
            <textarea
              rows={3}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Key topics, Stage 4 milestones..."
              className={calStyles.formInput}
            />
          </div>
        </form>
      </Modal>

      {/* ── 12. Reject 1-on-1 Request Dialog ── */}
      <InputDialog
        isOpen={Boolean(rejectingRequestId)}
        title="Reject 1:1 Call Request"
        description="Please provide a reason for declining this request. The learner will be notified to pick another time."
        label="Reason for Declining"
        placeholder="e.g., Trainer unavailable during requested slot, please pick another afternoon slot..."
        initialValue=""
        confirmText={isSubmittingReject ? "Declining..." : "Decline Request"}
        tone="danger"
        isLoading={isSubmittingReject}
        onClose={() => setRejectingRequestId(null)}
        onSubmit={handleConfirmReject}
      />
    </div>
  );
}
