import {
  Body,
  Container,
  Head,
  Html,
  Img,
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
  // Email images MUST be served over public HTTPS so Gmail and other webmail proxies can fetch them.
  // If running in local development (localhost) or unset, fallback to the verified public production asset.
  const marketingBase =
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MARKETING_URL ||
    process.env.SITE_URL;

  const isPublicHttps =
    marketingBase &&
    marketingBase.startsWith('https://') &&
    !marketingBase.includes('localhost') &&
    !marketingBase.includes('127.0.0.1');

  const logoUrl = isPublicHttps
    ? `${marketingBase.replace(/\/+$/, '')}/brand/logo-dark.png`
    : 'https://what-bout-me-com-atyb.vercel.app/brand/logo-dark.png';

  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body
          style={{
            backgroundColor: '#f9fafb',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            margin: 0,
            padding: '40px 16px',
          }}
        >
          <Container
            style={{
              maxWidth: '480px',
              margin: '0 auto',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '32px 28px',
            }}
          >
            {/* Official WhatBoutMe Brand Logo */}
            <Section style={{ textAlign: 'center', marginBottom: '24px' }}>
              <Img
                src={logoUrl}
                alt="whatboutme"
                width="160"
                height="22"
                style={{
                  display: 'inline-block',
                  margin: '0 auto',
                  maxWidth: '160px',
                  height: 'auto',
                }}
              />
            </Section>

            {/* Optional Heading */}
            {heading && (
              <Text
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#111827',
                  margin: '0 0 16px 0',
                  textAlign: 'center',
                }}
              >
                {heading}
              </Text>
            )}

            {/* Content */}
            {children}

            {/* Simple Minimal Footer */}
            <Section
              style={{
                marginTop: '28px',
                borderTop: '1px solid #f3f4f6',
                paddingTop: '16px',
                textAlign: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  margin: 0,
                }}
              >
                &copy; {new Date().getFullYear()} WhatBoutMe. All rights reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default WhatBoutMeEmailLayout;
