import { Button, Text, Section, Link } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface CertificateIssuedEmailProps {
  firstName?: string;
  courseTitle?: string;
  courseName?: string;
  programTitle?: string;
  programName?: string;
  certificateCode?: string;
  issueDate?: string;
  certificateUrl?: string;
  verificationUrl?: string;
}

export const CertificateIssuedEmail = ({
  firstName = 'there',
  courseTitle,
  courseName,
  programTitle,
  programName,
  certificateCode,
  issueDate,
  certificateUrl = `${(process.env.NEXT_PUBLIC_LMS_URL || 'https://learn.whatboutme.com').replace(/\/+$/, '')}/certificates`,
  verificationUrl,
}: CertificateIssuedEmailProps) => {
  const cleanName =
    firstName &&
    firstName !== 'there' &&
    firstName !== 'Student' &&
    firstName !== 'User' &&
    firstName !== 'Learner'
      ? firstName.trim()
      : 'there';

  const course =
    courseTitle || courseName || programTitle || programName || 'Your Course';
  const formattedIssueDate =
    issueDate ||
    new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <WhatBoutMeEmailLayout previewText={`Certificate Issued: ${course}`}>
      <Text
        style={{
          fontSize: '15px',
          color: '#1f2937',
          margin: '0 0 12px 0',
        }}
      >
        Congratulations, {cleanName}!
      </Text>

      <Text
        style={{
          fontSize: '15px',
          lineHeight: '22px',
          color: '#4b5563',
          margin: '0 0 20px 0',
        }}
      >
        You have successfully completed <strong>{course}</strong>. Your official
        certificate of completion has been issued and is ready for download.
      </Text>

      {/* Clean Minimal Certificate Details Card */}
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
              <td style={{ padding: '4px 0', color: '#6b7280', width: '35%' }}>
                Course:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {course}
              </td>
            </tr>
            {certificateCode && (
              <tr>
                <td style={{ padding: '4px 0', color: '#6b7280' }}>
                  Certificate ID:
                </td>
                <td
                  style={{
                    padding: '4px 0',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {certificateCode}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>
                Issue Date:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#111827' }}>
                {formattedIssueDate}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>
                Status:
              </td>
              <td style={{ padding: '4px 0', fontWeight: 600, color: '#16a34a' }}>
                Verified &bull; Issued
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
          href={certificateUrl}
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
          View & Download Certificate &rarr;
        </Button>
      </Section>

      {/* Public Verification Link */}
      {verificationUrl && (
        <Text
          style={{
            fontSize: '12px',
            lineHeight: '18px',
            color: '#6b7280',
            textAlign: 'center',
            margin: '0 0 8px 0',
          }}
        >
          Employers and institutions can publicly verify your certificate authenticity at:{' '}
          <Link
            href={verificationUrl}
            style={{
              color: '#2563eb',
              textDecoration: 'underline',
              wordBreak: 'break-all',
            }}
          >
            {verificationUrl}
          </Link>
        </Text>
      )}

      <Text
        style={{
          fontSize: '12px',
          lineHeight: '18px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: 0,
        }}
      >
        Your certificate is permanently archived and accessible from your learner portal.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default CertificateIssuedEmail;
