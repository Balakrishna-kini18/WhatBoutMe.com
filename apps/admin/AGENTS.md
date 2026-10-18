<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# WhatBoutMe Admin & Studio Portal — Agent Guidelines

> **Authority:** Subordinate to root [`AGENTS.md`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/AGENTS.md). Refer to root `AGENTS.md` for full system architecture, role constraints, and the 14 Active Feature Mandates.

---

## 1. Scope & Technology Rules

- **Framework**: Next.js 16 App Router (`apps/admin/app`).
- **Styling**: Standard CSS Modules (`*.module.css`) matching existing design tokens in `apps/admin/app/globals.css`.
- **Port**: Local dev runs on `http://localhost:3002`.

---

## 2. Mandatory Component Reuse

Before building new dialogs, menus, or selectors, you MUST reuse existing components located in `apps/admin/app/components/`:

- [`Modal`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/Modal.tsx) (`apps/admin/app/components/Modal.tsx`) — Generic responsive dialog container with backdrop and close actions.
- [`ConfirmDialog`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/ConfirmDialog.tsx) (`apps/admin/app/components/ConfirmDialog.tsx`) — Destructive and confirmation action modal with danger callouts.
- [`InputDialog`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/InputDialog.tsx) (`apps/admin/app/components/InputDialog.tsx`) — Single/multi-field input dialogs (e.g. reason for override, coupon code).
- [`CustomSelect`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/CustomSelect.tsx) (`apps/admin/app/components/CustomSelect.tsx`) — Accessible dropdown select with custom search and option rendering.
- [`StatusBadge`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/StatusBadge.tsx) (`apps/admin/app/components/StatusBadge.tsx`) — Standardized status pill with color tones (`success`, `warning`, `danger`, `neutral`, `info`).
- [`Toast`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/Toast.tsx) (`apps/admin/app/components/Toast.tsx`) — Context-based notification popups via `useToast()`.
- [`ActionMenu`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/components/ActionMenu.tsx) (`apps/admin/app/components/ActionMenu.tsx`) — Three-dot dropdown menu for row-level table actions.

---

## 3. API Communication & Caching Guidelines

All data fetching and mutations MUST go through [`apps/admin/app/lib/api.ts`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/lib/api.ts):

- **GET Requests**: Use `apiGet<T>(endpoint, options)`. Automatically utilizes the in-memory LRU SWR cache and deduplicates identical in-flight promises.
- **Mutations**: Use `apiPost<T>`, `apiPatch<T>`, `apiPut<T>`, `apiDelete<T>`. Mutations automatically trigger cache invalidation via `autoInvalidateOnMutation(url)`.
- **JWT Renewal**: Handled transparently by `renewOnce()` on `401 Unauthorized` responses without disrupting the user.

---

## 4. Timezone Handling

- **Rule**: Stored backend timestamps are strictly UTC ISO-8601 strings.
- **Display & Input**: Use [`apps/admin/app/lib/timezone.ts`](file:///c:/Users/lenovo/Desktop/WhatBoutMe.com/apps/admin/app/lib/timezone.ts):
  - `localWallTimeToUtc(dateStr, timeStr, timeZone)` when sending schedule inputs to backend.
  - `utcToWallClock(utcIso, timeZone)` when populating date/time inputs.
  - `formatWhenInTz(start, end, timeZone)` for display strings.

---

## 5. Admin-Specific Mandates

1. **Course Studio (11 Steps)**: Maintain the multi-step builder in `apps/admin/app/programs/[id]/edit/` and `Step7QuizBuilder.tsx`. Support configurable quiz placement (`Before Video` vs. `After Video`) and course-specific FAQs in `Step1CourseSetup.tsx`.
2. **Visual Question Bank**: Support PNG/JPEG media attachments on question prompts and answer option cards, with 3 question types: Single Choice, Multiple Choice, Text Box.
3. **Leads Management**: Support 1-click `Convert & Send Payment Link` in `apps/admin/app/leads/page.tsx`.
4. **Website CMS**: Maintain the photo gallery manager in `apps/admin/app/website/page.tsx` with direct Cloudinary upload via `uploadGalleryImage()`.
5. **Batch Attendance & Reconciliation**: Enforce batch-scoped access for Managers (`batch.managerId === user.id`).
