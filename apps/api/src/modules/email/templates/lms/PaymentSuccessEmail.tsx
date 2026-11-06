import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface PaymentSuccessEmailProps {
  learnerName?: string;
  courseTitle?: string;
  programTitle?: string;
  amount?: number | string;
  currencySymbol?: string;
  currency?: string;
  invoiceNumber?: string;
  dashboardUrl?: string;
}

function formatAmount(
  amount: number | string = 0,
  currencySymbol?: string,
  currency?: string,
): string {
  if (typeof amount === 'string' && /[^\d.,\s]/.test(amount.trim())) {
    return amount.trim();
  }
  const numeric =
    typeof amount === 'number'
      ? amount
      : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
  const numStr = numeric.toLocaleString('en-US', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  const curr = (currency || '').toUpperCase();
  if (curr === 'AED') return `AED ${numStr}`;
  if (curr === 'INR' || currencySymbol === '₹') return `₹${numStr}`;
  if (currencySymbol) return `${currencySymbol}${numStr}`;
  return `$${numStr}`;
}

export const PaymentSuccessEmail = ({
  learnerName = 'there',
  courseTitle,
  programTitle,
  amount = 0,
  currencySymbol,
  currency,
  invoiceNumber,
  dashboardUrl = `${(process.env.NEXT_PUBLIC_LMS_URL || process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://whatboutme.com').replace(/\/+$/, '')}/dashboard`,
}: PaymentSuccessEmailProps) => {
  const cleanName =
    learnerName &&
    learnerName !== 'there' &&
    learnerName !== 'Student' &&
    learnerName !== 'User' &&
    learnerName !== 'Learner'
      ? learnerName.trim()
      : 'there';

  const courseName = courseTitle || programTitle || 'Your Course';
  const formattedAmount = formatAmount(amount, currencySymbol, currency);

  return (
    <WhatBoutMeEmailLayout previewText={`Payment Receipt: ${courseName}`}>
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
          lineHeight: '22px',
          color: '#4b5563',
          margin: '0 0 20px 0',
        }}
      >
        Thank you for your payment. Your enrollment in{' '}
        <strong>{courseName}</strong> has been confirmed.
      </Text>

      {/* Clean Minimal Receipt Card */}
      <Section
        style={{
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '16px 20px',
          margin: '0 0 24px 0',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
            lineHeight: '24px',
            color: '#374151',
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280', width: '40%' }}>
                Course:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {courseName}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>
                Amount Paid:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {formattedAmount}
              </td>
            </tr>
            {invoiceNumber && (
              <tr>
                <td style={{ padding: '4px 0', color: '#6b7280' }}>
                  Invoice #:
                </td>
                <td
                  style={{
                    padding: '4px 0',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {invoiceNumber}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>
                Status:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#16a34a' }}>
                Paid &bull; Confirmed
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Primary Action Button */}
      <Section
        style={{
          textAlign: 'center',
          margin: '0 0 20px 0',
        }}
      >
        <Button
          href={dashboardUrl}
          style={{
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            textAlign: 'center',
            borderRadius: '8px',
            padding: '14px 28px',
            display: 'inline-block',
          }}
        >
          Go to Dashboard &rarr;
        </Button>
      </Section>

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: '0 0 4px 0',
        }}
      >
        Your invoice and course access are available anytime in your dashboard.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default PaymentSuccessEmail;
