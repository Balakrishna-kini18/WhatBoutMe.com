import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface AgreementSignedConfirmationEmailProps {
  firstName: string;
  agreementName: string;
  signedDate: string;
  documentUrl: string;
}

export const AgreementSignedConfirmationEmail = ({
  firstName = 'Student',
  agreementName = 'Student Code of Conduct',
  signedDate = 'October 5, 2026',
  documentUrl = 'https://whatboutme.com/api/agreements/123/download',
}: AgreementSignedConfirmationEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText="Copy of your signed agreement" heading="Agreement Signed">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        This is a confirmation that you successfully digitally signed the <strong>{agreementName}</strong> on <strong>{signedDate}</strong>.
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        A copy of your signed document has been securely stored in your account. You can download a PDF copy for your personal records by clicking the button below.
      </Text>
      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={documentUrl}
        >
          Download PDF Copy
        </Button>
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default AgreementSignedConfirmationEmail;
