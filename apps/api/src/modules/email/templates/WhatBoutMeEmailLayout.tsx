import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface WhatBoutMeEmailLayoutProps {
  previewText: string;
  heading?: string;
  children: React.ReactNode;
}

export const WhatBoutMeEmailLayout = ({
  previewText,
  heading,
  children,
}: WhatBoutMeEmailLayoutProps) => {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 my-auto mx-auto font-sans">
          <Container className="mx-auto my-[40px] max-w-[600px] bg-white border border-solid border-[#eaeaea] rounded-lg shadow-sm p-[20px]">
            {/* Header / Logo Area */}
            <Section className="mt-[16px] mb-[32px] text-center">
              {/* Replace with actual logo URL in production */}
              <Text className="text-3xl font-bold text-black m-0 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                WhatBoutMe
              </Text>
            </Section>
            
            {/* Main Content Area */}
            {heading && (
              <Heading className="text-black text-[24px] font-bold text-center p-0 my-[16px] mx-0">
                {heading}
              </Heading>
            )}

            <Section className="px-[16px]">
              {children}
            </Section>

            {/* Footer Area */}
            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
            
            <Section className="text-center px-[20px]">
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This email was sent by WhatBoutMe. You are receiving this because you are enrolled in our programs or registered on our platform.
              </Text>
              <Text className="text-[#666666] text-[12px] leading-[24px] mt-0">
                © {new Date().getFullYear()} WhatBoutMe, Inc. All Rights Reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default WhatBoutMeEmailLayout;
