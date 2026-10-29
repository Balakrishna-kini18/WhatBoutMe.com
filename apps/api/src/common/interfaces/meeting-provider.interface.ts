export interface CreateMeetingParams {
  topic: string;
  startTime: Date;
  durationMinutes: number;
  timezone?: string;
  referenceId?: string; // e.g. for idempotency checking
  hostEmail?: string;
  alternativeHosts?: string;
}

export interface MeetingDetails {
  id: string; // The external meeting ID (e.g., Zoom meeting ID)
  externalId: string; // Unified external ID
  joinUrl: string; // The URL for participants to join
  startUrl?: string; // The URL for the host to start the meeting
  hostUrl?: string; // Unified host URL alias
  password?: string;
  hostKey?: string;
}

export interface ParticipantReportItem {
  participantEmail?: string;
  participantName?: string;
  joinTimeUtc: Date;
  leaveTimeUtc: Date;
  durationMinutes?: number;
  rawPayload?: any;
}

// Backward-compatible alias
export interface ParticipantReport {
  userEmail: string;
  joinTime: Date;
  leaveTime: Date;
  durationMinutes: number;
}

export interface RecordingMetadata {
  recordingUrl: string;
  durationMinutes?: number;
  fileSize?: number;
  format?: string;
}

export interface IMeetingProvider {
  /**
   * Creates a scheduled meeting on the external platform.
   */
  createMeeting(params: CreateMeetingParams): Promise<MeetingDetails>;

  /**
   * Updates an existing meeting's time or duration.
   */
  updateMeeting?(meetingId: string, params: CreateMeetingParams): Promise<void>;

  /**
   * Cancels/Deletes a meeting on the external platform.
   */
  cancelMeeting?(meetingId: string): Promise<void>;

  /**
   * Fetches the cloud recording metadata for a completed meeting.
   * Returns null if no recording is available.
   */
  getRecording?(externalMeetingId: string): Promise<RecordingMetadata | null>;

  /**
   * Legacy method fetching just recording URL string
   */
  getRecordingUrl?(meetingId: string): Promise<string | null>;

  /**
   * Fetches the list of participants and their attendance durations.
   */
  getParticipantReport(externalMeetingId: string): Promise<ParticipantReportItem[] | any[]>;
}

export const MEETING_PROVIDER = 'MEETING_PROVIDER';
