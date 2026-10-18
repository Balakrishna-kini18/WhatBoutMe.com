# WhatBoutMe Website Content & Privacy Specification

## 1. Public Privacy Mandate (Strictly Enforced)
- **Company Mobile & Phone Numbers**: Strictly removed from all public web pages, navigation bars, headers, footers, contact cards, and social links.
- **Official Public Contact Email**: `share@whatboutme.com`
- **Official Social Media Profiles**:
  - Instagram: `https://www.instagram.com/whatboutme11/`
  - LinkedIn: `https://www.linkedin.com/in/whatboutme-%F0%9F%92%9B-71991162`
  - YouTube: `https://www.youtube.com/channel/UCVBNr7Okri3BOUMMzxN6cyQ`
- **Location Footprint**: Dubai, UAE & Mangalore, India (serving global online learners).

---

## 2. "Let's Talk" Contact Us Routing Specification
The Contact Us page (`apps/marketing/src/app/contact`) serves as the primary intake gateway for both general visitors and prospective course participants.

### Intake Form Fields:
1. **Full Name** (`name`): Required text (max 120 characters).
2. **Email Address** (`email`): Required RFC-compliant email address.
3. **Phone Number** (`phone`): Required telephone number with country code support.
4. **Inquiry Type Toggle** (`inquiryType`):
   - `'GENERAL'`: General Inquiry (speaking, media, collaborations, coaching questions).
   - `'COURSE'`: High-Intent Course Inquiry (curriculum, certifications, admissions).
5. **Conditional Course Dropdown** (`courseId` / `selectedCourseId`):
   - Revealed only when `inquiryType === 'COURSE'`.
   - Populated dynamically from `GET /api/programs/public`.
   - Strictly required before submission when `inquiryType === 'COURSE'`.
6. **Message Textarea** (`message`): "Tell us about yourself" (max 4000 characters).
7. **Spam & Abuse Protection**:
   - Hidden honeypot field (`honeypot` / `botField`) dropped on non-empty submission.
   - Server-side sliding-window rate limiting per IP address.

---

## 3. Intelligent Backend Routing
- **`inquiryType === 'GENERAL'`**:
  - Creates or links a `User` entity (role: `USER`).
  - Initiates/updates a `Conversation` with staff and appends the message.
  - Surfaces immediately in Admin Support Inbox (`apps/admin/app/messages`).
  - Dispatches email notification to `admin@whatboutme.com`.
- **`inquiryType === 'COURSE'`**:
  - Creates a high-intent sales record in `Lead` entity linked to the selected program.
  - Surfaces immediately in Admin CRM (`apps/admin/app/leads`).
  - Dispatches email notification to `admin@whatboutme.com`.
  - Frontend triggers the **15-Minute Discovery Call Booking flow** with Roweena.
