/** Plain-text fallback for the OTP email. */
export function renderOtpText(otp: string): string {
  return [
    'VOIDTERM // auth',
    '',
    'One-time access code',
    '',
    `    ${otp}`,
    '',
    'This code expires in 10 minutes and can be used once.',
    'If you did not request this, ignore the email — no account changes were made.',
    '',
    '— voidterm',
  ].join('\n');
}
