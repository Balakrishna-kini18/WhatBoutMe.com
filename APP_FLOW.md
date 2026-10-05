# WhatBoutMe LMS — App Flow & Navigation Logic

> **Version:** 1.0  
> **Date:** September 29, 2026  
> **Source Documents:** PRD v1.2, ARCHITECTURE v1.1, TRD v1.2, IMPLEMENTATION PLAN

---

## 1. Global Sitemap & Routing (Next.js App Router)

The frontend is split into three distinct Next.js apps within the Turborepo workspace for maximum reusability and SEO performance.

### 1.1 `apps/marketing` (Public Website, No Auth Required)
- `/` (Home)
- `/about` (Roweena's Story)
- `/programs` (List of available programs)
- `/programs/[slug]` (Details, Pricing, Curriculum preview)
- `/contact` (Let's Talk)
- `/login` & `/register`

### 1.2 `apps/lms` (Learner Portal, Auth Required: USER)
- `/portal/onboarding` (Agreement signing barrier)
- `/portal/dashboard` (Main hub, progress overview)
- `/portal/programs/[id]` (The 11 Steps view)
- `/portal/programs/[id]/step/[stepId]` (Lesson content view)
- `/portal/programs/[id]/quiz/[quizId]` (Quiz taking interface)
- `/portal/sessions` (Live Zoom classes)
- `/portal/chat` (1:1 messaging)
- `/portal/profile` (Settings, Invoices, Certificates)

### 1.3 `apps/admin` (Admin Panel, Auth Required: ADMIN / MANAGER)
- `/admin/dashboard` (System metrics, revenue)
- `/admin/users` (Learner management)
- `/admin/batches` (Cohort scheduling, manager assignment)
- `/admin/programs` (Course builder, "Roweena's Studio")
- `/admin/approvals` (Certificate and Oral Assessment grading)

---

## 2. Step-by-Step User Journeys & Logic Loops

### 2.1 The Checkout & Onboarding Loop (Verified against TRD 2.1)
**Goal:** Convert a guest into a fully active learner.
1. **Guest** clicks "Enroll Now" on `/programs/[slug]`.
2. App redirects to `/register` (if no account) -> User creates account.
3. App calls Stripe Checkout. User is redirected to `stripe.com`.
4. User pays. Stripe redirects user to `/portal/onboarding?session_id=...`.
5. **Logic Gate 1:** Next.js Middleware checks `User.status`.
   - If `PENDING_AGREEMENT`, force UI to show the PDF Agreement Canvas.
   - User signs. Backend uploads to R2 and updates state to `ACTIVE`.
6. User clicks "Continue". Middleware redirects to `/portal/dashboard`.

### 2.2 The 11 Steps Progression Loop (Verified against TRD 2.2)
**Goal:** Guide the learner sequentially through the locked curriculum.
1. Learner navigates to `/portal/programs/[id]`.
2. UI renders 11 steps. 
   - **Step 1:** Button is **Blue ("Start Step")**.
   - **Steps 2-11:** Buttons are **Gray ("Locked")** with a padlock icon.
3. Learner clicks Step 1 -> Navigates to `/portal/programs/[id]/step/1`.
4. Learner watches Video 1, Video 2, opens PDF. 
   - *UI Improvement:* As each lesson finishes, a green checkmark appears in the sidebar.
5. Learner clicks "Take Quiz" -> UI opens a full-screen modal (no distractions).
6. Learner submits Quiz. 
   - **Fail Loop:** UI shows "Score: 60%. Pass mark is 75%." Button: "Retake Quiz".
   - **Pass Loop:** UI shows confetti. Button: "Unlock Step 2".
7. Click "Unlock Step 2" -> Navigates back to Program view. Step 2 is now Blue.

### 2.3 The Live Session & Attendance Flow (Verified against TRD 2.4 & PRD)
**Goal:** Join a Zoom class and track attendance without manual entry.
1. **Manager** creates a session in `/admin/batches/[id]/sessions`.
2. Backend syncs with Zoom and Outlook.
3. **Learner** sees a notification bell and a card on `/portal/dashboard`: "Live Session Tomorrow at 6 PM".
4. At 5:55 PM, the "Join Class" button becomes active.
5. Learner clicks -> Opens Zoom app.
6. **Automated Loop:** 10 minutes after class ends, the UI updates the learner's attendance progress bar automatically (driven by the BullMQ background job).

### 2.4 Certificate Approval Flow (Verified against PRD §9.13)
**Goal:** Ensure all 6 requirements are met before allowing admin to issue a certificate.
1. Learner finishes Step 11, Final Exam, and Oral Assessment.
2. Learner UI shows: "Status: Under Review by Admin".
3. **Admin** goes to `/admin/approvals`.
4. **Logic Gate 2:** The Admin UI explicitly lists the 6 criteria for the learner:
   - [x] All 11 steps complete
   - [x] Final Exam > 75%
   - [x] Oral Assessment Passed
   - [x] 75% Live Attendance
   - [x] Closing Call Complete
   - [x] 100% Fees Paid
5. Admin clicks "Approve". 
6. UI shows "Generating..." while BullMQ creates the PDF.
7. Learner receives an email, and the Certificate appears in `/portal/profile`.

---

## 3. UI/UX Edge Cases & Improvements

1. **Attempting to bypass the lock:** If a learner manually types the URL `/portal/programs/1/step/2` while it is locked:
   - *Logic:* The Next.js page fetches `checkUnlockStatus()` from the API.
   - *Action:* The server returns `403`. The UI catches this and renders a beautiful "Access Denied" page with a button "Back to Current Step".
2. **Video Scrubbing Prevention (DRM):** 
   - *Logic:* The Mux Player component must disable the forward progress bar (scrubbing) on the *first watch*. Once a video is marked `viewed = true`, scrubbing is re-enabled for future reviews.
3. **Session Timeout & JWT Expiry:**
   - *Logic:* If the JWT expires while taking a quiz, the frontend interceptor catches the `401 Unauthorized`, silently refreshes the token using the Refresh Token cookie, and resubmits the quiz without the user ever noticing.
4. **Offline Resilience:**
   - *Logic:* If the user loses internet during a video, the UI shows a toast: "Connection lost. Reconnecting...". Mux player pauses automatically.
