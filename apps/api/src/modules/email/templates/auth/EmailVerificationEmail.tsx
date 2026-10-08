import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface EmailVerificationEmailProps {
  firstName: string;
  verificationUrl: string;
}

export const EmailVerificationEmail = ({
  firstName = 'User',
  verificationUrl = 'https://whatboutme.com/verify-email?token=123',
}: EmailVerificationEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText="Verify your email address" heading="Verify Your Email">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Please verify your email address to complete your registration and secure your WhatBoutMe account.
        This link will expire in 24 hours.
      </Text>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={verificationUrl}
        >
          Verify Email Address
        </Button>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        If you did not create an account using this email, please ignore this message.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default EmailVerificationEmail;
