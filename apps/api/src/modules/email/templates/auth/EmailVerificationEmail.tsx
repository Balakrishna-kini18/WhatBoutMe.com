import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface EmailVerificationEmailProps {
  firstName?: string;
  verificationUrl?: string;
}

export const EmailVerificationEmail = ({
  firstName = 'there',
  verificationUrl = `${(process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://whatboutme.com').replace(/\/+$/, '')}/verify-email?token=example`,
}: EmailVerificationEmailProps) => {
  const cleanName =
    firstName &&
    firstName !== 'there' &&
    firstName !== 'Student' &&
    firstName !== 'User' &&
    firstName !== 'Learner'
      ? firstName.trim()
      : 'there';

  return (
    <WhatBoutMeEmailLayout previewText="Verify your email address - WhatBoutMe">
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
        Please verify your email address to confirm your account and activate your learner portal access:
      </Text>

      {/* Primary Action Button */}
      <Section
        style={{
          textAlign: 'center',
          margin: '0 0 20px 0',
        }}
      >
        <Button
          href={verificationUrl}
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
          Verify Email Address &rarr;
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
        This link is valid for <strong>24 hours</strong>.
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
        If you didn't create an account with WhatBoutMe, you can safely ignore this email.
      </Text>

      {/* Fallback URL */}
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
        <Link href={verificationUrl} style={{ color: '#6b7280', textDecoration: 'underline' }}>
          {verificationUrl}
        </Link>
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default EmailVerificationEmail;
