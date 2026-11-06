import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import {
  CreateMeetingParams,
  IMeetingProvider,
  MeetingDetails,
  ParticipantReport,
} from './interfaces/meeting-provider.interface.js';

@Injectable()
export class ZoomMeetingProvider implements IMeetingProvider {
  private readonly logger = new Logger(ZoomMeetingProvider.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  private get accountId(): string {
    return process.env.ZOOM_ACCOUNT_ID || '';
  }

  private get clientId(): string {
    return process.env.ZOOM_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.ZOOM_CLIENT_SECRET || '';
  }

  // D2-029: Automated in-memory token refresh for S2S OAuth
  private async getAccessToken(): Promise<string> {
    if (!this.accountId || !this.clientId || !this.clientSecret) {
      throw new Error('Zoom credentials are not fully configured in the environment.');
    }

    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    this.logger.debug('Fetching new Zoom S2S Access Token...');
    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${this.accountId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Failed to get Zoom token: ${err}`);
      throw new HttpException('Zoom Authentication Failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    
    // Zoom tokens typically expire in 3599 seconds. We subtract 5 minutes (300s) as a safety buffer.
    const expiresIn = data.expires_in - 300;
    this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    return this.accessToken!;
  }

  // Helper method to make authenticated API requests to Zoom
  private async zoomApiRequest(endpoint: string, method = 'GET', body?: any) {
    const token = await this.getAccessToken();
    const url = `https://api.zoom.us/v2${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Zoom API Error [${method} ${endpoint}]: ${err}`);
      throw new HttpException('Zoom API Error', HttpStatus.BAD_GATEWAY);
    }

    // Return JSON if there is content, else null
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // D2-030: Implement ZoomMeetingProvider adhering to IMeetingProvider
  async createMeeting(params: CreateMeetingParams): Promise<MeetingDetails> {
    this.logger.log(`Creating Zoom meeting for topic: ${params.topic}`);

    if (!this.clientId || !this.clientSecret || !this.accountId) {
      if (process.env.NODE_ENV === 'test') {
        throw new Error('Zoom credentials are not fully configured in the environment.');
      }
      this.logger.warn('Zoom credentials are not configured. Returning deterministic staging Zoom mock URL.');
      const mockId = `staging-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return {
        id: mockId,
        externalId: mockId,
        joinUrl: `https://zoom.us/j/${mockId}?pwd=wbm123`,
        startUrl: `https://zoom.us/s/${mockId}?pwd=wbm123`,
        hostUrl: `https://zoom.us/s/${mockId}?pwd=wbm123`,
        password: 'wbm123',
      };
    }

    if (params.referenceId) {
      try {
        let nextPageToken = '';
        let foundMeeting: any = null;
        
        do {
          const url = `/users/me/meetings?type=scheduled&page_size=300${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`;
          const upcomingMeetings = await this.zoomApiRequest(url, 'GET');
          
          if (upcomingMeetings && upcomingMeetings.meetings) {
            foundMeeting = upcomingMeetings.meetings.find((m: any) => m.agenda === params.referenceId);
            if (foundMeeting) break;
            
            nextPageToken = upcomingMeetings.next_page_token || '';
          } else {
            break;
          }
        } while (nextPageToken);

        if (foundMeeting) {
          this.logger.log(`Found existing Zoom meeting for referenceId ${params.referenceId}. Reconciling.`);
          // Note: `meetings` list doesn't include password/start_url. We need to fetch details.
          const details = await this.zoomApiRequest(`/meetings/${foundMeeting.id}`, 'GET');
          return {
            id: details.id.toString(),
            externalId: details.id.toString(),
            joinUrl: details.join_url,
            startUrl: details.start_url,
            hostUrl: details.start_url,
            password: details.password,
          };
        }
      } catch (error: any) {
        this.logger.warn(`Failed to check existing Zoom meetings during idempotency check: ${error.message}`);
        // We can swallow this warning and proceed to create, or throw. Throwing is safer to avoid duplicates if API is down.
        throw error;
      }
    }

    const payload = {
      topic: params.topic,
      type: 2, // Scheduled meeting
      start_time: params.startTime.toISOString(),
      duration: params.durationMinutes,
      timezone: params.timezone || 'UTC',
      agenda: params.referenceId || undefined,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        mute_upon_entry: true,
        watermark: false,
        use_pmi: false,
        approval_type: 0, // Automatically approve
        audio: 'both',
        auto_recording: 'cloud', // Automatically record to cloud for LMS fetching
        waiting_room: false,
        ...(params.alternativeHosts || process.env.ZOOM_ALTERNATIVE_HOSTS
          ? { alternative_hosts: params.alternativeHosts || process.env.ZOOM_ALTERNATIVE_HOSTS }
          : {}),
      },
    };

    // If hostEmail is provided, try creating under that trainer's Zoom user first (enables simultaneous multi-trainer hosting & trainer host name),
    // and gracefully fall back to the master account (/users/me/meetings) if that trainer email is not a Zoom account member.
    let data: any;
    if (params.hostEmail && params.hostEmail.includes('@')) {
      try {
        data = await this.zoomApiRequest(
          `/users/${encodeURIComponent(params.hostEmail.trim().toLowerCase())}/meetings`,
          'POST',
          payload,
        );
      } catch (hostErr: any) {
        this.logger.warn(
          `Trainer email ${params.hostEmail} is not a registered Zoom host user (${hostErr.message}); falling back to master Zoom account (/users/me/meetings).`,
        );
        data = await this.zoomApiRequest('/users/me/meetings', 'POST', payload);
      }
    } else {
      data = await this.zoomApiRequest('/users/me/meetings', 'POST', payload);
    }

    return {
      id: data.id.toString(),
      externalId: data.id.toString(),
      joinUrl: data.join_url,
      startUrl: data.start_url,
      hostUrl: data.start_url,
      password: data.password,
    };
  }

  async updateMeeting(meetingId: string, params: CreateMeetingParams): Promise<void> {
    this.logger.log(`Updating Zoom meeting ID: ${meetingId}`);

    const payload = {
      topic: params.topic,
      start_time: params.startTime.toISOString(),
      duration: params.durationMinutes,
      timezone: params.timezone || 'UTC',
    };

    await this.zoomApiRequest(`/meetings/${meetingId}`, 'PATCH', payload);
  }

  async cancelMeeting(meetingId: string): Promise<void> {
    this.logger.log(`Cancelling Zoom meeting ID: ${meetingId}`);
    try {
      await this.zoomApiRequest(`/meetings/${meetingId}`, 'DELETE');
    } catch (error: any) {
      if (error?.status === HttpStatus.BAD_GATEWAY && error?.message?.includes('Zoom API Error')) {
         // Keep silent
      }
    }
  }

  async getMeetingStatus(meetingId: string): Promise<string | null> {
    try {
      const data = await this.zoomApiRequest(`/meetings/${encodeURIComponent(meetingId)}`, 'GET');
      return typeof data?.status === 'string' ? data.status.toLowerCase() : null;
    } catch (error: any) {
      this.logger.warn(`Could not fetch status for Zoom meeting ${meetingId}: ${error.message}`);
      return null;
    }
  }

  async getRecording(externalMeetingId: string): Promise<{ recordingUrl: string } | null> {
    const url = await this.getRecordingUrl(externalMeetingId);
    return url ? { recordingUrl: url } : null;
  }

  // D2-031: Implement getRecordingUrl querying Zoom Cloud Recording API
  async getRecordingUrl(meetingId: string): Promise<string | null> {
    try {
      const data = await this.zoomApiRequest(`/meetings/${encodeURIComponent(meetingId)}/recordings`, 'GET');
      
      const mp4File = data.recording_files?.find((file: any) => file.file_type === 'MP4');
      
      if (mp4File && (mp4File.play_url || mp4File.download_url)) {
        return mp4File.play_url || mp4File.download_url;
      }
      if (typeof data?.share_url === 'string' && data.share_url.trim().length > 0) {
        return data.share_url.trim();
      }
      return null;
    } catch (error: any) {
      this.logger.warn(`Could not fetch recording for meeting ${meetingId}. Error: ${error.message}`);
      return null;
    }
  }

  // D2-032: Implement getParticipantReport querying Zoom Reports API with /past_meetings & live /metrics fallback + pagination
  async getParticipantReport(meetingId: string): Promise<any[]> {
    const mapParticipants = (list: any[]) =>
      list.map((p: any) => {
        const joinDate = p.join_time ? new Date(p.join_time) : new Date();
        const leaveDate = p.leave_time
          ? new Date(p.leave_time)
          : typeof p.duration === 'number' && p.duration > 0
            ? new Date(joinDate.getTime() + p.duration * 1000)
            : new Date();
        const email = p.user_email?.includes('@') ? p.user_email.trim().toLowerCase() : undefined;
        const name = p.name || p.user_name || undefined;
        const durationMinutes =
          typeof p.duration === 'number' && p.duration > 0
            ? Math.max(1, Math.round(p.duration / 60))
            : Math.max(0, Math.round((leaveDate.getTime() - joinDate.getTime()) / 60000));
        return {
          userEmail: p.user_email || p.name || p.user_name,
          participantEmail: email,
          participantName: name,
          joinTime: joinDate,
          leaveTime: leaveDate,
          joinTimeUtc: joinDate,
          leaveTimeUtc: leaveDate,
          durationMinutes,
          rawPayload: p,
        };
      });

    const fetchPaginatedParticipants = async (basePath: string): Promise<any[]> => {
      const collected: any[] = [];
      let nextPageToken = '';
      let pages = 0;
      do {
        const sep = basePath.includes('?') ? '&' : '?';
        const url = `${basePath}${sep}page_size=300${nextPageToken ? `&next_page_token=${encodeURIComponent(nextPageToken)}` : ''}`;
        const data = await this.zoomApiRequest(url, 'GET');
        if (Array.isArray(data?.participants) && data.participants.length > 0) {
          collected.push(...data.participants);
        }
        nextPageToken = data?.next_page_token || '';
        pages++;
      } while (nextPageToken && pages < 10);
      return collected;
    };

    try {
      const reportParticipants = await fetchPaginatedParticipants(
        `/report/meetings/${encodeURIComponent(meetingId)}/participants`,
      );
      if (reportParticipants.length > 0) {
        return mapParticipants(reportParticipants);
      }
    } catch (error: any) {
      this.logger.warn(`Zoom /report/meetings/${meetingId}/participants unavailable (${error.message}), trying /past_meetings fallback...`);
    }

    try {
      const fallbackParticipants = await fetchPaginatedParticipants(
        `/past_meetings/${encodeURIComponent(meetingId)}/participants`,
      );
      if (fallbackParticipants.length > 0) {
        return mapParticipants(fallbackParticipants);
      }
    } catch (fallbackErr: any) {
      this.logger.warn(`Could not fetch /past_meetings participants for meeting ${meetingId}: ${fallbackErr.message}`);
    }

    // Fallback 3: If meeting is still live, try live dashboard metrics endpoint if available
    try {
      const liveParticipants = await fetchPaginatedParticipants(
        `/metrics/meetings/${encodeURIComponent(meetingId)}/participants?type=live`,
      );
      if (liveParticipants.length > 0) {
        return mapParticipants(liveParticipants);
      }
    } catch {
      // Silently ignore if metrics scope is not enabled or meeting is not live
    }

    return [];
  }
}
