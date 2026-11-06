import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface BroadcastAnnouncementEmailProps {
  firstName?: string;
  title: string;
  message: string;
  link?: string;
  batchName?: string;
}

export const BroadcastAnnouncementEmail = ({
  firstName = 'there',
  title = 'Important Announcement',
  message = '',
  link,
  batchName,
}: BroadcastAnnouncementEmailProps) => {
  const cleanName =
    firstName &&
    firstName !== 'there' &&
    firstName !== 'Student' &&
    firstName !== 'User' &&
    firstName !== 'Learner'
      ? firstName.trim()
      : 'there';

  const paragraphs = message
    ? message
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <WhatBoutMeEmailLayout previewText={`Announcement: ${title}`}>
      <Text
        style={{
          fontSize: '15px',
          color: '#1f2937',
          margin: '0 0 12px 0',
        }}
      >
        Hi {cleanName},
      </Text>

      {/* Clean Announcement Header Card */}
      <Section
        style={{
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '16px 20px',
          margin: '0 0 20px 0',
        }}
      >
        {batchName && (
          <Text
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#6b7280',
              margin: '0 0 4px 0',
            }}
          >
            Batch: {batchName}
          </Text>
        )}
        <Text
          style={{
            fontSize: '17px',
            fontWeight: 700,
            color: '#111827',
            margin: 0,
            lineHeight: '24px',
          }}
        >
          {title}
        </Text>
      </Section>

      {/* Message paragraphs */}
      {paragraphs.map((para, idx) => (
        <Text
          key={idx}
          style={{
            fontSize: '14px',
            lineHeight: '22px',
            color: '#4b5563',
            margin: '0 0 14px 0',
            whiteSpace: 'pre-wrap',
          }}
        >
          {para}
        </Text>
      ))}

      {/* Primary CTA Button */}
      {link && (
        <Section
          style={{
            textAlign: 'center',
            margin: '24px 0 24px 0',
          }}
        >
          <Button
            href={link}
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
            View Details &rarr;
          </Button>
        </Section>
      )}

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: '16px 0 0 0',
        }}
      >
        This announcement was sent to enrolled learners at WhatBoutMe.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default BroadcastAnnouncementEmail;

