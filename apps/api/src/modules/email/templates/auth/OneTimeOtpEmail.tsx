import { Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface OneTimeOtpEmailProps {
  firstName?: string;
  otpCode: string;
}

export const OneTimeOtpEmail = ({
  firstName = 'there',
  otpCode = '123456',
}: OneTimeOtpEmailProps) => {
  const cleanName = firstName && firstName !== 'there' && firstName !== 'Learner'
    ? firstName.trim()
    : 'there';

  return (
    <WhatBoutMeEmailLayout
      previewText={`Your WhatBoutMe code is ${otpCode}`}
    >
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
        Your verification code is:
      </Text>

      {/* Clean & Focused OTP Display */}
      <Section
        style={{
          textAlign: 'center',
          margin: '0 0 24px 0',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#f3f4f6',
            borderRadius: '10px',
            padding: '16px 36px',
            border: '1px solid #e5e7eb',
          }}
        >
          <span
            style={{
              fontFamily:
                "'SF Mono', Menlo, Consolas, Monaco, monospace",
              fontSize: '34px',
              fontWeight: 800,
              letterSpacing: '8px',
              color: '#111827',
              lineHeight: '1',
            }}
          >
            {otpCode}
          </span>
        </div>
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
        This code is valid for <strong>10 minutes</strong>.
      </Text>

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: 0,
        }}
      >
        If you didn't request this code, you can safely ignore this email.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default OneTimeOtpEmail;
