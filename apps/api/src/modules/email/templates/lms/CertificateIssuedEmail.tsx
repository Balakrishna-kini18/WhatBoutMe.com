import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface CertificateIssuedEmailProps {
  firstName: string;
  programName: string;
  issueDate: string;
  certificateUrl: string;
  verificationUrl: string;
}

export const CertificateIssuedEmail = ({
  firstName = 'Student',
  programName = 'Language Mastery',
  issueDate = 'October 15, 2026',
  certificateUrl = 'https://whatboutme.com/certificates/download/123',
  verificationUrl = 'https://whatboutme.com/verify/cert-123',
}: CertificateIssuedEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your certificate for ${programName} is ready`} heading="Certificate Issued!">
      <Text className="text-black text-[14px] leading-[24px]">
        Congratulations, {firstName}!
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        You have successfully completed the <strong>{programName}</strong> program. 
        Your official digital certificate was issued on {issueDate}.
      </Text>
      <Section className="text-center mt-[32px] mb-[16px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={certificateUrl}
        >
          Download Certificate
        </Button>
      </Section>
      <Section className="text-center mb-[32px]">
        <Text className="text-[#666666] text-[12px] leading-[24px]">
          Employers can verify the authenticity of your certificate here:<br />
          <a href={verificationUrl} className="text-blue-600 no-underline">{verificationUrl}</a>
        </Text>
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default CertificateIssuedEmail;
