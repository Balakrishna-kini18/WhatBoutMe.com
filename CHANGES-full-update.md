# Changes on branch `full-update`

Branch `full-update`, commit `cf310e8`, created from the latest `main` on 2 October 2026.
109 files: 47 new, 61 changed, 1 removed.

| App | Folder | Files | Lines added | Lines removed |
| --- | --- | --- | --- | --- |
| Learner portal | `apps/lms` | 45 | 6,998 | 1,158 |
| Admin panel | `apps/admin` | 32 | 2,825 | 241 |
| API | `apps/api` | 29 | 993 | 100 |

The two frontends are the learner portal and the admin panel. The API section is
included because both depend on it.

Status: committed locally, not pushed yet.

---

## 1. Learner portal (`apps/lms`)

### Colour theme
- The whole portal uses the public website's colours: cream background, ink text, gold accents (`app/globals.css`).
- Buttons use the deep gold with white text. Red and green are kept only for status: a class that is live, errors, quiz pass or fail.
- Hard-coded colours on the checkout, lesson, profile and attendance pages were replaced with the theme colours.

### Phone layout (shell)
- **Bottom bar:** five tabs — Home, Explore, My Courses, Chat, Profile. Attached to the bottom edge, not floating. The current tab is marked by one short line under its label (`app/LmsSidebar.tsx`, `app/layout.module.css`).
- **Top bar:** dark bar with the light logo, matching the website. One row: logo left, bell and profile right, all on one centre line. The search field is hidden on phones (`app/LmsMain.tsx`, new file).
- **Home and Explore** leave the portal for the website. Their address is worked out when tapped, so they work from a phone on Wi-Fi (`app/lib/site.ts`, `app/lib/host.ts`, both new).
- **Keyboard:** the page shrinks when the keyboard opens on Android, and the bottom bar hides while a text field has focus, so no empty band sits between the field and the keyboard (`app/layout.tsx`, `app/layout.module.css`).
- The Next.js development badge is turned off; it covered the Home tab (`next.config.js`).

### My Courses — new page (`app/courses/`)
- Overall Progress card with a ring (phones).
- Four tiles: Courses, Completed, Days Present (opens Attendance), Certificates (opens Certificates).
- Each course has a cover picture with a play button, a "You stopped at …" line, and Start / Continue / Review plus All Steps or Certificate buttons. Continue opens the exact step the learner stopped at.
- Pending videos and quizzes are listed under each course.
- Search: `/courses?q=…` filters by course, cohort or pending item. The search field is in the desktop top bar.

### Live Sessions (`app/live/`)
- One card instead of three. The next meeting is highlighted with a "Next" label.
- A meeting that is on now shows a red "Live now" badge and a red "Join Now" button.
- Each meeting is one row: date tile, title and time, Join on the right.

### Attendance — new page (`app/attendance/`)
- Month calendar with a day-details panel and three stats (Days Present, This Month, Current Streak).
- On wide screens the page fills the window height. On phones the stats sit above the calendar.
- Every day cell is the same width and height; long labels are shortened.

### Chat (`app/chat/`)
- Phones: no card, edge to edge, fitted between the top bar and the bottom bar. The conversation list shows first; tapping one opens the thread with a back arrow.
- Rounded message bubbles with the time inside, a floating message field and a black send button, on an illustrated background (`public/brand/chat-bg.svg`, new).
- Conversation details open as a sheet from the bottom on phones, with a profile header, search, meetings and links.
- Scheduled meetings appear in the thread as white rows with a Join button.

### Certificates
- New printable certificate (`app/certificates/Certificate.tsx`, `Certificate.module.css`) and a page for one issued certificate (`app/certificates/[id]/page.tsx`).
- Certificates list page and its styles updated.

### Sign-in
- New hand-off page that receives the session from the website (`app/sso/page.tsx`).
- The portal's login and signup pages now send learners to the website to sign in (`app/login/page.tsx`, `app/signup/page.tsx`).
- `app/AuthProvider.tsx` updated for session renewal and sign-out.

### Other pages changed
- Dashboard (`app/page.tsx`, `app/page.module.css`).
- Profile (`app/profile/page.tsx`, new `profile.module.css`).
- Course steps path (`app/programs/[id]/steps/page.tsx`, new `path.module.css`).
- Lesson page (`app/steps/[stepId]/page.tsx`, `step.module.css`).
- Agreement and checkout pages.

### New files
```
apps/lms/AGENTS.md
apps/lms/CLAUDE.md
apps/lms/app/LmsMain.tsx
apps/lms/app/attendance/page.tsx
apps/lms/app/attendance/attendance.module.css
apps/lms/app/certificates/Certificate.tsx
apps/lms/app/certificates/Certificate.module.css
apps/lms/app/certificates/[id]/page.tsx
apps/lms/app/courses/page.tsx
apps/lms/app/courses/courses.module.css
apps/lms/app/icon.png
apps/lms/app/lib/host.ts
apps/lms/app/lib/site.ts
apps/lms/app/profile/profile.module.css
apps/lms/app/programs/[id]/steps/path.module.css
apps/lms/app/sso/page.tsx
apps/lms/public/brand/chat-bg.svg
apps/lms/public/brand/logo-dark.png
apps/lms/public/brand/logo-light.png
apps/lms/public/brand/roweena.png
apps/lms/public/brand/session.png
```

---

## 2. Admin panel (`apps/admin`)

### New pages
- **Enquiries (CRM)** — `app/leads/page.tsx`. Enquiries from the public website.
- **Meetings** — `app/meetings/page.tsx`.
- **Support Inbox** — `app/messages/page.tsx`. Every learner conversation, with replies sent as the signed-in staff member.
- **Website Content** — `app/website/page.tsx`. Edits the text shown on the public website; anything left blank uses the website's built-in text.
- **Issue Certificates** — `app/certificates/issue/page.tsx`. Issue certificates by hand.
- **Certificate view** — `app/certificates/[id]/page.tsx`. A learner's certificate as the learner sees it, for checking and printing.

### Changed
- **Login** — redesigned (`app/login/page.tsx`, `login.module.css`). The demo-account buttons read their emails and password from environment variables: `NEXT_PUBLIC_DEMO_SUPER_EMAIL`, `NEXT_PUBLIC_DEMO_ADMIN_EMAIL`, `NEXT_PUBLIC_DEMO_MANAGER_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD`. They fill blanks if these are not set.
- Shell, layout and global styles (`app/AdminShell.tsx`, `app/layout.tsx`, `app/layout.module.css`, `app/globals.css`).
- Dashboard (`app/page.tsx`, `app/page.module.css`).
- Batches, session attendance, programs, program step, users and certificates pages.
- `app/AuthProvider.tsx`, `next.config.js`, favicon.

### New files
```
apps/admin/app/certificates/Certificate.tsx
apps/admin/app/certificates/Certificate.module.css
apps/admin/app/certificates/[id]/page.tsx
apps/admin/app/certificates/issue/page.tsx
apps/admin/app/icon.png
apps/admin/app/leads/page.tsx
apps/admin/app/lib/api.ts
apps/admin/app/lib/host.ts
apps/admin/app/meetings/page.tsx
apps/admin/app/messages/page.tsx
apps/admin/app/messages/messages.module.css
apps/admin/app/programs/courseInfo.ts
apps/admin/app/website/page.tsx
apps/admin/public/brand/logo-dark.png
apps/admin/public/brand/logo-light.png
```

---

## 3. API (`apps/api`)

### New
- **Daily attendance** — a `DailyAttendance` table (one row per learner per day) and an `/attendance` controller. A day counts when the learner opens the portal, finishes a course step or joins a live session (`prisma/schema.prisma`, `src/common/daily-attendance.ts`, `src/modules/sessions/attendance.controller.ts`).
- **Website module** (`src/modules/website/`): enquiries (`/leads`), messages (`/messages`), notifications (`/notifications`), editable website content (`/site-content`) and file uploads (`/uploads`).
- **Session cache** — remembers recently checked sign-in sessions for a short while (`src/common/session-cache.ts`).
- **Brochure seed** — adds the flagship course from the Brain Matters brochure (`prisma/seed-brochure.ts`).
- Prisma `relationJoins` preview feature turned on.

### Changed
- Auth: controller, service and JWT strategy.
- Certificates, programs, sessions and users modules.
- `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`, `src/app.service.ts`.

---

## 4. Other
- `.gitignore`: now also ignores `apps/api/storage/` (files the API keeps on disk).
- `package-lock.json` updated.
- Removed: `apps/api-gateway/tsconfig.build.tsbuildinfo`.

---

## Known issues
- **API test file does not type-check.** `apps/api/test/security.e2e-spec.ts` has two type errors because it no longer matches the database schema. The portal and admin type-check cleanly.
- **Keyboard fix not confirmed on a phone.** It was checked in a desktop browser at phone size only.
- **Lesson video.** The player cannot get its playback token from the server (the request fails), so it shows a placeholder video.
- **Course cover.** Every course uses the same picture; courses have no image of their own in the database.
- **Chat background.** It is a redrawn copy of the supplied image, not the original file.

## Not on this branch
The public website (`src/` in the parent folder) is a separate repository. Its changes
from today — the five-tab bottom bar with Chat and the larger phone logo — were pushed
to the `Frontend` branch as commit `6979601`.
