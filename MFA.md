# Two-Factor Authentication (MFA) for BSC Procurement

How MFA works in this system, how we built it, every feature it ships with, and how to
operate it day-to-day.

---

## What it is

Authenticator-app two-factor authentication (TOTP, RFC 6238). After entering a correct
password, users type a **6-digit code** from **Microsoft Authenticator** or
**Google Authenticator** on their phone. Codes rotate every 30 seconds and are generated
on the device: no SMS, no email dependence, works offline.

It is **off by default**. Nothing changes for anyone until an admin turns it on.

---

## Where the controls live

**Users page → 🔐 MFA Settings tab** (admin-only, moved here from the Settings page so
all people-management lives in one place).

| Control | What it does | Default |
|---|---|---|
| **Require two-factor authentication** | Master on/off switch for ALL users. Off = password-only sign-in. Turning it off keeps everyone's enrollment, so re-enabling doesn't force anyone to re-scan. | Off |
| **Remember trusted devices for N days** | After a successful code, that browser isn't asked again for N days. **Any admin can change the number** (e.g. 45 → 30 → 90). Set **0** to require a code at every sign-in. | 45 days |

Both are saved with the tab's **Save** button and take effect on the next sign-in attempt:
no restart, no redeploy.

---

## What users experience

### First sign-in after MFA is enabled (enrollment)
1. Enter email + password as usual
2. A **"Set up two-factor authentication"** screen appears with a **QR code**
3. Phone: open the authenticator app → Add account (➕) → Scan QR code
4. The app starts showing a 6-digit code: type it in → **Verify & Sign In**
5. Done. Enrolled, signed in, and (if "Trust this device" was ticked) not asked again for N days

Can't scan? There's an **"Enter the key manually"** link under the QR with the raw setup key.

### Every sign-in after that
Email + password → 6-digit code from the app → in.
On a **trusted device**, the code step is skipped entirely until the trust expires.

### "Trust this device" checkbox
Shown on both the enrollment and code screens, ticked by default. Unticking it means
that browser asks for a code at the very next sign-in. The trust deliberately survives
logout: that's the whole point of trusting the *device*.

---

## Admin features

| Feature | Where | Notes |
|---|---|---|
| **MFA on badge** | Users tab, status column | Green 🔐 badge appears as each user enrolls |
| **Reset MFA** | Users tab, row actions (only shown for enrolled users) | For lost/replaced phones. Clears the user's enrollment: they re-scan a fresh QR at their next sign-in. **Instantly un-trusts all of that user's devices.** |
| **You can't reset your own MFA** | N/A | Deliberate. Ask another administrator (we have several). Prevents a hijacked session from quietly removing its own second factor. |
| **Trust duration** | MFA Settings tab | Changing the number only affects newly issued trust (existing trusted devices keep their original expiry). |

---

## Emergency: everyone locked out

If MFA ever blocks all logins (all admins lose phones, mass clock issues…), SSH to the
server and run the kill switch (it's committed in the repo, so it's always there):

```bash
cd /opt/bsc-procurement && sh scripts/disable-mfa.sh
```

That forces the master toggle off; the next login attempt is password-only. No restart
needed. Re-enable later from Users → MFA Settings.

---

## How we built it

### Design choices
- **TOTP over email/SMS codes**: strongest practical factor; works offline; no
  dependence on the mail server (which has its own failure modes, see
  `Temp-Password-Auth-Pattern.md`).
- **Global toggle instead of per-user opt-in**: one switch in the UI, instant rollout
  and instant rollback. Stored as plain rows in the `SystemSetting` table
  (`mfa_required`, `mfa_trust_days`), which is exactly what makes the one-line SQL kill
  switch possible.
- **Enrollment inside the login flow**: no separate "security settings" page for users
  to find. The system walks every un-enrolled user through setup at their next sign-in.
- **Admin reset instead of backup codes**: for an internal tool with multiple admins,
  "ask another admin" is simpler and safer than printable backup codes.

### Implementation (no new backend dependencies)
- **TOTP engine**: `lib/auth/totp.ts`, using Node stdlib `crypto` only (HMAC-SHA1,
  base32, CSPRNG secrets). Standard parameters (SHA-1 / 6 digits / 30s) so every
  mainstream authenticator app works. Verification accepts ±30s of clock drift.
- **Database**: two columns on `User`, `totpSecret` (base32, null = not set up) and
  `totpEnabled` (flips true only after the user confirms a real code, so a half-finished
  enrollment can never lock anyone out), plus the `SystemSetting` table. Added by
  Prisma migration `mfa_totp`, applied automatically at container start.
- **Login flow** (`app/(auth)/login/actions.ts` + `lib/auth/mfa.ts`):
  - Password OK + MFA on + enrolled → the server sets a **5-minute "MFA-pending"
    httpOnly cookie**; the client shows the code screen and `mfaVerifyAction`
    exchanges cookie + code for the real session.
  - Password OK + MFA on + *not* enrolled → same pending cookie **plus** a
    provisional secret and `otpauth://` URI; the client renders the QR and the
    first confirmed code completes enrollment.
  - **Security guard**: the pending/trust tokens use a different payload shape
    (`uid`/`purpose`, no `role`), so the session verifier structurally rejects
    them: knowing only the password never yields a working session.
- **Trusted devices**: after a successful code, the server sets a signed **trust
  cookie** valid for the configured days. It embeds a **fingerprint of the user's
  current TOTP secret**, which is why "Reset MFA" kills all trusted devices at
  once: the fingerprint no longer matches. Tampered/expired trust tokens don't
  error; they just fall back to asking for a code.
- **Frontend**: the login form became a 3-stage state machine
  (credentials → code / QR-setup) in `app/(auth)/login/login-form.tsx`, with the
  QR rendered locally by `qrcode.react` (the secret never leaves the system).
  The MFA Settings tab lives in `app/(app)/admin/users/users-admin.tsx`.

### How to verify it
Because we own the TOTP implementation, the test harness computes **real valid codes**
without a phone. Verified end-to-end before shipping:

- enrollment → real session issued ✓
- re-login asks for code only (secret never re-sent) ✓
- wrong code → 401 ✓
- MFA-pending token rejected by the API as an access token ✓
- trusted login skips the code; missing/tampered token falls back to the prompt ✓
- trust days = 0 ignores even valid trust tokens ✓
- admin Reset MFA works; self-reset blocked ✓
- toggle off → password-only restored instantly ✓

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Invalid authenticator code" over and over during setup | Phone or server clock out of sync (codes are time-based) | Phone: Settings → automatic date & time. The ±30s window covers small drift only. |
| User lost their phone | N/A | Another admin: Users → **Reset MFA** on their row |
| "Invalid or expired MFA session, sign in again" | More than 5 minutes passed between password and code | Just sign in again |
| Asked for a code even though device was trusted | Trust expired, browser storage cleared, or user's MFA was reset | Enter a code once: the device is re-trusted |
| Everyone locked out | N/A | `sh /opt/bsc-procurement/scripts/disable-mfa.sh` on the server |
| Want code at every login | N/A | MFA Settings → set trusted days to **0** |

---

## Related docs
- `Temp-Password-Auth-Pattern.md`: the full reusable auth pattern (temp passwords,
  forgot-password, MFA) for porting to other systems
- `scripts/disable-mfa.sh`: the emergency kill switch
