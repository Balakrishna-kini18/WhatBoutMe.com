import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface LeadEnquiryNotificationEmailProps {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  courseTitle?: string;
  message?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

export const LeadEnquiryNotificationEmail = ({
  name = 'there',
  email,
  phone,
  title,
  courseTitle,
  message,
  ctaUrl,
  ctaLabel,
}: LeadEnquiryNotificationEmailProps) => {
  const cleanName =
    name && name !== 'there' && name !== 'Prospective Student' && name !== 'User'
      ? name.trim()
      : 'there';

  const isDiscoveryCall = Boolean(
    message?.toLowerCase().includes('discovery call') ||
      message?.toLowerCase().includes('consultation'),
  );

  // Extract any URL present in the message or ctaUrl
  let actionUrl = ctaUrl;
  if (!actionUrl && message) {
    const urlMatch = message.match(/https?:\/\/[^\s<"']+/i);
    if (urlMatch) {
      actionUrl = urlMatch[0];
    }
  }

  const actionLabel =
    ctaLabel ||
    (actionUrl?.includes('zoom.us')
      ? 'Join Zoom Meeting \u2192'
      : isDiscoveryCall
        ? 'View Discovery Call \u2192'
        : 'View in Portal \u2192');

  const preview =
    title ||
    (isDiscoveryCall
      ? '15-Minute Discovery Call with Roweena Kini'
      : `Enquiry from ${cleanName}`);

  // Split message into paragraphs for clean typography
  const paragraphs = message
    ? message
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <WhatBoutMeEmailLayout previewText={preview}>
      <Text
        style={{
          fontSize: '15px',
          color: '#1f2937',
          margin: '0 0 12px 0',
        }}
      >
        Hi {cleanName},
      </Text>

      {/* Render structured message paragraphs */}
      {paragraphs.map((para, idx) => {
        const isKeyValues = para.includes(':') && para.split('\n').length > 1;

        if (isKeyValues) {
          const lines = para.split('\n').filter(Boolean);
          return (
            <Section
              key={idx}
              style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '16px 20px',
                margin: '16px 0 20px 0',
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
                  {lines.map((line, lIdx) => {
                    const colonIndex = line.indexOf(':');
                    if (colonIndex > 0) {
                      const label = line.slice(0, colonIndex).trim();
                      const value = line.slice(colonIndex + 1).trim();
                      return (
                        <tr key={lIdx}>
                          <td
                            style={{
                              padding: '4px 0',
                              color: '#6b7280',
                              width: '38%',
                              verticalAlign: 'top',
                            }}
                          >
                            {label}:
                          </td>
                          <td
                            style={{
                              padding: '4px 0',
                              fontWeight: 600,
                              color: '#111827',
                              verticalAlign: 'top',
                            }}
                          >
                            {value.startsWith('http') ? (
                              <Link
                                href={value}
                                style={{
                                  color: '#2563eb',
                                  textDecoration: 'underline',
                                  wordBreak: 'break-all',
                                }}
                              >
                                {value}
                              </Link>
                            ) : (
                              value
                            )}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={lIdx}>
                        <td
                          colSpan={2}
                          style={{
                            padding: '4px 0',
                            color: '#374151',
                          }}
                        >
                          {line}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          );
        }

        return (
          <Text
            key={idx}
            style={{
              fontSize: '14px',
              lineHeight: '22px',
              color: '#4b5563',
              margin: '0 0 14px 0',
            }}
          >
            {para}
          </Text>
        );
      })}

      {/* Primary Action Button (e.g. Zoom Join Link) */}
      {actionUrl && (
        <Section
          style={{
            textAlign: 'center',
            margin: '20px 0 24px 0',
          }}
        >
          <Button
            href={actionUrl}
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
            {actionLabel}
          </Button>
        </Section>
      )}

      {/* Details Box if no structured message but fields present */}
      {paragraphs.length === 0 && (email || phone || courseTitle) && (
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
              {courseTitle && (
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7280', width: '30%' }}>
                    Course:
                  </td>
                  <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                    {courseTitle}
                  </td>
                </tr>
              )}
              {email && (
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7280' }}>
                    Email:
                  </td>
                  <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                    {email}
                  </td>
                </tr>
              )}
              {phone && (
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7280' }}>
                    Phone:
                  </td>
                  <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                    {phone}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      )}

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: '12px 0 0 0',
        }}
      >
        WhatBoutMe Healthcare &amp; Clinical Learning &bull; Dubai Silicon Oasis, UAE
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default LeadEnquiryNotificationEmail;
