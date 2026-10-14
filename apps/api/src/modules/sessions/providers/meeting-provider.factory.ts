import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { IMeetingProvider } from '../../../common/interfaces/meeting-provider.interface.js';
import { ZoomMeetingProvider } from '../../zoom/zoom.service.js';
import { GoogleMeetProvider } from './google-meet.provider.js';

@Injectable()
export class MeetingProviderFactory {
  private readonly logger = new Logger(MeetingProviderFactory.name);

  constructor(
    private readonly zoomProvider: ZoomMeetingProvider,
    private readonly googleMeetProvider: GoogleMeetProvider,
  ) {}

  /**
   * Returns the appropriate meeting provider implementation based on session provider or platform config.
   */
  getProvider(providerName?: string): IMeetingProvider {
    const target = (providerName || process.env.DEFAULT_MEETING_PROVIDER || 'ZOOM').toUpperCase();

    switch (target) {
      case 'GOOGLE_MEET':
      case 'GOOGLE':
      case 'MEET':
        if (process.env.ENABLE_GOOGLE_MEET === 'true') {
          return this.googleMeetProvider;
        }
        this.logger.log('Google Meet is kept optional and not actively enabled. Using Zoom provider.');
        return this.zoomProvider;
      case 'ZOOM':
      default:
        return this.zoomProvider;
    }
  }
}
