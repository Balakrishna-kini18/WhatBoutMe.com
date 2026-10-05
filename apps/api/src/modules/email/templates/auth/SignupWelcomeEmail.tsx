import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface SignupWelcomeEmailProps {
  firstName: string;
  loginUrl: string;
}

export const SignupWelcomeEmail = ({
  firstName = 'Student',
  loginUrl = 'https://whatboutme.com/login',
}: SignupWelcomeEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText="Welcome to WhatBoutMe!" heading="Welcome to WhatBoutMe!">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        We are thrilled to have you join WhatBoutMe. Your account has been successfully created.
        You can now access your dashboard, explore programs, and manage your enrollments.
      </Text>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={loginUrl}
        >
          Sign in to your account
        </Button>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        If you have any questions, simply reply to this email. We're here to help!
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Best,
        <br />
        The WhatBoutMe Team
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default SignupWelcomeEmail;
