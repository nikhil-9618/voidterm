import { Resend } from 'resend';
import { env, isProduction } from '../env';
import { renderOtpEmail } from './templates/otp';
import { renderOtpText } from './templates/otp-text';

type SendResult = { delivered: boolean; devLogged: boolean };

/**
 * Send the login code.
 *
 * Development without RESEND_API_KEY logs the OTP to the server console so the
 * flow is testable end-to-end. Production never logs the code: a missing key is
 * an operational error surfaced to logs (without the secret or the OTP).
 */
export async function sendOtpEmail({ to, otp }: { to: string; otp: string }): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    if (isProduction) {
      console.error('[email] RESEND_API_KEY is not configured; OTP delivery is unavailable.');
      return { delivered: false, devLogged: false };
    }

    console.log(`[DEV OTP] email=${to} code=${otp}`);
    return { delivered: false, devLogged: true };
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: `Your login code: ${otp}`,
      html: renderOtpEmail(otp),
      text: renderOtpText(otp),
    });

    if (error) {
      console.error('[email] Resend rejected the message:', error.name);
      return { delivered: false, devLogged: false };
    }

    return { delivered: true, devLogged: false };
  } catch (error) {
    console.error('[email] failed to send OTP:', error instanceof Error ? error.message : 'unknown error');
    return { delivered: false, devLogged: false };
  }
}
