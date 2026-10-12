import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface PasswordResetEmailProps {
  firstName: string;
  resetUrl: string;
}

export const PasswordResetEmail = ({
  firstName = 'User',
  resetUrl = 'https://whatboutme.com/reset-password?token=123',
}: PasswordResetEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText="Reset your WhatBoutMe password" heading="Reset Your Password">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        We received a request to reset your password for your <strong>WhatBoutMe</strong> account. Click the button below to choose a new password:
      </Text>
      <Section className="text-center mt-[28px] mb-[28px]">
        <Button
          className="bg-black rounded-lg text-white text-[14px] font-semibold no-underline text-center px-[24px] py-[14px]"
          href={resetUrl}
        >
          Reset Password
        </Button>
      </Section>
      <Text className="text-[#666666] text-[13px] leading-[22px]">
        <strong>Note:</strong> This link is valid for <strong>1 hour</strong> and can only be used once for security reasons.
      </Text>
      <Text className="text-[#666666] text-[12px] leading-[20px] mt-[16px]">
        If the button above does not work, copy and paste this link into your web browser:
      </Text>
      <Text className="text-[#0284c7] text-[12px] leading-[18px] break-all">
        <Link href={resetUrl} className="text-[#0284c7] underline">
          {resetUrl}
        </Link>
      </Text>
      <Text className="text-[#666666] text-[13px] leading-[22px] mt-[24px]">
        If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged and your account is secure.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default PasswordResetEmail;

