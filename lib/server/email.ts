// Thin wrapper around Resend so the rest of the codebase never imports the
// SDK directly. If we swap providers later (Postmark, SES, etc.) only this
// file changes.

import { Resend } from "resend";

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local before sending email."
    );
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!fromAddress) {
    throw new Error("RESEND_FROM_EMAIL is not set.");
  }
  const client = getClient();
  const { data, error } = await client.emails.send({
    from: fromAddress,
    to: [args.to],
    subject: args.subject,
    html: args.html,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Resend returned no id");
  }
  return { id: data.id };
}
