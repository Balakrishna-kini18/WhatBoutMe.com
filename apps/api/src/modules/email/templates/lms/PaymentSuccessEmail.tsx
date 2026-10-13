import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface PaymentSuccessEmailProps {
  learnerName: string;
  programTitle: string;
  amount: number | string;
  invoiceNumber?: string;
  dashboardUrl?: string;
}

export const PaymentSuccessEmail = ({
  learnerName = 'Student',
  programTitle = 'Course Program',
  amount = 0,
  invoiceNumber,
  dashboardUrl = 'https://whatboutme.com/dashboard',
}: PaymentSuccessEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Payment Receipt: ${programTitle}`} heading="Payment Successful!">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {learnerName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Thank you for your payment. Your transaction for <strong>{programTitle}</strong> has been successfully processed.
      </Text>
      <Section className="bg-gray-50 rounded border border-solid border-gray-200 p-[16px] my-[24px]">
        <Text className="text-black text-[14px] leading-[24px] m-0 font-semibold">Payment Summary:</Text>
        <ul className="text-black text-[14px] leading-[24px] pl-[20px] m-0 mt-[8px]">
          <li><strong>Program:</strong> {programTitle}</li>
          <li><strong>Amount Paid:</strong> ${amount}</li>
          {invoiceNumber && <li><strong>Invoice #:</strong> {invoiceNumber}</li>}
          <li><strong>Status:</strong> Completed</li>
        </ul>
      </Section>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={dashboardUrl}
        >
          Access Your Program
        </Button>
      </Section>
      <Text className="text-black text-[14px] leading-[24px]">
        If you have any questions about this charge, please reply directly to this email.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default PaymentSuccessEmail;
