import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional, List
from config import settings


def _send_email(
    to_email: str,
    subject: str,
    html_body: str,
    attachments: Optional[List[dict]] = None
):
    """Send email via Microsoft Exchange Online (or any SMTP with STARTTLS)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email

    msg.attach(MIMEText(html_body, "html"))

    if attachments:
        for att in attachments:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(att["data"])
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{att["filename"]}"'
            )
            msg_mixed = MIMEMultipart("mixed")
            msg_mixed["Subject"] = msg["Subject"]
            msg_mixed["From"] = msg["From"]
            msg_mixed["To"] = msg["To"]
            msg_mixed.attach(msg)
            msg_mixed.attach(part)
            msg = msg_mixed
            break  # only rebuild once; multiple attachments handled below

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            if settings.SMTP_TLS:
                server.starttls(context=context)
                server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.sendmail(settings.SMTP_FROM, to_email, msg.as_string())
    except Exception as e:
        # Log but don't crash the app if email fails
        print(f"[EMAIL ERROR] Failed to send to {to_email}: {e}")


def _html_wrapper(content: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: Segoe UI, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 30px auto; background: #fff;
                       border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .header {{ background: #1a3d6b; color: white; padding: 24px 32px; }}
        .header h1 {{ margin: 0; font-size: 22px; }}
        .header span {{ font-size: 13px; opacity: 0.7; }}
        .body {{ padding: 28px 32px; color: #333; line-height: 1.6; }}
        .btn {{ display: inline-block; margin-top: 18px; padding: 12px 28px;
                background: #1a3d6b; color: white; border-radius: 5px;
                text-decoration: none; font-weight: 600; }}
        .footer {{ padding: 16px 32px; font-size: 12px; color: #999;
                   border-top: 1px solid #eee; text-align: center; }}
        .info-box {{ background: #f0f5ff; border-left: 4px solid #1a3d6b;
                     padding: 14px 18px; border-radius: 4px; margin: 16px 0; }}
        .badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px;
                  font-size: 12px; font-weight: 600; background: #e8f0fe; color: #1a3d6b; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>FlowDesk</h1>
          <span>Approval &amp; Workflow Platform</span>
        </div>
        <div class="body">{content}</div>
        <div class="footer">This is an automated message from FlowDesk. Please do not reply to this email.</div>
      </div>
    </body>
    </html>
    """


def send_temp_credentials_email(to_email: str, user_name: str, temp_password: str, org_name: str):
    content = f"""
    <h2>Welcome to FlowDesk, {user_name}!</h2>
    <p>Your account has been created for <strong>{org_name}</strong>.</p>
    <div class="info-box">
      <strong>Your temporary credentials:</strong><br>
      Email: <strong>{to_email}</strong><br>
      Temporary Password: <strong style="font-family: monospace; font-size: 15px;">{temp_password}</strong>
    </div>
    <p>Please log in and change your password immediately. Your account will only be fully activated after your first login.</p>
    <a href="{settings.FRONTEND_URL}/login" class="btn">Login to FlowDesk →</a>
    <p style="margin-top: 16px; font-size: 13px; color: #666;">
      For security, your temporary password will expire. If you have any issues, contact your administrator.
    </p>
    """
    _send_email(to_email, f"Welcome to FlowDesk – Your Account Credentials", _html_wrapper(content))


def send_password_reset_email(to_email: str, user_name: str, reset_token: str):
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    content = f"""
    <h2>Password Reset Request</h2>
    <p>Hi {user_name}, we received a request to reset your FlowDesk password.</p>
    <a href="{reset_url}" class="btn">Reset My Password →</a>
    <p style="margin-top: 16px; font-size: 13px; color: #666;">
      This link expires in 1 hour. If you didn't request this, please ignore this email.
    </p>
    """
    _send_email(to_email, "FlowDesk – Password Reset Request", _html_wrapper(content))


def send_approval_request_email(
    to_email: str,
    approver_name: str,
    initiator_name: str,
    form_name: str,
    reference_number: str,
    step_label: str,
    form_instance_id: str
):
    url = f"{settings.FRONTEND_URL}/approvals/{form_instance_id}"
    content = f"""
    <h2>Approval Required</h2>
    <p>Hi {approver_name}, a form requires your approval.</p>
    <div class="info-box">
      <span class="badge">PENDING YOUR APPROVAL</span><br><br>
      <strong>Form:</strong> {form_name}<br>
      <strong>Reference:</strong> {reference_number}<br>
      <strong>Submitted by:</strong> {initiator_name}<br>
      <strong>Your Step:</strong> {step_label}
    </div>
    <a href="{url}" class="btn">Review &amp; Approve →</a>
    """
    _send_email(
        to_email,
        f"FlowDesk – Approval Required: {reference_number}",
        _html_wrapper(content)
    )


def send_step_approved_email(
    to_email: str,
    initiator_name: str,
    form_name: str,
    reference_number: str,
    approved_by: str,
    next_approver: Optional[str],
    form_instance_id: str
):
    url = f"{settings.FRONTEND_URL}/forms/{form_instance_id}"
    next_info = (
        f"<p>The form has moved to the next approver: <strong>{next_approver}</strong>.</p>"
        if next_approver
        else "<p>All approvals are complete. The final document is being generated.</p>"
    )
    content = f"""
    <h2>Approval Step Completed</h2>
    <p>Hi {initiator_name},</p>
    <div class="info-box">
      <span class="badge">STEP APPROVED</span><br><br>
      <strong>Form:</strong> {form_name}<br>
      <strong>Reference:</strong> {reference_number}<br>
      <strong>Approved by:</strong> {approved_by}
    </div>
    {next_info}
    <a href="{url}" class="btn">View Form Status →</a>
    """
    _send_email(
        to_email,
        f"FlowDesk – Step Approved: {reference_number}",
        _html_wrapper(content)
    )


def send_sent_back_email(
    to_email: str,
    initiator_name: str,
    form_name: str,
    reference_number: str,
    sent_back_by: str,
    correction_notes: str,
    form_instance_id: str
):
    url = f"{settings.FRONTEND_URL}/forms/{form_instance_id}/edit"
    content = f"""
    <h2>Form Returned for Correction</h2>
    <p>Hi {initiator_name}, your form has been returned for correction.</p>
    <div class="info-box">
      <span class="badge" style="background:#fff3cd; color:#856404;">CORRECTION REQUIRED</span><br><br>
      <strong>Form:</strong> {form_name}<br>
      <strong>Reference:</strong> {reference_number}<br>
      <strong>Returned by:</strong> {sent_back_by}<br>
      <strong>Correction Notes:</strong><br>
      <em>"{correction_notes}"</em>
    </div>
    <p>Please make the necessary corrections and resubmit.</p>
    <a href="{url}" class="btn">Make Corrections →</a>
    """
    _send_email(
        to_email,
        f"FlowDesk – Correction Required: {reference_number}",
        _html_wrapper(content)
    )


def send_rejection_email(
    to_email: str,
    initiator_name: str,
    form_name: str,
    reference_number: str,
    rejected_by: str,
    rejection_notes: str,
    form_instance_id: str
):
    url = f"{settings.FRONTEND_URL}/forms/{form_instance_id}"
    content = f"""
    <h2>Form Rejected</h2>
    <p>Hi {initiator_name}, unfortunately your form has been rejected.</p>
    <div class="info-box">
      <span class="badge" style="background:#fde8e8; color:#c00;">REJECTED</span><br><br>
      <strong>Form:</strong> {form_name}<br>
      <strong>Reference:</strong> {reference_number}<br>
      <strong>Rejected by:</strong> {rejected_by}<br>
      <strong>Reason:</strong><br>
      <em>"{rejection_notes}"</em>
    </div>
    <a href="{url}" class="btn">View Details →</a>
    """
    _send_email(
        to_email,
        f"FlowDesk – Form Rejected: {reference_number}",
        _html_wrapper(content)
    )


def send_completion_email(
    to_email: str,
    initiator_name: str,
    form_name: str,
    reference_number: str,
    form_instance_id: str,
    pdf_data: Optional[bytes] = None
):
    url = f"{settings.FRONTEND_URL}/forms/{form_instance_id}"
    content = f"""
    <h2>Form Fully Approved &amp; Completed</h2>
    <p>Hi {initiator_name}, your form has been fully approved!</p>
    <div class="info-box">
      <span class="badge" style="background:#d4edda; color:#155724;">COMPLETED</span><br><br>
      <strong>Form:</strong> {form_name}<br>
      <strong>Reference:</strong> {reference_number}
    </div>
    <p>The signed PDF document is attached to this email. You can also download it from the portal.</p>
    <a href="{url}" class="btn">View on FlowDesk →</a>
    """
    attachments = None
    if pdf_data:
        attachments = [{"filename": f"{reference_number}.pdf", "data": pdf_data}]
    _send_email(
        to_email,
        f"FlowDesk – Form Completed: {reference_number}",
        _html_wrapper(content),
        attachments=attachments
    )


def send_resubmission_notification_email(
    to_email: str,
    approver_name: str,
    initiator_name: str,
    form_name: str,
    reference_number: str,
    version_number: int,
    change_summary: str,
    form_instance_id: str
):
    url = f"{settings.FRONTEND_URL}/approvals/{form_instance_id}"
    content = f"""
    <h2>Form Resubmitted for Approval</h2>
    <p>Hi {approver_name}, a corrected form has been resubmitted.</p>
    <div class="info-box">
      <span class="badge">VERSION {version_number} – RESUBMITTED</span><br><br>
      <strong>Form:</strong> {form_name}<br>
      <strong>Reference:</strong> {reference_number}<br>
      <strong>Submitted by:</strong> {initiator_name}<br>
      <strong>Changes Made:</strong><br>
      <em>"{change_summary}"</em>
    </div>
    <a href="{url}" class="btn">Review Corrections →</a>
    """
    _send_email(
        to_email,
        f"FlowDesk – Resubmission for Approval: {reference_number}",
        _html_wrapper(content)
    )
