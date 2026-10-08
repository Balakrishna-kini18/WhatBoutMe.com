export interface CreateMeetingParams {
  topic: string;
  startTime: Date;
  durationMinutes: number;
  timezone?: string;
  referenceId?: string; // e.g. for idempotency checking
}

export interface MeetingDetails {
  id: string; // The external meeting ID (e.g., Zoom meeting ID)
  joinUrl: string; // The URL for participants to join
  startUrl?: string; // The URL for the host to start the meeting
  password?: string;
  hostKey?: string;
}

export interface ParticipantReport {
  userEmail: string;
  joinTime: Date;
  leaveTime: Date;
  durationMinutes: number;
}

export interface IMeetingProvider {
  /**
   * Creates a scheduled meeting on the external platform.
   */
  createMeeting(params: CreateMeetingParams): Promise<MeetingDetails>;

  /**
   * Updates an existing meeting's time or duration.
   */
  updateMeeting(meetingId: string, params: CreateMeetingParams): Promise<void>;

  /**
   * Cancels/Deletes a meeting on the external platform.
   */
  cancelMeeting(meetingId: string): Promise<void>;

  /**
   * Fetches the cloud recording URL for a completed meeting.
   * Returns null if no recording is available.
   */
  getRecordingUrl(meetingId: string): Promise<string | null>;

  /**
   * Fetches the list of participants and their attendance durations.
   */
  getParticipantReport(meetingId: string): Promise<ParticipantReport[]>;
}

export const MEETING_PROVIDER = 'MEETING_PROVIDER';
