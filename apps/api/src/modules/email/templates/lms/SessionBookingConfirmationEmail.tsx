import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface SessionBookingConfirmationEmailProps {
  firstName?: string;
  sessionTitle?: string;
  instructorName?: string;
  date?: string;
  time?: string;
  joinUrl?: string;
  directZoomUrl?: string;
  calendarUrl?: string;
}

export const SessionBookingConfirmationEmail = ({
  firstName = 'there',
  sessionTitle = '1-on-1 Coaching Session',
  instructorName = 'Your Trainer',
  date = 'Upcoming',
  time = '10:00 AM GST',
  joinUrl = `${(process.env.NEXT_PUBLIC_LMS_URL || 'https://learn.whatboutme.com').replace(/\/+$/, '')}/live`,
  directZoomUrl,
  calendarUrl,
}: SessionBookingConfirmationEmailProps) => {
  const cleanName =
    firstName &&
    firstName !== 'there' &&
    firstName !== 'Student' &&
    firstName !== 'User' &&
    firstName !== 'Learner'
      ? firstName.trim()
      : 'there';

  return (
    <WhatBoutMeEmailLayout previewText={`Session Confirmed: ${sessionTitle}`}>
      <Text
        style={{
          fontSize: '15px',
          color: '#1f2937',
          margin: '0 0 12px 0',
        }}
      >
        Hi {cleanName},
      </Text>

      <Text
        style={{
          fontSize: '15px',
          lineHeight: '22px',
          color: '#4b5563',
          margin: '0 0 20px 0',
        }}
      >
        Your seat for <strong>{sessionTitle}</strong> has been confirmed. Here are your session details:
      </Text>

      {/* Clean Minimal Session Details Card */}
      <Section
        style={{
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '16px 20px',
          margin: '0 0 24px 0',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
            lineHeight: '24px',
            color: '#374151',
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280', width: '30%' }}>
                Topic:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {sessionTitle}
              </td>
            </tr>
            {instructorName && (
              <tr>
                <td style={{ padding: '4px 0', color: '#6b7280' }}>
                  Instructor:
                </td>
                <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                  {instructorName}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>
                Date:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {date}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>
                Time:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {time}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Primary Action Button */}
      <Section
        style={{
          textAlign: 'center',
          margin: '0 0 16px 0',
        }}
      >
        <Button
          href={joinUrl}
          style={{
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            textAlign: 'center',
            borderRadius: '8px',
            padding: '14px 28px',
            display: 'inline-block',
          }}
        >
          Join Live Classroom &rarr;
        </Button>
      </Section>

      {/* Secondary Actions: Calendar & Direct Zoom */}
      <Section
        style={{
          textAlign: 'center',
          margin: '0 0 20px 0',
        }}
      >
        {calendarUrl && (
          <Button
            href={calendarUrl}
            style={{
              backgroundColor: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
              borderRadius: '6px',
              padding: '8px 16px',
              display: 'inline-block',
              margin: '0 6px 8px 6px',
            }}
          >
            📅 Add to Google Calendar
          </Button>
        )}
      </Section>

      {directZoomUrl && (
        <Text
          style={{
            fontSize: '12px',
            lineHeight: '18px',
            color: '#6b7280',
            textAlign: 'center',
            margin: '0 0 8px 0',
          }}
        >
          Direct Zoom link:{' '}
          <Link
            href={directZoomUrl}
            style={{
              color: '#2563eb',
              textDecoration: 'underline',
              wordBreak: 'break-all',
            }}
          >
            Open in Zoom
          </Link>
        </Text>
      )}

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: 0,
        }}
      >
        The join button will activate 10 minutes prior to session start.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default SessionBookingConfirmationEmail;
