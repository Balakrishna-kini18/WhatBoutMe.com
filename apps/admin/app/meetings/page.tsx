"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import calStyles from "./calendar.module.css";
import { API_URL, errorMessage, detectCalendarConflict } from "../lib/api";
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
  | "COACHING"
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

export const isDiscoveryCall = (m: Meeting) => m.sessionType === "SPEAKER_DISCOVERY_CALL";
export const isCoachingCall = (m: Meeting) =>
  m.sessionType === "ONE_ON_ONE" ||
  m.sessionType === "ONE_ON_ONE_WITH_RO" ||
  m.sessionType === "WELCOME_CALL_11_STEPS" ||
  m.sessionType === "CLOSING_CALL_11_STEPS";
export const isBatchSession = (m: Meeting) =>
  m.sessionType === "GROUP_COHORT" ||
  m.sessionType === "BATCH_CLASS" ||
  m.sessionType === "VISION_BOARD_WORKSHOP" ||
  m.sessionType === "VISION_BOARD_ONLINE";

export const parseDiscoveryCallDetails = (m: Meeting) => {
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

const SESSION_TYPE_OPTIONS: Array<{ value: SessionTypeEnum; label: string }> = [
  { value: "GROUP_COHORT", label: "Group Cohort Session" },
  { value: "ONE_ON_ONE", label: "1-on-1 Coaching Session" },
  { value: "WELCOME_CALL_11_STEPS", label: "11 Steps Welcome Call" },
  { value: "CLOSING_CALL_11_STEPS", label: "11 Steps Closing Call" },
  { value: "ONE_ON_ONE_WITH_RO", label: "1:1 with Ro" },
  { value: "VISION_BOARD_WORKSHOP", label: "Vision Board Workshop (In-Person / Online)" },
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
};

export default function MeetingsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View state: 'calendar' (Single Calendar System) or 'table'
  const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar");
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());

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

  const commitmentCounts = useMemo(() => {
    let discovery = 0;
    let coaching = 0;
    let batch = 0;
    for (const m of meetings) {
      if (isDiscoveryCall(m)) discovery++;
      else if (isCoachingCall(m)) coaching++;
      else batch++;
    }
    return { all: meetings.length, discovery, coaching, batch };
  }, [meetings]);

  const handleCompleteAndConvert = async (meeting: Meeting) => {
    setIsCompletingAndConverting(true);
    try {
      if (meeting.status !== "COMPLETED") {
        await fetch(`${API_URL}/sessions/${meeting.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        }).catch(() => null);

        setMeetings((prev) =>
          prev.map((m) => (m.id === meeting.id ? { ...m, status: "COMPLETED" as const } : m))
        );
      }

      toastSuccess("Discovery Call marked Completed! Opening CRM Conversion...");

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
      toastError("Could not complete call. Redirecting to CRM...");
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

  const [displayTimezone, setDisplayTimezone] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_display_tz");
      if (saved) return saved;
    }
    return getSystemTimezone();
  });

  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  // Sync profile timezone on mount
  useEffect(() => {
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

  const load = async () => {
    try {
      const [meetingsRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/sessions/all`),
        fetch(`${API_URL}/batches`),
      ]);
      if (meetingsRes.ok) setMeetings(await meetingsRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
    } catch (e) {
      console.error("Failed to load meetings", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Sync capacity when cohort or sessionType changes
  useEffect(() => {
    if (
      sessionType === "ONE_ON_ONE" ||
      sessionType === "ONE_ON_ONE_WITH_RO" ||
      sessionType === "WELCOME_CALL_11_STEPS" ||
      sessionType === "CLOSING_CALL_11_STEPS" ||
      sessionType === "SPEAKER_DISCOVERY_CALL"
    ) {
      setCapacity(1);
    } else if (currentBatch?.capacity) {
      setCapacity(currentBatch.capacity);
    }
  }, [sessionType, currentBatch]);

  const openModal = (initialDate?: string) => {
    const defaultCourse = courses[0] || "";
    setSessionType("GROUP_COHORT");
    setCourse(defaultCourse);
    const initialCohorts = batches.filter((b) => getProgramTitle(b) === defaultCourse);
    const initialCohortId = initialCohorts[0]?.id || ALL_COHORTS;
    setCohort(initialCohortId);
    setTitle("");
    setDate(initialDate || (new Date().toISOString().split("T")[0] ?? ""));
    setStartTime("10:00");
    setEndTime("11:00");
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

      const res = await fetch(`${API_URL}/sessions/${editingMeeting.id}`, {
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

    const isSingleSeat =
      sessionType === "ONE_ON_ONE" ||
      sessionType === "ONE_ON_ONE_WITH_RO" ||
      sessionType === "WELCOME_CALL_11_STEPS" ||
      sessionType === "CLOSING_CALL_11_STEPS" ||
      sessionType === "SPEAKER_DISCOVERY_CALL";

    if (isSingleSeat && capacity !== 1) {
      setFormError("1-on-1 coaching sessions must have a capacity of 1.");
      return;
    }

    if (!isSingleSeat && capacity < 1) {
      setFormError("Group session capacity must be at least 1.");
      return;
    }

    if (isSingleSeat && cohort === ALL_COHORTS) {
      setFormError("1-on-1 coaching sessions must be scheduled for a specific cohort.");
      return;
    }

    const targets = cohorts.filter((b) => cohort === ALL_COHORTS || b.id === cohort);
    if (targets.length === 0) {
      setFormError("No cohorts available for this course. Create an active batch first.");
      return;
    }

    setIsSaving(true);
    try {
      for (const target of targets) {
        const payload: Record<string, any> = {
          batchId: target.id,
          title: title.trim(),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          sessionType,
          capacity: isSingleSeat ? 1 : Number(capacity),
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

        const res = await fetch(`${API_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await errorMessage(
            res,
            `Could not schedule session for cohort ${target.name}`,
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
      const res = await fetch(`${API_URL}/sessions/${targetId}/cancel`, {
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
      const res = await fetch(`${API_URL}/sessions/${targetId}`, { method: "DELETE" });
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
      if (commitmentCategory === "COACHING" && !isCoachingCall(m)) return false;
      if (commitmentCategory === "BATCH" && !isBatchSession(m)) return false;

      if (filterType !== "ALL" && m.sessionType !== filterType) return false;
      if (filterStatus === "SCHEDULED" && m.status !== "SCHEDULED") return false;
      if (filterStatus === "CANCELLED" && m.status !== "CANCELLED") return false;
      return true;
    });
  }, [meetings, commitmentCategory, filterType, filterStatus]);

  // ── Month Calendar Grid Calculation ───────────────────────────────────────
  const calendarDays = useMemo(() => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonthYear =
      today.getFullYear() === year && today.getMonth() === month;

    const days: Array<{
      date: Date;
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: Meeting[];
    }> = [];

    const formatYmd = (y: number, m: number, day: number) =>
      `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // Leading days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const d = new Date(year, month - 1, dayNum);
      const dateStr = formatYmd(year, month - 1, dayNum);
      days.push({
        date: d,
        dateString: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: false,
        events: filteredMeetings.filter(
          (m) => getSessionDateInTz(m.startTime, displayTimezone) === dateStr,
        ),
      });
    }

    // Days in current month
    for (let dayNum = 1; dayNum <= daysInCurrentMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const dateStr = formatYmd(year, month, dayNum);
      const isToday = isCurrentMonthYear && today.getDate() === dayNum;
      days.push({
        date: d,
        dateString: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: true,
        isToday,
        events: filteredMeetings.filter(
          (m) => getSessionDateInTz(m.startTime, displayTimezone) === dateStr,
        ),
      });
    }

    // Trailing days to fill 35 or 42 cells (7 columns)
    const totalCells = days.length <= 35 ? 35 : 42;
    const remainingDays = totalCells - days.length;
    for (let dayNum = 1; dayNum <= remainingDays; dayNum++) {
      const d = new Date(year, month + 1, dayNum);
      const dateStr = formatYmd(year, month + 1, dayNum);
      days.push({
        date: d,
        dateString: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: false,
        events: filteredMeetings.filter(
          (m) => getSessionDateInTz(m.startTime, displayTimezone) === dateStr,
        ),
      });
    }

    return days;
  }, [currentCalendarDate, filteredMeetings, displayTimezone]);

  const monthYearLabel = useMemo(() => {
    return currentCalendarDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [currentCalendarDate]);

  const prevMonth = () => {
    setCurrentCalendarDate(
      new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1),
    );
  };

  const nextMonth = () => {
    setCurrentCalendarDate(
      new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1),
    );
  };

  const goToToday = () => {
    setCurrentCalendarDate(new Date());
  };

  const isSingleSeatSession = useMemo(() => {
    return (
      sessionType === "ONE_ON_ONE" ||
      sessionType === "ONE_ON_ONE_WITH_RO" ||
      sessionType === "WELCOME_CALL_11_STEPS" ||
      sessionType === "CLOSING_CALL_11_STEPS" ||
      sessionType === "SPEAKER_DISCOVERY_CALL"
    );
  }, [sessionType]);

  return (
    <div className={calStyles.meetingsContainer}>
      {/* ── 1. Page Header with Title, Description & Orange CTA ── */}
      <div className={calStyles.pageHeader}>
        <div className={calStyles.headerInfo}>
          <h1 className={calStyles.headerTitle}>Calendar &amp; Session Management</h1>
          <p className={calStyles.headerSubtitle}>
            Unified scheduling for cohort classes, 1-on-1 coaching, workshops, and Microsoft Outlook sync.
          </p>
        </div>
        <div className={calStyles.headerActions}>
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

      {/* ── Roweena's Unified Commitment Switcher ── */}
      <div className={calStyles.commitmentBar}>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            commitmentCategory === "ALL" ? calStyles.commitmentBtnActive : ""
          }`}
          onClick={() => setCommitmentCategory("ALL")}
        >
          <span>All Commitments</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.all}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            commitmentCategory === "DISCOVERY" ? calStyles.commitmentBtnActiveDiscovery : ""
          }`}
          onClick={() => setCommitmentCategory("DISCOVERY")}
        >
          <span className={calStyles.commitmentDotDiscovery} />
          <span>15-Min Discovery Calls</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.discovery}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            commitmentCategory === "COACHING" ? calStyles.commitmentBtnActiveCoaching : ""
          }`}
          onClick={() => setCommitmentCategory("COACHING")}
        >
          <span className={calStyles.commitmentDotCoaching} />
          <span>1:1 Coaching Calls</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.coaching}</span>
        </button>
        <button
          type="button"
          className={`${calStyles.commitmentBtn} ${
            commitmentCategory === "BATCH" ? calStyles.commitmentBtnActiveBatch : ""
          }`}
          onClick={() => setCommitmentCategory("BATCH")}
        >
          <span className={calStyles.commitmentDotBatch} />
          <span>Batch Live Sessions</span>
          <span className={calStyles.commitmentBadge}>{commitmentCounts.batch}</span>
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
                viewMode === "calendar" ? calStyles.viewSwitcherBtnActive : ""
              }`}
              onClick={() => setViewMode("calendar")}
            >
              <Icons.Calendar />
              Calendar Grid
            </button>
            <button
              type="button"
              className={`${calStyles.viewSwitcherBtn} ${
                viewMode === "table" ? calStyles.viewSwitcherBtnActive : ""
              }`}
              onClick={() => setViewMode("table")}
            >
              <Icons.Table />
              Table View
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

      {/* ── 3. View 1: Calendar View ── */}
      {viewMode === "calendar" && (
        <div className={calStyles.calendarContainer}>
          <div className={calStyles.calendarToolbar}>
            <div className={calStyles.calendarNavGroup}>
              <button
                type="button"
                className={calStyles.navButton}
                onClick={prevMonth}
                aria-label="Previous Month"
              >
                &larr; Prev
              </button>
              <button type="button" className={calStyles.navButton} onClick={goToToday}>
                Today
              </button>
              <button
                type="button"
                className={calStyles.navButton}
                onClick={nextMonth}
                aria-label="Next Month"
              >
                Next &rarr;
              </button>
            </div>

            <div className={calStyles.monthHeading}>{monthYearLabel}</div>

            <div className={calStyles.legendGroup}>
              <span className={calStyles.legendItem}>
                <span className={calStyles.legendColorBox} style={{ background: "#fde68a" }} />
                Cohort
              </span>
              <span className={calStyles.legendItem}>
                <span className={calStyles.legendColorBox} style={{ background: "#bae6fd" }} />
                1-on-1 / Welcome
              </span>
              <span className={calStyles.legendItem}>
                <span className={calStyles.legendColorBox} style={{ background: "#e9d5ff" }} />
                Workshop
              </span>
              <span className={calStyles.legendItem}>
                <span className={calStyles.legendColorBox} style={{ background: "#fecdd3" }} />
                Discovery
              </span>
            </div>
          </div>

          <div className={calStyles.weekdayGrid}>
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className={calStyles.daysGrid}>
            {calendarDays.map((cell, idx) => {
              const maxVisible = 3;
              const visibleEvents = cell.events.slice(0, maxVisible);
              const remainingCount = cell.events.length - maxVisible;

              return (
                <div
                  key={`${cell.dateString}-${idx}`}
                  className={`${calStyles.dayCell} ${
                    !cell.isCurrentMonth ? calStyles.dayCellOutside : ""
                  } ${cell.isToday ? calStyles.dayCellToday : ""}`}
                >
                  <div className={calStyles.dayHeader}>
                    <span
                      className={`${calStyles.dayNumber} ${
                        cell.isToday ? calStyles.todayNumber : ""
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    <button
                      type="button"
                      className={calStyles.addSlotBtn}
                      title={`Schedule session on ${cell.dateString}`}
                      onClick={() => openModal(cell.dateString)}
                    >
                      +
                    </button>
                  </div>

                  <div className={calStyles.eventsStack}>
                    {visibleEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className={`${calStyles.eventPill} ${getPillStyleClass(
                          evt.sessionType,
                          evt.status,
                        )}`}
                        title={`${evt.title} (${formatShortTime(evt.startTime, displayTimezone)})`}
                        onClick={() => setSelectedMeeting(evt)}
                      >
                        <span className={calStyles.eventTime}>{formatShortTime(evt.startTime, displayTimezone)}</span>
                        <span className={calStyles.eventTitle}>{evt.title}</span>
                      </div>
                    ))}

                    {remainingCount > 0 && (
                      <button
                        type="button"
                        className={calStyles.moreEventsBtn}
                        onClick={() =>
                          setViewingDaySessions({
                            dateString: cell.dateString,
                            dateFormatted: cell.date.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }),
                            events: cell.events,
                          })
                        }
                      >
                        <span>+{remainingCount} more</span>
                        <span>&rsaquo;</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
                  <tr>
                    <td
                      colSpan={9}
                      style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}
                    >
                      Loading sessions...
                    </td>
                  </tr>
                ) : filteredMeetings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}
                    >
                      No sessions matching your filter criteria.
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
                          {isDiscoveryCall(m) && m.status !== "CANCELLED" && (
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

      {/* ── 5. Schedule Session Modal (Highest Priority) ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Session"
        subtitle="Create a new class, workshop, or 1-on-1 coaching session with Outlook calendar sync."
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
              {isSaving ? "Scheduling & Syncing..." : "Confirm & Sync Calendar"}
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
            {/* Session Type */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Session Type <span className={calStyles.requiredStar}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select session type"
                value={sessionType}
                onChange={(val) => setSessionType(val as SessionTypeEnum)}
                options={SESSION_TYPE_OPTIONS}
              />
            </div>

            {/* Course */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Course Program <span className={calStyles.requiredStar}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select course"
                value={course}
                onChange={(val) => {
                  setCourse(val);
                  const filtered = batches.filter((b) => getProgramTitle(b) === val);
                  setCohort(filtered[0]?.id || ALL_COHORTS);
                }}
                options={courses.map((c) => ({ value: c, label: c }))}
              />
            </div>

            {/* Cohort / Batch */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Cohort / Batch <span className={calStyles.requiredStar}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select cohort"
                value={cohort}
                onChange={(val) => setCohort(val)}
                options={[
                  ...(sessionType === "GROUP_COHORT"
                    ? [{ value: ALL_COHORTS, label: "All Cohorts (Batch Schedule)" }]
                    : []),
                  ...cohorts.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>

            {/* Seat Capacity */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Seat Capacity <span className={calStyles.requiredStar}>*</span>
              </label>
              <input
                type="number"
                min={1}
                required
                disabled={isSingleSeatSession}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className={calStyles.inputControl}
              />
              {isSingleSeatSession && (
                <span className={calStyles.formHelpText}>
                  Fixed to 1 seat for individual coaching sessions.
                </span>
              )}
            </div>

            {/* Session Title (Full Width) */}
            <div className={calStyles.formFieldFull}>
              <label className={calStyles.formLabel}>
                Session Title <span className={calStyles.requiredStar}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., 11 Steps to U: Welcome Call & Orientation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={calStyles.inputControl}
              />
            </div>

            {/* Date */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Session Date <span className={calStyles.requiredStar}>*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={calStyles.inputControl}
              />
            </div>

            {/* Timing (Start & End Side-by-Side) */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Timing ({localTimezone}) <span className={calStyles.requiredStar}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <input
                  type="time"
                  required
                  aria-label="Start time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={calStyles.inputControl}
                />
                <input
                  type="time"
                  required
                  aria-label="End time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={calStyles.inputControl}
                />
              </div>
            </div>

            {/* Host Trainer */}
            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>Host Trainer (Optional)</label>
              <CustomSelect
                ariaLabel="Select host trainer"
                value={hostTrainerId}
                onChange={(val) => setHostTrainerId(val)}
                options={[
                  { value: "", label: "Default Coach (Roweena Britto)" },
                  ...availableTrainers.map((t) => ({ value: t.id, label: t.label })),
                ]}
              />
            </div>

            {/* Learner Assignment (Visible for 1-on-1 Sessions) */}
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
                placeholder="https://zoom.us/j/... or Google Meet (Leave blank to auto-generate Zoom)"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                className={calStyles.inputControl}
              />
              <span className={calStyles.formHelpText}>
                Leave blank to automatically provision a Zoom room and sync with Microsoft Outlook.
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
        subtitle="Update timing, title, or host trainer. Microsoft Outlook calendar will update automatically."
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
              {isUpdating ? "Saving..." : "Save & Sync Calendar"}
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
                Date <span className={calStyles.requiredStar}>*</span>
              </label>
              <input
                type="date"
                required
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className={calStyles.inputControl}
              />
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>
                Timing ({localTimezone}) <span className={calStyles.requiredStar}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <input
                  type="time"
                  required
                  aria-label="Start time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className={calStyles.inputControl}
                />
                <input
                  type="time"
                  required
                  aria-label="End time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  className={calStyles.inputControl}
                />
              </div>
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>Seat Capacity</label>
              <input
                type="number"
                min={1}
                value={editCapacity}
                onChange={(e) => setEditCapacity(Number(e.target.value))}
                className={calStyles.inputControl}
              />
            </div>

            <div className={calStyles.formField}>
              <label className={calStyles.formLabel}>Host Trainer</label>
              <CustomSelect
                ariaLabel="Select host trainer"
                value={editHostTrainerId}
                onChange={(val) => setEditHostTrainerId(val)}
                options={[
                  { value: "", label: "Default Coach (Roweena Britto)" },
                  ...availableTrainers.map((t) => ({ value: t.id, label: t.label })),
                ]}
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

      {/* ── 7. Event Detail Modal (From Calendar Event Click) ── */}
      <Modal
        isOpen={Boolean(selectedMeeting)}
        onClose={() => setSelectedMeeting(null)}
        title={selectedMeeting?.title || "Session Details"}
        subtitle={selectedMeeting?.sessionType.replace(/_/g, " ")}
        maxWidth="580px"
        footer={
          <div className={calStyles.modalFooterActions}>
            {selectedMeeting && isDiscoveryCall(selectedMeeting) && selectedMeeting.status !== "CANCELLED" && (
              <button
                type="button"
                className={calStyles.primaryOrangeBtn}
                style={{
                  background: "#be123c",
                  boxShadow: "0 2px 6px rgba(190, 18, 60, 0.3)",
                }}
                disabled={isCompletingAndConverting}
                onClick={() => handleCompleteAndConvert(selectedMeeting)}
              >
                Mark Call Completed &amp; Convert Lead &rarr;
              </button>
            )}
            {selectedMeeting?.status === "SCHEDULED" && (
              <button
                type="button"
                className={calStyles.modalCancelBtn}
                style={{ color: "#dc2626", borderColor: "#fecaca" }}
                onClick={() => {
                  if (selectedMeeting) setCancellingSessionId(selectedMeeting.id);
                }}
              >
                Cancel Session
              </button>
            )}
            <button
              type="button"
              className={calStyles.modalCancelBtn}
              onClick={() => {
                if (selectedMeeting) openEditModal(selectedMeeting);
              }}
            >
              Edit / Reschedule
            </button>
            <button
              type="button"
              className={calStyles.modalSubmitBtn}
              onClick={() => setSelectedMeeting(null)}
            >
              Done
            </button>
          </div>
        }
      >
        {selectedMeeting && (
          <div className={calStyles.detailSection}>
            {/* Dedicated Discovery Call Prospect & Conversion Card */}
            {isDiscoveryCall(selectedMeeting) && (
              <div
                style={{
                  background: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
                  border: "1px solid #fecdd3",
                  borderRadius: "10px",
                  padding: "1rem",
                  marginBottom: "0.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#9f1239",
                      background: "#ffe4e6",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                    }}
                  >
                    1-to-1 15-Minute Discovery Call
                  </span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#be123c" }}>
                    Roweena Britto Calendar
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
                  <div>
                    <span style={{ color: "#9f1239", fontSize: "0.75rem", fontWeight: 600, display: "block" }}>
                      Prospect Name:
                    </span>
                    <strong style={{ color: "#881337" }}>
                      {parseDiscoveryCallDetails(selectedMeeting).prospectName}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#9f1239", fontSize: "0.75rem", fontWeight: 600, display: "block" }}>
                      Email:
                    </span>
                    <span style={{ color: "#881337" }}>
                      {parseDiscoveryCallDetails(selectedMeeting).prospectEmail || "—"}
                    </span>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "#9f1239", fontSize: "0.75rem", fontWeight: 600, display: "block" }}>
                      Inquired Curriculum Program:
                    </span>
                    <strong style={{ color: "#881337" }}>
                      {parseDiscoveryCallDetails(selectedMeeting).courseInquiry}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "0.5rem",
                    borderTop: "1px dashed #fca5a5",
                    marginTop: "0.25rem",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#9f1239" }}>Zoom Link:</span>
                    <a
                      href={parseDiscoveryCallDetails(selectedMeeting).zoomLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.8rem", color: "#0284c7", fontWeight: 600, textDecoration: "underline" }}
                    >
                      Open Zoom Room &rarr;
                    </a>
                  </div>

                  <button
                    type="button"
                    disabled={isCompletingAndConverting}
                    onClick={() => handleCompleteAndConvert(selectedMeeting)}
                    style={{
                      background: "#be123c",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      padding: "0.45rem 0.9rem",
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      boxShadow: "0 2px 4px rgba(190, 18, 60, 0.25)",
                    }}
                  >
                    <span>Mark Completed &amp; Convert &rarr;</span>
                  </button>
                </div>
              </div>
            )}

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>When:</span>
              <span className={calStyles.detailValue}>
                {formatWhen(selectedMeeting.startTime, selectedMeeting.endTime, displayTimezone)} ({displayTimezone})
              </span>
            </div>

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>Course &amp; Cohort:</span>
              <span className={calStyles.detailValue}>
                {selectedMeeting.batch?.program?.title || "Program"} &bull;{" "}
                {selectedMeeting.batch?.name || "Direct Booking"}
              </span>
            </div>

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>Host Trainer:</span>
              <span className={calStyles.detailValue}>
                {selectedMeeting.hostTrainer?.name ||
                  selectedMeeting.hostTrainer?.email ||
                  "Default Coach (Roweena Britto)"}
              </span>
            </div>

            {selectedMeeting.learner && (
              <div className={calStyles.detailRow}>
                <span className={calStyles.detailLabel}>Assigned Learner:</span>
                <span className={calStyles.detailValue}>
                  {selectedMeeting.learner.name || selectedMeeting.learner.email}
                </span>
              </div>
            )}

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>Capacity:</span>
              <span className={calStyles.detailValue}>
                {selectedMeeting.capacity} {selectedMeeting.capacity === 1 ? "seat" : "seats"}{" "}
                (Booked: {selectedMeeting._count?.bookings || 0})
              </span>
            </div>

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>Meeting Join Link:</span>
              <span className={calStyles.detailValue}>
                {selectedMeeting.joinUrl ? (
                  <a
                    href={selectedMeeting.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--accent-primary)",
                      textDecoration: "underline",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    Open Join Link
                    <Icons.ExternalLink />
                  </a>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>Zoom link auto-generated</span>
                )}
              </span>
            </div>

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>Status:</span>
              <span className={calStyles.detailValue}>
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
              </span>
            </div>

            <div className={calStyles.detailRow}>
              <span className={calStyles.detailLabel}>Outlook Sync:</span>
              <span
                className={calStyles.detailValue}
                style={{
                  color: "#16a34a",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  justifyContent: "flex-end",
                }}
              >
                <span className={calStyles.syncDot} />
                Synchronized &amp; clash-protected
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
        description="Please provide a cancellation reason. Attendees will be notified and the Outlook calendar invite will be updated."
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
    </div>
  );
}
