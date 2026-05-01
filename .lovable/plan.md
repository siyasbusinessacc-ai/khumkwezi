# Fix: Implement Permanent QR Verification

## The error
> Could not find the function `public.verify_pass(_pass_code)` in the schema cache

The kitchen scanner is trying to call a database function that doesn't exist yet. Nothing in the database or backend has been built for the permanent QR flow — only the conversation plan exists. This change actually builds it.

## What gets built (minimum to make scanning work)

### 1. Database migration
- Add `pass_code text unique` column to `profiles`
- Backfill: every existing student gets a generated 8-char code (no ambiguous chars: no 0/O/1/I/l)
- Trigger on profile insert: auto-generate `pass_code` for new students
- New RPC **`verify_pass(_pass_code text)`** — kitchen/admin only. Returns:
  ```json
  {
    "found": true,
    "user_id": "...", "name": "...", "surname": "...", "student_number": "...",
    "paid": true, "eligible": true, "already_served_today": false,
    "plan_name": "Weekday Lunch", "valid_until": "2026-05-25",
    "reason": null
  }
  ```
  `reason` is one of: `no_subscription`, `expired`, `plan_off_today`, `already_served`, or null when fully eligible.
- New RPC **`serve_meal_by_pass(_pass_code text)`** — kitchen/admin only, atomic verify + insert into `meal_redemptions`. Returns same verdict shape.
- New RPC **`admin_reissue_pass_code(_target_user uuid)`** — admin only, rotates the code.

### 2. Student dashboard
- QR encodes `pass_code` instead of `user_id`
- Adds a status banner above the QR:
  - Green "PAID — Valid until {date}" when subscription is active
  - Amber "Awaiting payment" otherwise

### 3. Kitchen dashboard
- After scan, call `verify_pass(code)` instead of doing client-side table lookups
- Replace the result card with a full-screen verdict:
  - 🟢 GREEN PAID + "Serve meal" button → calls `serve_meal_by_pass`
  - 🔴 RED UNPAID + reason text
  - 🟡 AMBER ALREADY SERVED TODAY
- "Scan next" button to clear and reopen camera
- Manual paste-code fallback kept

### 4. Admin dashboard
- "Reissue QR" action on each user row → calls `admin_reissue_pass_code` with confirmation

## Files touched
- New migration (column + backfill + trigger + 3 RPCs)
- Edited: `src/components/StudentDashboard.tsx` (QR source + paid banner)
- Edited: `src/pages/KitchenDashboard.tsx` (RPC call + verdict screen)
- Edited: `src/pages/AdminDashboard.tsx` (reissue button)

## Out of scope
- iKhokha / payment wiring (separate task)
- Cash → admin manual activation (already works)
- Edge functions (not needed — RLS-protected RPCs are sufficient and simpler)

After this ships you scan a QR and immediately see the verdict — no schema-cache error.
