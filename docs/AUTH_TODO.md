# Auth — Disabled for Open-Source Release

Auth was disabled to remove friction for open-source contributors. The full login/signup flow is intact and can be re-enabled with a single flag.

## To Re-Enable Auth

1. Open `frontend/src/lib/useAuth.ts`
2. Change `export const AUTH_ENABLED = false;` to `true`
3. Done — the full login/signup flow comes back automatically.

## What Was Changed

- **`frontend/src/lib/useAuth.ts`**
  - Added `AUTH_ENABLED = false` flag at the top
  - When disabled, `useAuth()` returns a dummy `Local User` so all auth gates pass
  - `signUp`, `signIn`, `signOut` are no-ops when disabled
  - All original auth logic (localStorage users, password hashing, session management) is fully intact, just bypassed

- **`frontend/src/components/UserMenu.tsx`**
  - Returns `null` when `AUTH_ENABLED` is false (no user menu in header)

## Notes

- The backend has no auth — `allow_origins=["*"]` in `backend/app.py`
- The password hash in `useAuth.ts` is a simple JS hash, not cryptographic (bcrypt/argon2)
- If real auth is needed later, consider server-side auth (FastAPI middleware + JWT) rather than re-enabling the localStorage approach
