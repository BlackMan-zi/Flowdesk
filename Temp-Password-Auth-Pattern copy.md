# Temporary Password Auth Pattern

A self-contained pattern for admin-managed user accounts where:

- An admin creates/resets a user and gets a **one-time readable password shown once in the UI** to share out-of-band (Slack, WhatsApp, in person); email is best-effort, never required
- A **self-service "Forgot password"** flow emails the user a one-time sign-in code
- The user is **forced to change** the temporary password/code on first login
- A mail outage can **never lock anyone out**

**Battle-tested** in the BSC Inventory system (FastAPI + SQLAlchemy + React + Microsoft 365 SMTP). Two reference implementations below: Python/FastAPI (as shipped) and Next.js/Prisma.

---

## The three flows

```
1) ADMIN CREATES USER                    2) ADMIN RESETS PASSWORD
   ├─ generate readable code "ABX3RKMQ7P"   ├─ same generation
   ├─ store ONLY the bcrypt hash            ├─ store ONLY the bcrypt hash
   ├─ must_change_password = true           ├─ must_change_password = true
   ├─ TRY to email (best-effort)            ├─ TRY to email (best-effort)
   └─ RETURN plain code to admin UI ──────  └─ RETURN plain code to admin UI
        shown ONCE in a callout w/ copy button; never stored

3) SELF-SERVICE FORGOT PASSWORD (public endpoint, no auth)
   ├─ user enters email on /forgot-password
   ├─ if account doesn't exist → SAME generic 200 (no enumeration)
   ├─ generate readable code
   ├─ EMAIL FIRST: if the email fails, STOP. Password unchanged. No lockout.
   ├─ only after send succeeds: hash code → password, must_change = true
   └─ generic 200: "If an account exists for that email, a code has been sent."

THEN (all three converge):
   user logs in with code → must_change_password=true in login response
   → client redirects to /change-password → user sets own strong password
   → must_change_password = false → normal session
```

---

## Core rules (what makes this safe)

| Rule | Why |
|---|---|
| Plain code never persisted (bcrypt hash only) | DB leak ≠ credential leak |
| Code shown to admin exactly once, never re-displayable | Limits exposure window |
| Readable alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L) | Shareable by voice/chat without transcription errors |
| Code length ≥ 8 from a 31-char alphabet (~10¹² combos) | Survives online guessing without rate limiting; never use 6-digit numeric as a password |
| Forced password change on first login | Temp code lifetime ends at first use |
| Admin flows: email **best-effort** (never fail the request on SMTP error) | Onboarding works with zero mail infrastructure |
| Forgot-password: email **FIRST**, commit after | Mail outage can't invalidate the user's current password → no lockout |
| Forgot-password: identical generic response for unknown emails | No account enumeration |
| New-password strength validated server-side (length, upper, digit, special) | Client checklist is UX, server is enforcement |

---

## Implementation A: Python / FastAPI / SQLAlchemy / React *(as shipped)*

### Schema: two columns on your user table

```python
class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True)
    email           = Column(String(255), unique=True, nullable=False)
    name            = Column(String(255), nullable=False)
    role            = Column(String(50),  nullable=False)
    is_active       = Column(Boolean, default=True)
    hashed_password = Column(String(255), nullable=False)   # bcrypt only
    must_change_password = Column(Boolean, default=False)   # the whole trick
```

### Password utilities

```python
import secrets
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# Readable alphabet: omits 0/O/1/I/L to avoid visual confusion
_READABLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

def generate_temp_password(length: int = 10) -> str:
    return "".join(secrets.choice(_READABLE_ALPHABET) for _ in range(length))
```

### Response model: the plain code goes back to the admin, once

```python
class TempPasswordResponse(BaseModel):
    id:            int
    name:          str
    email:         str
    role:          str
    temp_password: str    # plain: displayed once in the UI, never stored
    email_sent:    bool   # lets the UI say "also emailed" vs "share it yourself"
    must_change_password: bool = True
```

### Admin create / reset (email best-effort)

```python
@router.post("/", response_model=TempPasswordResponse, status_code=201)
def create_user(body: UserCreate, db=Depends(get_db), admin=Depends(require_admin)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "Email already registered")

    temp = generate_temp_password()
    user = User(name=body.name.strip(), email=body.email.lower().strip(),
                hashed_password=hash_password(temp), role=body.role,
                must_change_password=True)
    db.add(user); db.commit(); db.refresh(user)

    # Best-effort: a dead mail server must never block onboarding
    email_sent = False
    try:
        email_service.send_welcome(user.email, user.name, temp)
        email_sent = True
    except Exception as exc:
        logger.warning("welcome email not sent for %s: %s", user.email, exc)

    return TempPasswordResponse(id=user.id, name=user.name, email=user.email,
                                role=user.role, temp_password=temp, email_sent=email_sent)


@router.post("/{user_id}/reset-password", response_model=TempPasswordResponse)
def reset_password(user_id: int, db=Depends(get_db), admin=Depends(require_admin)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "Use the change-password flow for your own account")

    temp = generate_temp_password()
    user.hashed_password = hash_password(temp)
    user.must_change_password = True
    db.commit()

    email_sent = False
    try:
        email_service.send_password_reset(user.email, user.name, temp, admin.name)
        email_sent = True
    except Exception as exc:
        logger.warning("reset email not sent for %s: %s", user.email, exc)

    return TempPasswordResponse(id=user.id, name=user.name, email=user.email,
                                role=user.role, temp_password=temp, email_sent=email_sent)
```

### Self-service forgot password (public, mount WITHOUT auth dependency)

```python
class ForgotPasswordRequest(BaseModel):
    email: str

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db=Depends(get_db)):
    generic = {"message": "If an account exists for that email, a sign-in code has been sent."}
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not user.is_active:
        return generic                      # identical response → no enumeration

    code = generate_temp_password(8)
    # EMAIL FIRST: only invalidate the current password once the code is delivered,
    # so a mail failure can never lock the user out.
    try:
        email_service.send_forgot_password_code(user.email, user.name, code)
    except Exception as exc:
        logger.error("forgot-password email failed for %s: %s", user.email, exc)
        raise HTTPException(502, "Could not send the reset email right now. "
                                 "Please try again later or contact your administrator.")

    user.hashed_password = hash_password(code)
    user.must_change_password = True
    db.commit()
    return generic
```

### Login + forced change

```python
@router.post("/login")
def login(body: LoginRequest, db=Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is disabled")
    return {
        "access_token": create_access_token({"sub": user.email}),
        "must_change_password": bool(user.must_change_password),   # client redirects on this
        # ... id, name, role
    }

@router.put("/users/{user_id}/password")
def change_password(user_id: int, body: PasswordChange,
                    db=Depends(get_db), current=Depends(get_current_user)):
    if current.id != user_id and current.role != "admin":
        raise HTTPException(403, "You can only change your own password")
    validate_strength(body.new_password)        # 8+, upper, digit, special (server-side)
    user = db.query(User).get(user_id)
    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    return {"message": "Password updated"}
```

### React: login redirect

```jsx
const res = await authAPI.login({ email, password });
login(res.data);   // store token + user
navigate(res.data.must_change_password ? '/change-password' : '/');
```

### React: one-time temp password modal (admin side)

```jsx
function TempPasswordModal({ info, onClose }) {       // info: {name, email, password, emailSent}
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(info.password)
    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <h3>Temporary password</h3>
        <p>{info.name} · {info.email}</p>
        <div className="warning-box">
          <strong>Share this with the user: this is your only chance to see it.</strong>
          <div className="code-box">
            <span className="mono">{info.password}</span>
            <button onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
        </div>
        <p className="muted">
          {info.emailSent ? '✓ Also emailed to the user.'
                          : 'Email was not sent; share it directly.'}
        </p>
        <button onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
```

### React: forgot-password page (public route, linked from login)

```jsx
const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    await authAPI.forgotPassword({ email });
    setSent(true);   // show: "If an account exists, we've emailed a one-time code.
                     //        Use it on the login page; you'll set a new password after."
  } catch (err) {
    setError(err.response?.data?.detail || 'Something went wrong.');
  }
};
```

---

## Email delivery via Microsoft 365: real-world gotchas

These cost us hours; check them in order when email "mysteriously" fails.

### 1. `535 5.7.139 ... SmtpClientAuthentication is disabled for the Tenant`

Microsoft disables SMTP basic auth **tenant-wide by default**. Your code and password can be perfect, yet every `smtp.login()` fails until an admin enables it **per-mailbox** (per-mailbox overrides the tenant setting):

- **Admin center:** admin.microsoft.com → Users → Active users → *the sending mailbox* → **Mail** tab → **Manage email apps** → tick **Authenticated SMTP** → Save
- **PowerShell:** `Set-CASMailbox -Identity sender@yourdomain -SmtpClientAuthenticationDisabled $false`
- Propagation takes minutes (occasionally up to an hour)

### 2. Entra **Security Defaults** override everything

If Security Defaults are **Enabled** (entra.microsoft.com → Identity → Overview → Properties → Manage security defaults), legacy auth (including SMTP AUTH) is blocked for the whole tenant *regardless of the mailbox setting*. Options: disable Security Defaults (a real security trade-off: it replaces baseline MFA), use Conditional Access exceptions (needs Entra P1), or switch to the Graph API sender.

### 3. `535 ... user credentials were incorrect` (after fixing #1)

Good news: this error means SMTP AUTH is now reachable and Microsoft is actually checking the password. Fix the stored password. If the mailbox has **MFA**, the normal password will never work over SMTP, so generate an **App Password** for it and use that.

### 4. Diagnostic one-liner (auth check, sends nothing)

```python
import smtplib
s = smtplib.SMTP("smtp.office365.com", 587, timeout=20)
s.ehlo(); s.starttls(); s.login(SMTP_USER, SMTP_PASSWORD)
print("SMTP LOGIN: OK"); s.quit()
```

### 5. Sender skeleton

```python
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def send(to: str, subject: str, html: str) -> None:
    if not SMTP_USER or not SMTP_PASSWORD:
        return                                    # email disabled: fine for admin flows
    msg = MIMEMultipart("alternative")
    msg["Subject"], msg["From"], msg["To"] = subject, f"{FROM_NAME} <{SMTP_USER}>", to
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP("smtp.office365.com", 587, timeout=15) as s:
        s.ehlo(); s.starttls()
        s.login(SMTP_USER, SMTP_PASSWORD)
        s.sendmail(SMTP_USER, to, msg.as_string())
```

The modern alternative (unaffected by #1/#2): an Entra app registration with `Mail.Send` and the **Microsoft Graph API**, with more setup and no legacy-auth dependence.

---

## Implementation B: Next.js / Prisma (alternate stack)

### Schema

```prisma
model User {
  id                    String   @id @default(cuid())
  email                 String   @unique
  fullName              String
  role                  Role     @default(STANDARD)
  isActive              Boolean  @default(true)
  password              String?            // bcrypt hash only; NULL = cannot log in
  passwordResetRequired Boolean  @default(false)
  lastLoginAt           DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

### Password utilities

```ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
export const hashPassword   = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const verifyPassword = (plain: string, hash?: string | null) =>
  hash ? bcrypt.compare(plain, hash) : Promise.resolve(false);

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateTempPassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));        // CSPRNG, not Math.random
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
```

### Admin actions: return the plain code once

```ts
export async function createUserAction(formData: FormData) {
  const tempPassword = generateTempPassword();
  await db.user.create({ data: {
    email: (formData.get('email') as string).toLowerCase(),
    fullName: formData.get('fullName') as string,
    role: formData.get('role') as Role,
    password: await hashPassword(tempPassword),
    passwordResetRequired: true,
  }});
  let emailSent = false;
  try { await sendWelcomeEmail(email, tempPassword); emailSent = true } catch {}
  return { ok: true, tempPassword, emailSent };   // shown once in a callout
}

export async function resetPasswordAction(userId: string) {
  const tempPassword = generateTempPassword();
  await db.user.update({ where: { id: userId },
    data: { password: await hashPassword(tempPassword), passwordResetRequired: true } });
  let emailSent = false;
  try { await sendResetEmail(userId, tempPassword); emailSent = true } catch {}
  return { ok: true, tempPassword, emailSent };
}
```

### Forgot-password action (public; email-first, generic result)

```ts
export async function forgotPasswordAction(formData: FormData) {
  const generic = { ok: true, message: 'If an account exists for that email, a sign-in code has been sent.' };
  const email = (formData.get('email') as string).toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return generic;

  const code = generateTempPassword(8);
  try {
    await sendForgotPasswordEmail(user.email, user.fullName, code);   // EMAIL FIRST
  } catch {
    return { ok: false, error: 'Could not send the reset email right now. Try again later.' };
  }
  await db.user.update({ where: { id: user.id },
    data: { password: await hashPassword(code), passwordResetRequired: true } });
  return generic;
}
```

### Login + change-password

```ts
// login: verify → set session → user.passwordResetRequired ? redirect('/change-password') : redirect('/')
// change-password: verify current (the temp code), enforce strength server-side,
//                  store new hash, passwordResetRequired = false
```

Session/cookie middleware (HMAC-signed tokens, Edge verification) is orthogonal to this pattern: any session mechanism works. Key points if rolling your own: `httpOnly` + `sameSite: lax` cookie, HMAC-SHA256 with timing-safe comparison, embedded expiry + role claims.

---

## Environment variables

```env
# Sessions / JWT
SECRET_KEY=<min 32 random bytes>

# Email (Microsoft 365 SMTP): leave SMTP_USER blank to disable email entirely;
# admin flows keep working because the temp password is shown in the UI.
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=sender@yourdomain
SMTP_PASSWORD=<mailbox password, or App Password if the mailbox has MFA>
SMTP_FROM_NAME=Your App Name
```

> Deployment reminder: `.env` changes require a container/process restart to take effect, and remember to update **both** local and server `.env` files.

---

## Checklist for porting to a new system

- [ ] `must_change_password` (or `passwordResetRequired`) boolean on the user model
- [ ] Readable-alphabet CSPRNG generator, length ≥ 8
- [ ] Create/reset endpoints return `{ temp_password, email_sent }`; email wrapped in try/except
- [ ] One-time callout UI with copy button after create/reset
- [ ] Public `/forgot-password`: generic response, email-FIRST-then-commit
- [ ] Login response carries the must-change flag; client redirects to change-password
- [ ] Change-password enforces strength server-side and clears the flag
- [ ] SMTP AUTH enabled for the sending mailbox (M365: per-mailbox setting + Security Defaults check)
- [ ] Verified with the SMTP login one-liner before blaming the code
