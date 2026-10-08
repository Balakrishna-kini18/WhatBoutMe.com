import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.jsx';

interface SessionRescheduledEmailProps {
  firstName: string;
  sessionTitle: string;
  oldDate: string;
  newDate: string;
  newTime: string;
  dashboardUrl: string;
}

export const SessionRescheduledEmail = ({
  firstName = 'Student',
  sessionTitle = 'Advanced Grammar Workshop',
  oldDate = 'October 10, 2026',
  newDate = 'October 12, 2026',
  newTime = '02:00 PM EST',
  dashboardUrl = 'https://whatboutme.com/dashboard/sessions',
}: SessionRescheduledEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your session ${sessionTitle} has been rescheduled`} heading="Session Rescheduled">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Your upcoming session <strong>{sessionTitle}</strong> originally scheduled for {oldDate} has been rescheduled.
      </Text>
      <Section className="bg-yellow-50 rounded border border-solid border-yellow-200 p-[16px] my-[24px]">
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>New Date:</strong> {newDate}</Text>
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>New Time:</strong> {newTime}</Text>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        If you cannot make the new time, please log in to your dashboard to cancel or reschedule your attendance.
      </Text>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={dashboardUrl}
        >
          Manage My Sessions
        </Button>
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default SessionRescheduledEmail;
