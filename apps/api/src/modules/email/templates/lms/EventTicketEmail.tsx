import { Button, Text, Section, Link, Img } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

export interface EventTicketEmailProps {
  attendeeName?: string;
  name?: string;
  eventTitle?: string;
  title?: string;
  date?: string;
  time?: string;
  dateFormatted?: string;
  timezone?: string;
  amount?: number | string;
  amountPaid?: string;
  currency?: string;
  bookingReference?: string;
  registrationId?: string;
  isOnline?: boolean;
  meetingLink?: string;
  venueName?: string;
  venueAddress?: string;
  qrCodeUrl?: string;
  checkinData?: string;
}

export const EventTicketEmail = ({
  attendeeName,
  name,
  eventTitle,
  title,
  dateFormatted = 'Upcoming',
  timezone = 'GST',
  amount,
  amountPaid,
  currency = 'USD',
  bookingReference,
  registrationId,
  isOnline = false,
  meetingLink,
  venueName,
  venueAddress,
  qrCodeUrl,
  checkinData,
}: EventTicketEmailProps) => {
  const rawName = attendeeName || name || 'there';
  const cleanName =
    rawName &&
    rawName !== 'there' &&
    rawName !== 'Student' &&
    rawName !== 'User' &&
    rawName !== 'Learner'
      ? rawName.trim()
      : 'there';

  const finalTitle = eventTitle || title || 'WhatBoutMe Event';
  const refCode = bookingReference || registrationId || 'REF-TICKET';

  let finalAmount = amountPaid;
  if (!finalAmount) {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (num && num > 0) {
      const sym = currency === 'INR' ? '₹' : currency === 'AED' ? 'AED ' : '$';
      finalAmount = `${sym}${num.toLocaleString()}`;
    } else {
      finalAmount = 'Free RSVP';
    }
  }

  const qrSrc =
    qrCodeUrl ||
    (checkinData
      ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(checkinData)}`
      : undefined);

  return (
    <WhatBoutMeEmailLayout
      previewText={`Your ticket for ${finalTitle} is confirmed - WhatBoutMe`}
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
        Thank you for registering! Your booking for <strong>{finalTitle}</strong> has been successfully confirmed.
      </Text>

      {/* Ticket Details Card */}
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
          Event Ticket &amp; Registration
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
                Event:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {finalTitle}
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
                Date &amp; Time:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {dateFormatted} {timezone ? `(${timezone})` : ''}
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
                Amount Paid:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {finalAmount}
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
                Ticket Ref:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: '#4b5563',
                }}
              >
                {refCode}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Online Access OR In-Person Venue Block */}
      {isOnline ? (
        <Section
          style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '20px 24px',
            margin: '0 0 24px 0',
          }}
        >
          <Text
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#166534',
              margin: '0 0 8px 0',
            }}
          >
            🟢 Live Online Session Access
          </Text>
          <Text
            style={{
              fontSize: '14px',
              color: '#1e293b',
              margin: '0 0 16px 0',
            }}
          >
            Your private link to join the session:
          </Text>

          {meetingLink && (
            <Section style={{ textAlign: 'center', margin: '16px 0' }}>
              <Button
                href={meetingLink}
                style={{
                  backgroundColor: '#111827',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  padding: '12px 28px',
                  borderRadius: '8px',
                  display: 'inline-block',
                }}
              >
                Join Meeting &rarr;
              </Button>
            </Section>
          )}

          {meetingLink && (
            <Text
              style={{
                fontSize: '12px',
                color: '#64748b',
                margin: '8px 0 0 0',
                wordBreak: 'break-all',
              }}
            >
              Direct Link: <Link href={meetingLink} style={{ color: '#2563eb' }}>{meetingLink}</Link>
            </Text>
          )}
        </Section>
      ) : (
        <Section
          style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px 24px',
            margin: '0 0 24px 0',
          }}
        >
          <Text
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 6px 0',
            }}
          >
            📍 In-Person Venue Information
          </Text>
          {venueName && (
            <Text
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: '#1f2937',
                margin: '0 0 4px 0',
              }}
            >
              {venueName}
            </Text>
          )}
          {venueAddress && (
            <Text
              style={{
                fontSize: '14px',
                color: '#4b5563',
                margin: '0 0 16px 0',
              }}
            >
              {venueAddress}
            </Text>
          )}

          {/* Express Check-In QR Code */}
          {qrSrc && (
            <Section
              style={{
                textAlign: 'center',
                backgroundColor: '#ffffff',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                padding: '16px',
                marginTop: '12px',
              }}
            >
              <Text
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#111827',
                  margin: '0 0 10px 0',
                }}
              >
                🎟️ Express Check-in QR Code
              </Text>
              <Img
                src={qrSrc}
                alt="Check-in QR Code"
                width="160"
                height="160"
                style={{
                  display: 'block',
                  margin: '0 auto',
                  borderRadius: '4px',
                }}
              />
              <Text
                style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  margin: '10px 0 0 0',
                }}
              >
                Show this QR code at the door for express attendance check-in
              </Text>
            </Section>
          )}
        </Section>
      )}

      <Text
        style={{
          fontSize: '13px',
          lineHeight: '20px',
          color: '#6b7280',
          margin: '20px 0 0 0',
        }}
      >
        If you have any questions or require special assistance, simply reply directly to this email.
      </Text>
    </WhatBoutMeEmailLayout>
  );
};

export default EventTicketEmail;

