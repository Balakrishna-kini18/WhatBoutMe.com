/**
 * WhatsApp Helper Utilities for WhatBoutMe Dual-Path Enquiry Routing
 */

export interface WhatsAppEnquiryParams {
  phone?: string;
  name: string;
  email: string;
  userPhone: string;
  message: string;
}

/**
 * Builds a properly formatted, URI-encoded WhatsApp enquiry link.
 * - Strips all non-digit characters (+, -, spaces, parentheses) from the business phone number.
 * - Formats the message cleanly with attendee name, email, phone, and enquiry notes.
 * - Safely encodes special characters (&, #, %, ?, emojis, newlines) via encodeURIComponent.
 */
export function buildWhatsAppEnquiryUrl({
  phone,
  name,
  email,
  userPhone,
  message,
}: WhatsAppEnquiryParams): string {
  // Read target business phone number from parameter or environment variable
  const rawTargetPhone =
    phone?.trim() ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    "971501234567"; // Fallback to Dubai support line

  // Strip all non-numeric characters (+, -, spaces, brackets, etc.)
  const cleanPhone = rawTargetPhone.replace(/\D/g, "");

  // Compose clean, human-readable pre-filled text
  const textPayload = [
    "Hello! I have a General Enquiry.",
    "",
    `Name: ${name.trim()}`,
    `Email: ${email.trim()}`,
    `Phone: ${userPhone.trim()}`,
    `Enquiry: ${message.trim()}`,
  ].join("\n");

  const encodedText = encodeURIComponent(textPayload);

  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Safely triggers a WhatsApp redirect with Mobile Safari popup-blocker mitigation.
 * If a synchronous blank window was pre-opened on click, redirects that window.
 * Otherwise, uses window.location.assign.
 */
export function openWhatsAppSafely(
  waUrl: string,
  preOpenedWindow?: Window | null,
): boolean {
  if (preOpenedWindow && !preOpenedWindow.closed) {
    try {
      preOpenedWindow.location.href = waUrl;
      return true;
    } catch {
      // If cross-origin or security policy blocked assigning, fallback
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.location.assign(waUrl);
      return true;
    } catch {
      window.location.href = waUrl;
      return true;
    }
  }

  return false;
}
