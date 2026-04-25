# Daily Paid/Unpaid QR Pass

## What this does
Every student gets a QR code on their dashboard that **changes daily**. When kitchen staff scan it, they instantly see a big **PAID ✓** or **UNPAID ✗** screen with the student's name, plan, and whether they've already eaten today.

This works whether payment came from iKhokha (later), cash (admin activation), or any other method — the system only cares whether their subscription is `active` for today.

## How it works (flow)

```text
Student opens app
    │
    ▼
App requests today's pass token  ──►  Edge function `issue-pass-token`
    │                                     • verifies user logged in
    │                                     • signs { user_id, date } with secret
    │                                     • returns short token
    ▼
QR shows token (rotates daily, expires at midnight SAST)
    │
    ▼
Kitchen scans QR
    │
    ▼
App calls `verify-pass-token`  ──►  Edge function
    │                                 • verifies signature + date == today
    │                                 • looks up active subscription
    │                                 • checks today's weekday is covered
    │                                 • checks not already redeemed today
    │                                 • returns { paid, eligible, name, plan, alreadyServed }
    ▼
Kitchen sees full-screen result:
    🟢 PAID — Serve meal     [Confirm]
    🔴 UNPAID — Refuse
    🟡 ALREADY SERVED TODAY
```

## Changes

### 1. Backend — two edge functions
- **`issue-pass-token`** (auth required): signs `{user_id, yyyy-mm-dd}` using HMAC with a `PASS_TOKEN_SECRET`. Returns base64 token like `eyJ1IjoiYWJjIiwiZCI6IjIwMjYtMDQtMjUifQ.SIG`.
- **`verify-pass-token`** (auth required, kitchen/admin only): validates signature, checks date == today (Africa/Johannesburg), then queries subscription + today's redemption. Returns a clean verdict.

### 2. Database (migration)
- Add `serve_meal_by_token(_token text)` RPC — atomic: verify + insert redemption in one call so kitchen can tap one button.

### 3. Student dashboard
- Replace the static `userId` QR with the daily token (auto-refreshes when day changes).
- Add a clear **PAID badge** above the QR: green "Paid — Active until {date}" or amber "Awaiting payment".
- Add a small "Token refreshes at midnight" hint.

### 4. Kitchen dashboard
- After scan, call `verify-pass-token` instead of doing client-side lookup.
- Show full-screen verdict card: huge ✓ green PAID or ✗ red UNPAID, student name, plan name, days remaining.
- "Serve meal" button calls `serve_meal_by_token` — single atomic action.
- Manual lookup (paste user_id) still works as fallback for offline phones.

### 5. Secret
- Add `PASS_TOKEN_SECRET` (random 32-byte string) — I'll request this when implementing.

## What it does NOT do
- Not a payment QR (no money flows through it). iKhokha integration is still separate.
- Doesn't replace the admin manual cash activation — that flow stays.

## Files touched
- New: `supabase/functions/issue-pass-token/index.ts`
- New: `supabase/functions/verify-pass-token/index.ts`
- New: migration adding `serve_meal_by_token` RPC
- Edited: `src/components/StudentDashboard.tsx` (token-based QR + paid banner)
- Edited: `src/pages/KitchenDashboard.tsx` (verdict screen + token verify)
