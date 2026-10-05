import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Initialize Sentry early. This file should be imported at the very top of main.ts / worker.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // @ts-ignore - Some versions of Sentry type definitions miss this property
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  environment: process.env.NODE_ENV || 'development',
  beforeSend(event) {
    // D2-044: Filter sensitive auth data
    if (event.request && event.request.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return event;
  },
});
