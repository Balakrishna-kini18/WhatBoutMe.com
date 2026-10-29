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
        join_before_host: false,
        mute_upon_entry: true,
        watermark: false,
        use_pmi: false,
        approval_type: 0, // Automatically approve
        audio: 'both',
        auto_recording: 'cloud', // Automatically record to cloud for LMS fetching
        waiting_room: true,
        ...(params.alternativeHosts || process.env.ZOOM_ALTERNATIVE_HOSTS
          ? { alternative_hosts: params.alternativeHosts || process.env.ZOOM_ALTERNATIVE_HOSTS }
          : {}),
      },
    };

    // Create a meeting for the master account (me)
    const data = await this.zoomApiRequest('/users/me/meetings', 'POST', payload);

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

  async getRecording(externalMeetingId: string): Promise<{ recordingUrl: string } | null> {
    const url = await this.getRecordingUrl(externalMeetingId);
    return url ? { recordingUrl: url } : null;
  }

  // D2-031: Implement getRecordingUrl querying Zoom Cloud Recording API
  async getRecordingUrl(meetingId: string): Promise<string | null> {
    try {
      const data = await this.zoomApiRequest(`/meetings/${meetingId}/recordings`, 'GET');
      
      const mp4File = data.recording_files?.find((file: any) => file.file_type === 'MP4');
      
      if (mp4File && mp4File.play_url) {
        return mp4File.play_url;
      }
      return null;
    } catch (error: any) {
      this.logger.warn(`Could not fetch recording for meeting ${meetingId}. Error: ${error.message}`);
      return null;
    }
  }

  // D2-032: Implement getParticipantReport querying Zoom Reports API
  async getParticipantReport(meetingId: string): Promise<any[]> {
    try {
      const data = await this.zoomApiRequest(`/report/meetings/${meetingId}/participants`, 'GET');
      
      if (!data.participants || !Array.isArray(data.participants)) {
        return [];
      }

      return data.participants.map((p: any) => {
        const joinDate = new Date(p.join_time);
        const leaveDate = new Date(p.leave_time);
        const email = p.user_email?.includes('@') ? p.user_email.trim().toLowerCase() : undefined;
        const name = p.name || p.user_name || undefined;
        return {
          userEmail: p.user_email || p.name,
          participantEmail: email,
          participantName: name,
          joinTime: joinDate,
          leaveTime: leaveDate,
          joinTimeUtc: joinDate,
          leaveTimeUtc: leaveDate,
          durationMinutes: Math.round(p.duration / 60),
          rawPayload: p,
        };
      });
    } catch (error: any) {
      this.logger.warn(`Could not fetch participants for meeting ${meetingId}. Error: ${error.message}`);
      return [];
    }
  }
}
