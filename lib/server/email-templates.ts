// Email templates the player can choose from in the Computer Desk modal.
// Each template returns a fully-rendered { subject, html } for Resend.
// Keep these short and dealership-flavored — they read like real outbound.

export const EMAIL_TEMPLATES = [
  "cold_intro",
  "followup",
  "test_drive",
] as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATES)[number];

export type EmailTemplateData = {
  customerName: string;
  vehicleInterest: string;
  dealershipName: string;
  salespersonName: string;
};

export type RenderedEmail = { subject: string; html: string };

type Renderer = (data: EmailTemplateData) => RenderedEmail;

const RENDERERS: Record<EmailTemplateName, Renderer> = {
  cold_intro: (d) => ({
    subject: `${d.customerName}, your ${d.vehicleInterest} is ready to see`,
    html: `
      <p>Hi ${d.customerName},</p>
      <p>I saw you were interested in the <strong>${d.vehicleInterest}</strong>. I'd love to set up a time for you to see it in person.</p>
      <p>Do you have 30 minutes this week to swing by? I can have the vehicle pulled up front, keys ready.</p>
      <p>Reply to this email or call me directly.</p>
      <p>— ${d.salespersonName}<br/>${d.dealershipName}</p>
    `.trim(),
  }),
  followup: (d) => ({
    subject: `Following up — ${d.vehicleInterest}`,
    html: `
      <p>Hi ${d.customerName},</p>
      <p>Just wanted to follow up on the <strong>${d.vehicleInterest}</strong>. Any questions I can answer for you?</p>
      <p>I'm here whenever you're ready.</p>
      <p>— ${d.salespersonName}<br/>${d.dealershipName}</p>
    `.trim(),
  }),
  test_drive: (d) => ({
    subject: `Test drive invitation — ${d.vehicleInterest}`,
    html: `
      <p>Hi ${d.customerName},</p>
      <p>Would you like to schedule a test drive of the <strong>${d.vehicleInterest}</strong>? Weekends fill up fast, but I can hold a slot for you.</p>
      <p>What works better — this weekend or next?</p>
      <p>— ${d.salespersonName}<br/>${d.dealershipName}</p>
    `.trim(),
  }),
};

export const TEMPLATE_LABELS: Record<EmailTemplateName, string> = {
  cold_intro: "Cold Intro",
  followup: "Follow-up",
  test_drive: "Test Drive Invite",
};

export const TEMPLATE_DESCRIPTIONS: Record<EmailTemplateName, string> = {
  cold_intro: "First-touch invitation to come see the vehicle.",
  followup: "Soft nudge after the initial outreach.",
  test_drive: "Direct test-drive scheduling ask.",
};

export function renderTemplate(
  name: EmailTemplateName,
  data: EmailTemplateData
): RenderedEmail {
  return RENDERERS[name](data);
}
