import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface EnrolmentConfirmedEmailProps {
  firstName: string;
  programName: string;
  batchName: string;
  startDate: string;
  dashboardUrl: string;
}

export const EnrolmentConfirmedEmail = ({
  firstName = 'Student',
  programName = 'Language Mastery',
  batchName = 'Batch A',
  startDate = 'October 15, 2026',
  dashboardUrl = 'https://whatboutme.com/dashboard',
}: EnrolmentConfirmedEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your enrollment in ${programName} is confirmed`} heading="Enrollment Confirmed!">
      <Text className="text-black text-[14px] leading-[24px]">
        Congratulations, {firstName}!
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        You are officially enrolled in the <strong>{programName}</strong> program ({batchName}). 
        Your journey begins on <strong>{startDate}</strong>.
      </Text>
      <Section className="bg-gray-50 rounded border border-solid border-gray-200 p-[16px] my-[24px]">
        <Text className="text-black text-[14px] leading-[24px] m-0 font-semibold">Next Steps:</Text>
        <ul className="text-black text-[14px] leading-[24px] pl-[20px] m-0 mt-[8px]">
          <li>Log in to your dashboard to view the syllabus.</li>
          <li>Sign any required agreements before the start date.</li>
          <li>Join the community chat to meet your peers.</li>
        </ul>
      </Section>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={dashboardUrl}
        >
          Go to My Dashboard
        </Button>
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default EnrolmentConfirmedEmail;
