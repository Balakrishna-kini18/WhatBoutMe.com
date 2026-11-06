import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface PasswordResetEmailProps {
  firstName?: string;
  resetUrl: string;
}

export const PasswordResetEmail = ({
  firstName = 'there',
  resetUrl = `${(process.env.NEXT_PUBLIC_LMS_URL || process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://whatboutme.com').replace(/\/+$/, '')}/reset-password?token=example`,
}: PasswordResetEmailProps) => {
  const cleanName = firstName && firstName !== 'there' && firstName !== 'User' && firstName !== 'Learner'
    ? firstName.trim()
    : 'there';

  return (
    <WhatBoutMeEmailLayout previewText="Reset your WhatBoutMe password">
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
          margin: '0 0 24px 0',
        }}
      >
        We received a request to reset your password. Click the button below to set a new password:
      </Text>

      {/* Centered Action Button */}
      <Section
        style={{
          textAlign: 'center',
          margin: '0 0 24px 0',
        }}
      >
        <Button
          href={resetUrl}
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
          Reset Password &rarr;
        </Button>
      </Section>

      <Text
        style={{
          fontSize: '13px',
          lineHeight: '20px',
          color: '#6b7280',
          textAlign: 'center',
          margin: '0 0 8px 0',
        }}
      >
        This link is valid for <strong>1 hour</strong>.
      </Text>

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: '0 0 16px 0',
        }}
      >
        If you didn't request a password reset, you can safely ignore this email.
      </Text>

      {/* Fallback Link for broken email clients */}
      <Text
        style={{
          fontSize: '11px',
          lineHeight: '16px',
          color: '#9ca3af',
          textAlign: 'center',
          wordBreak: 'break-all',
          margin: 0,
        }}
      >
        Button not working? Copy and paste this link:{' '}
        <Link href={resetUrl} style={{ color: '#ea580c', textDecoration: 'underline' }}>
          {resetUrl}
        </Link>
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default PasswordResetEmail;
