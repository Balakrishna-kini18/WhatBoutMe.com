import { Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.jsx';

interface SessionCancelledEmailProps {
  firstName: string;
  sessionTitle: string;
  date: string;
  reason?: string;
}

export const SessionCancelledEmail = ({
  firstName = 'Student',
  sessionTitle = 'Advanced Grammar Workshop',
  date = 'October 10, 2026',
  reason,
}: SessionCancelledEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your session ${sessionTitle} has been cancelled`} heading="Session Cancelled">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        We're writing to let you know that the session <strong>{sessionTitle}</strong> scheduled for <strong>{date}</strong> has been cancelled.
      </Text>
      {reason && (
        <Section className="bg-red-50 rounded border border-solid border-red-200 p-[16px] my-[24px]">
          <Text className="text-red-800 text-[14px] leading-[24px] m-0"><strong>Reason:</strong> {reason}</Text>
        </Section>
      )}
      <Text className="text-black text-[14px] leading-[24px]">
        If you have paid for this session, the credits will be automatically returned to your account. We apologize for any inconvenience this may cause.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default SessionCancelledEmail;
