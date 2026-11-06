import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface CorporateSeatInviteEmailProps {
  learnerName?: string;
  name?: string;
  orgName?: string;
  organizationName?: string;
  courseTitle?: string;
  programTitle?: string;
  batchName?: string;
  isNewUser?: boolean;
  setupUrl?: string;
  dashboardUrl?: string;
}

export const CorporateSeatInviteEmail = ({
  learnerName,
  name,
  orgName,
  organizationName,
  courseTitle,
  programTitle,
  batchName = 'Upcoming Batch',
  isNewUser = true,
  setupUrl,
  dashboardUrl,
}: CorporateSeatInviteEmailProps) => {
  const rawName = learnerName || name || 'there';
  const cleanName =
    rawName &&
    rawName !== 'there' &&
    rawName !== 'Student' &&
    rawName !== 'User' &&
    rawName !== 'Learner'
      ? rawName.trim()
      : 'there';

  const company = orgName || organizationName || 'Your Organization';
  const course = courseTitle || programTitle || 'Your Course';

  const defaultBase = (
    process.env.NEXT_PUBLIC_LMS_URL ||
    'https://learn.whatboutme.com'
  ).replace(/\/+$/, '');

  const actionUrl =
    setupUrl ||
    dashboardUrl ||
    `${defaultBase}/login`;

  const buttonLabel = isNewUser
    ? 'Set Up Account & Access Course \u2192'
    : 'Access Your Course Dashboard \u2192';

  return (
    <WhatBoutMeEmailLayout
      previewText={`Your company has sponsored your course: ${course} - WhatBoutMe`}
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
        <strong>{company}</strong> has sponsored your seat in <strong>{course}</strong> on WhatBoutMe.
      </Text>

      {/* Sponsored Seat Summary Card */}
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
            color: '#059669',
            margin: '0 0 10px 0',
          }}
        >
          &#10003; Sponsored Seat Details
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
                Organization:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {company}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: '#6b7280',
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
                {course}
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
                Coverage:
              </td>
              <td
                style={{
                  padding: '12px 0 4px 0',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#059669',
                  borderTop: '1px solid #f3f4f6',
                }}
              >
                100% Employer Sponsored
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Primary Action Button */}
      <Section style={{ textAlign: 'center', margin: '28px 0' }}>
        <Button
          href={actionUrl}
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
          {buttonLabel}
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
        Or copy and paste this link into your browser:
        <br />
        <Link
          href={actionUrl}
          style={{
            color: '#2563eb',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
        >
          {actionUrl}
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
        After signing in, complete your Digital Workshop Agreement to unlock Step 1 and begin your learning path.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default CorporateSeatInviteEmail;

