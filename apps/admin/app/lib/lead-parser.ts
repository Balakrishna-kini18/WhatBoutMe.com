export interface ParsedLeadMessage {
  originalMessage: string;
  courseInquiry?: { title: string; id?: string };
  discovery?: { scheduledAt?: string; zoomUrl?: string; hostUrl?: string };
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
  const discMatch = text.match(/📅\s*Discovery Call (?:Scheduled|Requested):\s*([^|\n]+)(?:\|\s*Zoom:\s*(\S+))?(?:\s*\|\s*Host:\s*(\S+))?/i);
  if (discMatch && discMatch[1]) {
    const rawZoom = discMatch[2] ? discMatch[2].trim() : undefined;
    const rawHost = discMatch[3] ? discMatch[3].trim() : undefined;
    const derivedHost = rawHost || (rawZoom && rawZoom.includes('/zoom.us/j/') ? rawZoom.replace('/zoom.us/j/', '/zoom.us/s/') : rawZoom);
    discovery = {
      scheduledAt: discMatch[1].trim(),
      zoomUrl: rawZoom,
      hostUrl: derivedHost,
    };
    text = text.replace(/📅\s*Discovery Call (?:Scheduled|Requested):[^\n]+(\n|$)/gi, "").trim();
  }

  // 2b. Extract standalone markdown join link e.g. [Join Discovery Call &nearr;](https://us05web.zoom.us/...)
  const joinMatch = text.match(/\[Join Discovery Call[^\]]*\]\((https:\/\/[^\s)]+)\)/i);
  if (joinMatch && joinMatch[1]) {
    const rawZoom = joinMatch[1].trim();
    if (!discovery) discovery = {};
    if (!discovery.zoomUrl) {
      discovery.zoomUrl = rawZoom;
      discovery.hostUrl = rawZoom.includes('/zoom.us/j/') ? rawZoom.replace('/zoom.us/j/', '/zoom.us/s/') : rawZoom;
    }
    text = text.replace(/\[Join Discovery Call[^\]]*\]\([^\)]+\)/gi, "").trim();
  }

  // Clean any residual text like "Join Discovery Call &nearr;" or "Join Discovery Call ↗"
  text = text.replace(/Join Discovery Call\s*(?:&nearr;|↗|\^)?/gi, "").trim();

  // If there is still a raw zoom link in text, extract and strip it from the customer message
  const rawZoomMatch = text.match(/(https:\/\/(?:[a-zA-Z0-9-]+\.)?zoom\.us\/[^\s)]+)/i);
  if (rawZoomMatch && rawZoomMatch[1]) {
    if (!discovery) discovery = {};
    if (!discovery.zoomUrl) {
      discovery.zoomUrl = rawZoomMatch[1].trim();
      discovery.hostUrl = rawZoomMatch[1].includes('/zoom.us/j/') ? rawZoomMatch[1].replace('/zoom.us/j/', '/zoom.us/s/') : rawZoomMatch[1];
    }
    text = text.replace(/(https:\/\/(?:[a-zA-Z0-9-]+\.)?zoom\.us\/[^\s)]+)/gi, "").trim();
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
