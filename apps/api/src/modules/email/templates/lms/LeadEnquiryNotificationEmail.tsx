import { Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface LeadEnquiryNotificationEmailProps {
  name: string;
  email: string;
  phone?: string;
  message?: string;
}

export const LeadEnquiryNotificationEmail = ({
  name = 'Prospective Student',
  email = 'lead@example.com',
  phone,
  message,
}: LeadEnquiryNotificationEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`New Website Lead: ${name}`} heading="New Website Lead / Enquiry">
      <Text className="text-black text-[14px] leading-[24px]">
        A new enquiry was submitted through the WhatBoutMe website:
      </Text>
      <Section className="bg-gray-50 rounded border border-solid border-gray-200 p-[16px] my-[24px]">
        <ul className="text-black text-[14px] leading-[24px] pl-[20px] m-0">
          <li><strong>Name:</strong> {name}</li>
          <li><strong>Email:</strong> {email}</li>
          {phone && <li><strong>Phone:</strong> {phone}</li>}
        </ul>
        {message && (
          <div className="mt-[16px]">
            <Text className="text-black text-[14px] font-semibold m-0">Message:</Text>
            <Text className="text-black text-[14px] leading-[22px] italic mt-[4px]">
              "{message}"
            </Text>
          </div>
        )}
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default LeadEnquiryNotificationEmail;
