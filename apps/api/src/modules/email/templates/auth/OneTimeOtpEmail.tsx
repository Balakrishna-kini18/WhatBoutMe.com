import { Text, Section, Container } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.jsx';

interface OneTimeOtpEmailProps {
  firstName: string;
  otpCode: string;
}

export const OneTimeOtpEmail = ({
  firstName = 'User',
  otpCode = '123456',
}: OneTimeOtpEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your WhatBoutMe security code is ${otpCode}`} heading="Your Security Code">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Please use the following One-Time Password (OTP) to securely log in or verify your action.
        This code is valid for 10 minutes.
      </Text>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Container className="bg-gray-100 rounded border border-solid border-gray-200 py-[12px] px-[24px] inline-block">
          <Text className="text-black text-[32px] font-bold tracking-[6px] m-0 text-center">
            {otpCode}
          </Text>
        </Container>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        If you did not request this code, please ignore this email or contact support if you have security concerns.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default OneTimeOtpEmail;
