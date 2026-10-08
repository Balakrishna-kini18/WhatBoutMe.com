import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.jsx';

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
        Someone recently requested a password change for your WhatBoutMe account. 
        If this was you, you can set a new password here:
      </Text>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={resetUrl}
        >
          Reset Password
        </Button>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        If you don't want to change your password or didn't request this, just ignore and delete this message. 
        Your current password will remain unchanged.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default PasswordResetEmail;
