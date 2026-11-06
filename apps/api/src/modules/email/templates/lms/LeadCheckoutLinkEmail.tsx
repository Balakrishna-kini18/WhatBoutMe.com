import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface LeadCheckoutLinkEmailProps {
  learnerName?: string;
  name?: string;
  courseTitle?: string;
  programTitle?: string;
  batchName?: string;
  amount?: number | string;
  currency?: 'USD' | 'AED' | 'INR' | string;
  currencySymbol?: string;
  checkoutUrl?: string;
  expiresHours?: number;
}

function formatAmount(
  amount?: number | string,
  currencySymbol?: string,
  currency?: string,
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num === undefined || isNaN(num as number)) return '—';

  const sym =
    currencySymbol ||
    (currency === 'INR'
      ? '₹'
      : currency === 'AED'
        ? 'AED '
        : '$');

  return `${sym}${num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export const LeadCheckoutLinkEmail = ({
  learnerName,
  name,
  courseTitle,
  programTitle,
  batchName = 'Upcoming Batch',
  amount = 0,
  currency = 'USD',
  currencySymbol,
  checkoutUrl = `${(process.env.NEXT_PUBLIC_LMS_URL || process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://learn.whatboutme.com').replace(/\/+$/, '')}/checkout`,
}: LeadCheckoutLinkEmailProps) => {
  const rawName = learnerName || name || 'there';
  const cleanName =
    rawName &&
    rawName !== 'there' &&
    rawName !== 'Student' &&
    rawName !== 'User' &&
    rawName !== 'Learner'
      ? rawName.trim()
      : 'there';

  const courseName = courseTitle || programTitle || 'Your Course';
  const formattedAmount = formatAmount(amount, currencySymbol, currency);

  return (
    <WhatBoutMeEmailLayout
      previewText={`Your enrollment for ${courseName} is ready - WhatBoutMe`}
    >
      <Text
        style={{
          fontSize: '15px',
          color: '#1f2937',
          margin: '0 0 12px 0',
        }}
      >
        Hi {cleanName},
      </Text>

      <Text
        style={{
          fontSize: '15px',
          lineHeight: '24px',
          color: '#374151',
          margin: '0 0 20px 0',
        }}
      >
        Your seat for <strong>{courseName}</strong> has been reserved. Please review your enrollment details below and complete your registration to secure your placement.
      </Text>

      {/* High-Contrast Enrollment Card */}
      <Section
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px 24px',
          margin: '0 0 24px 0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <Text
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#b45309',
            margin: '0 0 10px 0',
          }}
        >
          Enrollment Summary
        </Text>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  width: '38%',
                }}
              >
                Course:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {courseName}
              </td>
            </tr>

            {batchName && (
              <tr>
                <td
                  style={{
                    padding: '8px 0',
                    fontSize: '14px',
                    color: '#6b7280',
                  }}
                >
                  Batch:
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {batchName}
                </td>
              </tr>
            )}

            <tr>
              <td
                style={{
                  padding: '12px 0 4px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  borderTop: '1px solid #f3f4f6',
                }}
              >
                Tuition Fee:
              </td>
              <td
                style={{
                  padding: '12px 0 4px 0',
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#111827',
                  borderTop: '1px solid #f3f4f6',
                }}
              >
                {formattedAmount}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Primary CTA Button */}
      <Section style={{ textAlign: 'center', margin: '28px 0' }}>
        <Button
          href={checkoutUrl}
          style={{
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
            padding: '13px 32px',
            borderRadius: '8px',
            display: 'inline-block',
          }}
        >
          Review & Complete Enrolment &rarr;
        </Button>
      </Section>

      {/* Fallback Direct Link */}
      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#6b7280',
          textAlign: 'center',
          margin: '0 0 16px 0',
        }}
      >
        Or copy and paste this secure link into your browser:
        <br />
        <Link
          href={checkoutUrl}
          style={{
            color: '#2563eb',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
        >
          {checkoutUrl}
        </Link>
      </Text>

      <Text
        style={{
          fontSize: '13px',
          lineHeight: '20px',
          color: '#6b7280',
          margin: '20px 0 0 0',
        }}
      >
        If you have any questions regarding your schedule, curriculum, or payment, simply reply directly to this email.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default LeadCheckoutLinkEmail;

