import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface SessionScheduledEmailProps {
  firstName: string;
  sessionTitle: string;
  batchName?: string;
  programTitle?: string;
  instructorName?: string;
  date: string;
  time: string;
  joinUrl: string;
  lmsLiveUrl?: string;
}

export const SessionScheduledEmail = ({
  firstName = 'Student',
  sessionTitle = 'Live Class',
  batchName = 'Your Cohort',
  programTitle = 'WhatBoutMe Program',
  instructorName = 'Your Trainer',
  date = 'Today',
  time = '10:00 AM',
  joinUrl = 'https://whatboutme.com/live',
  lmsLiveUrl = 'http://localhost:3003/live',
}: SessionScheduledEmailProps) => {
  return (
    <WhatBoutMeEmailLayout
      previewText={`New Live Session Scheduled: ${sessionTitle} for ${batchName}`}
      heading="Live Class Scheduled"
    >
      <Text className="text-black text-[15px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[15px] leading-[24px]">
        A new live session has been scheduled for your enrolled cohort <strong>{batchName}</strong> in <strong>{programTitle}</strong>.
      </Text>
      <Section className="bg-[#fcf8f2] rounded-lg border border-solid border-[#eedac3] p-[20px] my-[24px]">
        <Text className="text-[#2b1810] text-[15px] leading-[26px] m-0">
          <strong>Topic:</strong> {sessionTitle}
        </Text>
        <Text className="text-[#2b1810] text-[15px] leading-[26px] m-0">
          <strong>Cohort:</strong> {batchName}
        </Text>
        <Text className="text-[#2b1810] text-[15px] leading-[26px] m-0">
          <strong>Trainer:</strong> {instructorName}
        </Text>
        <Text className="text-[#2b1810] text-[15px] leading-[26px] m-0">
          <strong>Date:</strong> {date}
        </Text>
        <Text className="text-[#2b1810] text-[15px] leading-[26px] m-0">
          <strong>Time:</strong> {time}
        </Text>
      </Section>
      <Section className="text-center mt-[28px] mb-[28px]">
        <Button
          className="bg-[#da7a5a] rounded-lg text-white text-[15px] font-semibold no-underline text-center px-[28px] py-[14px]"
          href={joinUrl}
        >
          Join Zoom Session
        </Button>
      </Section>
      <Text className="text-[#666666] text-[13px] leading-[22px] text-center">
        You can also access the session directly through your{' '}
        <a href={lmsLiveUrl} className="text-[#da7a5a] underline">
          WhatBoutMe Learner Portal
        </a>{' '}
        under Live Sessions.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default SessionScheduledEmail;
