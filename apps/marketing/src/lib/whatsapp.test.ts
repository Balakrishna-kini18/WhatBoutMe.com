import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildWhatsAppEnquiryUrl, openWhatsAppSafely } from "./whatsapp";

describe("buildWhatsAppEnquiryUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  afterEach(() => {
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = originalEnv;
  });

  it("strips +, spaces, hyphens, and brackets from the business phone number", () => {
    const url = buildWhatsAppEnquiryUrl({
      phone: "+971 (50) 123-4567",
      name: "Jane Doe",
      email: "jane@example.com",
      userPhone: "+971509998888",
      message: "I would like to inquire about coaching.",
    });

    expect(url.startsWith("https://wa.me/971501234567?text=")).toBe(true);
  });

  it("uses process.env.NEXT_PUBLIC_WHATSAPP_NUMBER when phone is not passed", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "+91 98765-43210";

    const url = buildWhatsAppEnquiryUrl({
      name: "Alex Smith",
      email: "alex@example.com",
      userPhone: "+1234567890",
      message: "Corporate workshop inquiry",
    });

    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
  });

  it("safely URI-encodes special characters (&, #, %, ?, emojis, newlines)", () => {
    const rawMessage = "Does this cover ADHD & Anxiety? #1 question! 100% ready 🚀\nCan we talk?";
    const url = buildWhatsAppEnquiryUrl({
      phone: "971501234567",
      name: "Sam & Partners",
      email: "sam+test@example.com",
      userPhone: "+971 50 111 2222",
      message: rawMessage,
    });

    // Verify it doesn't leave raw unencoded characters that break query strings
    expect(url).not.toContain(" ");
    expect(url).not.toContain("#1");
    expect(url).toContain(encodeURIComponent("Sam & Partners"));
    expect(url).toContain(encodeURIComponent("ADHD & Anxiety? #1 question! 100% ready 🚀"));

    // Verify round-trip decoding
    const queryPart = url.split("?text=")[1]!;
    const decoded = decodeURIComponent(queryPart);
    expect(decoded).toContain("Hello! I have a General Enquiry.");
    expect(decoded).toContain("Name: Sam & Partners");
    expect(decoded).toContain("Email: sam+test@example.com");
    expect(decoded).toContain("Phone: +971 50 111 2222");
    expect(decoded).toContain(`Enquiry: ${rawMessage}`);
  });

  it("trims whitespace from inputs", () => {
    const url = buildWhatsAppEnquiryUrl({
      phone: "  971500000000  ",
      name: "   John Doe   ",
      email: "  john@doe.com  ",
      userPhone: "  +971550000000  ",
      message: "  Hello there!  ",
    });

    const decoded = decodeURIComponent(url.split("?text=")[1]!);
    expect(decoded).toContain("Name: John Doe");
    expect(decoded).toContain("Email: john@doe.com");
    expect(decoded).toContain("Phone: +971550000000");
    expect(decoded).toContain("Enquiry: Hello there!");
  });
});

describe("openWhatsAppSafely", () => {
  it("redirects pre-opened window if valid and open", () => {
    const mockWindow = {
      closed: false,
      location: { href: "" },
    } as unknown as Window;

    const result = openWhatsAppSafely("https://wa.me/12345?text=hi", mockWindow);
    expect(result).toBe(true);
    expect(mockWindow.location.href).toBe("https://wa.me/12345?text=hi");
  });
});
