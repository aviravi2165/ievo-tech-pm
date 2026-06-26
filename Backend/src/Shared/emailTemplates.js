'use strict';

/**
 * Backend/src/Shared/emailTemplates.js
 *
 * HTML + plain-text email templates for the ERP system.
 * Each function returns { subject, html, text }.
 */

/**
 * Welcome email sent to a new user after admin registers them.
 * @param {{ firstName: string|null, username: string, temporaryPassword: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
function welcomeEmail({ firstName, username, temporaryPassword }) {
  const displayName = firstName || username;
  const loginUrl    = process.env.APP_URL || 'http://localhost:5173';

  const subject = 'Welcome to I.EVO ERP — Your Account Details';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#c4181f;padding:28px 36px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:.5px;">I.EVO ERP</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">
                Enterprise Resource Planning
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 16px;font-size:15px;color:#222;">
                Hi <strong>${displayName}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#444;line-height:1.6;">
                Your I.EVO ERP account has been created. Use the credentials below to
                log in for the first time. You will be asked to set a new password
                immediately after signing in.
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;margin:20px 0;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:12px;color:#888;text-transform:uppercase;
                                   letter-spacing:.08em;padding-bottom:6px;" colspan="2">
                          Login Credentials
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#666;padding:4px 16px 4px 0;
                                   white-space:nowrap;font-weight:600;">
                          Username
                        </td>
                        <td style="font-size:14px;color:#222;padding:4px 0;
                                   font-family:monospace;">
                          ${username}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#666;padding:4px 16px 4px 0;
                                   white-space:nowrap;font-weight:600;">
                          Temporary Password
                        </td>
                        <td style="font-size:14px;color:#c4181f;padding:4px 0;
                                   font-family:monospace;font-weight:700;letter-spacing:.06em;">
                          ${temporaryPassword}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.6;">
                Click the button below to open the ERP portal and sign in.
              </p>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#c4181f;border-radius:6px;">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:12px 28px;color:#ffffff;
                              font-size:14px;font-weight:700;text-decoration:none;
                              letter-spacing:.04em;">
                      Open I.EVO ERP →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#999;line-height:1.6;">
                If you did not expect this email, please contact your system administrator.
                Do not share your password with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f0f0f0;padding:16px 36px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">
                This is an automated message from I.EVO ERP. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `
Welcome to I.EVO ERP, ${displayName}!

Your account has been created. Use the credentials below to log in.
You will be asked to set a new password on first login.

Username:           ${username}
Temporary Password: ${temporaryPassword}

Login URL: ${loginUrl}

If you did not expect this email, contact your system administrator.
`.trim();

  return { subject, html, text };
}

module.exports = { welcomeEmail };