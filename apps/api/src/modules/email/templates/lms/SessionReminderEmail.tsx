import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface SessionReminderEmailProps {
  firstName: string;
  sessionTitle: string;
  timeframe: '24 hours' | '1 hour';
  date: string;
  time: string;
  joinUrl: string;
}

const defaultLmsUrl =
  process.env.NEXT_PUBLIC_LMS_URL ||
  'https://learn.whatboutme.com';

export const SessionReminderEmail = ({
  firstName = 'Student',
  sessionTitle = 'Advanced Grammar Workshop',
  timeframe = '24 hours',
  date = 'October 10, 2026',
  time = '10:00 AM EST',
  joinUrl = `${defaultLmsUrl.replace(/\/+$/, '')}/live`,
}: SessionReminderEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Reminder: ${sessionTitle} starts in ${timeframe}`} heading="Upcoming Session Reminder">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        This is a friendly reminder that your session <strong>{sessionTitle}</strong> is starting in exactly <strong>{timeframe}</strong>.
      </Text>
      <Section className="bg-gray-50 rounded border border-solid border-gray-200 p-[16px] my-[24px]">
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>Date:</strong> {date}</Text>
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>Time:</strong> {time}</Text>
      </Section>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={joinUrl}
        >
          {timeframe === '1 hour' ? 'Join Session Now' : 'View Session Details'}
        </Button>
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default SessionReminderEmail;
