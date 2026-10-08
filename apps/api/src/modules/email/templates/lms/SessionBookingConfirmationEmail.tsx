import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface SessionBookingConfirmationEmailProps {
  firstName: string;
  sessionTitle: string;
  date: string;
  time: string;
  instructorName: string;
  joinUrl: string;
}

export const SessionBookingConfirmationEmail = ({
  firstName = 'Student',
  sessionTitle = 'Advanced Grammar Workshop',
  date = 'October 10, 2026',
  time = '10:00 AM EST',
  instructorName = 'Jane Doe',
  joinUrl = 'https://whatboutme.com/sessions/123/join',
}: SessionBookingConfirmationEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your booking for ${sessionTitle} is confirmed`} heading="Session Booked">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Your seat for the upcoming live session is confirmed! Here are the details:
      </Text>
      <Section className="bg-gray-50 rounded border border-solid border-gray-200 p-[16px] my-[24px]">
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>Topic:</strong> {sessionTitle}</Text>
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>Instructor:</strong> {instructorName}</Text>
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>Date:</strong> {date}</Text>
        <Text className="text-black text-[14px] leading-[24px] m-0"><strong>Time:</strong> {time}</Text>
      </Section>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={joinUrl}
        >
          Join Live Session
        </Button>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        The join link will activate 10 minutes before the session starts. Please be on time!
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default SessionBookingConfirmationEmail;
