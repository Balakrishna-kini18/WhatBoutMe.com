export interface ParsedLeadMessage {
  originalMessage: string;
  courseInquiry?: { title: string; id?: string };
  discovery?: { scheduledAt?: string; zoomUrl?: string };
  conversion?: {
    enrolmentId: string;
    courseTitle: string;
    checkoutUrl: string;
  };
  isCourseInquiry: boolean;
  isWhatsAppGeneral: boolean;
}

/**
 * Robust parser that cleanly separates customer inquiry text from system metadata tags:
 * - Conversion notices: [Converted to Enrolment: <id> | Course: <title> | Link: <url>]
 * - Discovery bookings: 📅 Discovery Call Scheduled: <iso> | Zoom: <url>
 * - Course inquiries: Course Inquiry: <title> (ID: <id>)
 * - WhatsApp general inquiries: [General Enquiry - WhatsApp]
 */
export function parseLeadMessage(raw: string | null): ParsedLeadMessage {
  if (!raw || !raw.trim()) {
    return {
      originalMessage: "",
      isCourseInquiry: false,
      isWhatsAppGeneral: false,
    };
  }

  let text = raw;

  // 1. Extract conversion notice (if present)
  let conversion: ParsedLeadMessage["conversion"] | undefined;
  const convMatches = Array.from(
    text.matchAll(/\[Converted to Enrolment:\s*([^|]+)\|\s*Course:\s*([^|]+)\|\s*Link:\s*([^\]]+)\]/gi)
  );
  if (convMatches.length > 0) {
    const lastConv = convMatches[convMatches.length - 1];
    if (lastConv && lastConv[1] && lastConv[2] && lastConv[3]) {
      conversion = {
        enrolmentId: lastConv[1].trim(),
        courseTitle: lastConv[2].trim(),
        checkoutUrl: lastConv[3].trim(),
      };
    }
    // Strip all conversion notice blocks from the customer message
    text = text.replace(/\[Converted to Enrolment:[^\]]+\]/gi, "").trim();
  }

  // 2. Extract Discovery Call notice (if present)
  let discovery: ParsedLeadMessage["discovery"] | undefined;
  const discMatch = text.match(/📅\s*Discovery Call Scheduled:\s*([^|\n]+)(?:\|\s*Zoom:\s*(\S*))?/i);
  if (discMatch && discMatch[1]) {
    discovery = {
      scheduledAt: discMatch[1].trim(),
      zoomUrl: discMatch[2] ? discMatch[2].trim() : undefined,
    };
    text = text.replace(/📅\s*Discovery Call Scheduled:[^\n]+(\n|$)/gi, "").trim();
  }

  // 3. Extract Course Inquiry header (if present)
  let courseInquiry: ParsedLeadMessage["courseInquiry"] | undefined;
  const courseMatch = text.match(/Course Inquiry:\s*([^(]+)(?:\(ID:\s*([^)]+)\))?/i);
  if (courseMatch && courseMatch[1]) {
    courseInquiry = {
      title: courseMatch[1].trim(),
      id: courseMatch[2]?.trim(),
    };
    text = text.replace(/Course Inquiry:[^\n]+(\n|$)/gi, "").trim();
  }

  // Also check if text has standalone "Course: <title>" prefix
  if (!courseInquiry) {
    const altCourseMatch = text.match(/(?:^|\n)Course:\s*([^\n]+)/i);
    if (altCourseMatch && altCourseMatch[1]) {
      courseInquiry = { title: altCourseMatch[1].trim() };
      text = text.replace(/(?:^|\n)Course:[^\n]+(\n|$)/gi, "").trim();
    }
  }

  // 4. Extract WhatsApp General Enquiry tag (if present)
  const isWhatsAppGeneral = Boolean(
    text.includes("[General Enquiry - WhatsApp]") ||
    raw.includes("[General Enquiry - WhatsApp]")
  );
  if (isWhatsAppGeneral) {
    text = text.replace(/\[General Enquiry\s*-\s*WhatsApp\]/gi, "").trim();
  }

  const isCourseInquiry = Boolean(
    courseInquiry ||
    conversion ||
    raw.includes("Course Inquiry:") ||
    raw.includes("Course:")
  );

  return {
    originalMessage: text,
    courseInquiry,
    discovery,
    conversion,
    isCourseInquiry,
    isWhatsAppGeneral,
  };
}
