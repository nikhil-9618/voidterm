/**
 * Dark, terminal-styled OTP email.
 * Table-based layout + inline styles for broad email-client support.
 */
export function renderOtpEmail(otp: string): string {
  const digits = otp
    .split('')
    .map(
      (digit) =>
        `<span style="display:inline-block;padding:14px 12px;margin:0 3px;border:1px solid #1A1F29;background:#0E131B;color:#00E5FF;font-size:40px;line-height:1;font-weight:700;">${digit}</span>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Your login code: ${otp}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .container { width: 100% !important; }
      .pad { padding: 28px 20px !important; }
      .otp-digit { font-size: 32px !important; padding: 10px 8px !important; }
      .headline { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#070A0F;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
    Your one-time VOIDTERM access code is ${otp}. It expires in 10 minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070A0F;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:#0A0E14;border:1px solid #1A1F29;">
          <tr>
            <td style="padding:14px 24px;border-bottom:1px solid #1A1F29;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.14em;color:#8B98A9;text-transform:uppercase;">
              <span style="color:#00E5FF;">voidterm</span> / auth
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:40px 36px 32px 36px;">
              <p style="margin:0 0 8px 0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.08em;color:#5C6B7F;">&gt; access_request</p>
              <h1 class="headline" style="margin:0 0 24px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:600;color:#E6EDF3;">
                One-time access code
              </h1>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:40px;letter-spacing:6px;color:#00E5FF;">
                    ${digits}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px 0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#C3CEDA;">
                This code expires in <span style="color:#E6EDF3;">10 minutes</span> and can be used once.
              </p>
              <p style="margin:0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.7;color:#8B98A9;">
                If you did not request this, ignore the email — no account changes were made.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px;border-top:1px solid #1A1F29;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;line-height:1.7;letter-spacing:0.08em;color:#5C6B7F;text-transform:uppercase;">
              multi-model terminal &nbsp;/&nbsp; dev + security research
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
