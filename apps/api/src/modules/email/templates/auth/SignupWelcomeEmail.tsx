import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface SignupWelcomeEmailProps {
  firstName?: string;
  loginUrl?: string;
}

export const SignupWelcomeEmail = ({
  firstName = 'there',
  loginUrl = `${(process.env.NEXT_PUBLIC_LMS_URL || 'https://learn.whatboutme.com').replace(/\/+$/, '')}/login`,
}: SignupWelcomeEmailProps) => {
  const cleanName =
    firstName &&
    firstName !== 'there' &&
    firstName !== 'Student' &&
    firstName !== 'User' &&
    firstName !== 'Learner'
      ? firstName.trim()
      : 'there';

  return (
    <WhatBoutMeEmailLayout previewText="Welcome to WhatBoutMe">
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
        Welcome to <strong>WhatBoutMe</strong>! Your account has been successfully created.
        You can now access your dashboard, view your enrolled courses, and join live sessions.
      </Text>

      {/* Primary Action Button */}
      <Section
        style={{
          textAlign: 'center',
          margin: '24px 0 24px 0',
        }}
      >
        <Button
          href={loginUrl}
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
          Go to Dashboard &rarr;
        </Button>
      </Section>

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: 0,
        }}
      >
        If you have any questions, simply reply directly to this email. We're here to help!
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default SignupWelcomeEmail;
