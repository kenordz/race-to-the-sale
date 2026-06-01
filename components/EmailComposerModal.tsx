"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getMyClaimedLeads,
  sendLeadEmail,
  type LeadRow,
  type SendEmailResult,
} from "@/app/play/actions";
import {
  EMAIL_TEMPLATES,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_LABELS,
  type EmailTemplateName,
} from "@/lib/server/email-templates";

type Props = {
  open: boolean;
  onClose: () => void;
  onSent: (result: Extract<SendEmailResult, { ok: true }>) => void;
};

type Stage = "loading" | "compose" | "sending" | "sent" | "error";

// Local preview matching what the server template renders. Keeping it
// duplicated (vs importing) avoids pulling server-only code into the bundle.
function renderPreview(
  template: EmailTemplateName,
  lead: LeadRow
): { subject: string; body: string } {
  const customer = lead.customer_name ?? "there";
  const vehicle = lead.vehicle_interest ?? "your vehicle";
  switch (template) {
    case "cold_intro":
      return {
        subject: `${customer}, your ${vehicle} is ready to see`,
        body: `Hi ${customer},\n\nI saw you were interested in the ${vehicle}. I'd love to set up a time for you to see it in person.\n\nDo you have 30 minutes this week to swing by? I can have the vehicle pulled up front, keys ready.\n\nReply to this email or call me directly.`,
      };
    case "followup":
      return {
        subject: `Following up — ${vehicle}`,
        body: `Hi ${customer},\n\nJust wanted to follow up on the ${vehicle}. Any questions I can answer for you?\n\nI'm here whenever you're ready.`,
      };
    case "test_drive":
      return {
        subject: `Test drive invitation — ${vehicle}`,
        body: `Hi ${customer},\n\nWould you like to schedule a test drive of the ${vehicle}? Weekends fill up fast, but I can hold a slot for you.\n\nWhat works better — this weekend or next?`,
      };
  }
}

export default function EmailComposerModal({ open, onClose, onSent }: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [template, setTemplate] = useState<EmailTemplateName>("cold_intro");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentRecipient, setSentRecipient] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch leads each time the modal opens — content is freshly relevant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStage("loading");
    setErrorMsg(null);
    setSentRecipient(null);
    void (async () => {
      try {
        const rows = await getMyClaimedLeads();
        if (cancelled) return;
        setLeads(rows);
        setSelectedLeadId(rows[0]?.id ?? null);
        setTemplate("cold_intro");
        setStage("compose");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );
  const preview = useMemo(() => {
    if (!selectedLead) return null;
    return renderPreview(template, selectedLead);
  }, [selectedLead, template]);

  if (!open) return null;

  async function handleSend() {
    if (!selectedLead) return;
    setStage("sending");
    setErrorMsg(null);
    try {
      const result = await sendLeadEmail({
        leadId: selectedLead.id,
        template,
      });
      if (!result.ok) {
        setErrorMsg(result.message ?? result.reason);
        setStage("error");
        return;
      }
      setSentRecipient(result.recipient);
      setStage("sent");
      onSent(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== "sending") onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Computer Desk
            </p>
            <h2 className="text-xl font-bold">✉️ Send Email</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={stage === "sending"}
            className="rounded px-2 py-1 text-sm text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            ESC
          </button>
        </div>

        {stage === "loading" && (
          <div className="py-12 text-center text-white/50">
            Loading your claimed leads…
          </div>
        )}

        {stage === "error" && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold text-red-300">Something went wrong</p>
            <p className="mt-1 text-red-200/80">{errorMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
            >
              Close
            </button>
          </div>
        )}

        {(stage === "compose" || stage === "sending") && (
          <ComposeBody
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
            template={template}
            onSelectTemplate={setTemplate}
            preview={preview}
            sending={stage === "sending"}
            onSend={handleSend}
            onClose={onClose}
          />
        )}

        {stage === "sent" && sentRecipient && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="font-semibold text-emerald-300">
              ✉️ Email sent to {sentRecipient}
            </p>
            <p className="mt-1 text-sm text-emerald-200/80">
              +{15} XP. The send is logged in lead_communications and the
              lead status was bumped to "contacted".
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
            >
              Back to the floor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ComposeBody(props: {
  leads: LeadRow[];
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  template: EmailTemplateName;
  onSelectTemplate: (t: EmailTemplateName) => void;
  preview: { subject: string; body: string } | null;
  sending: boolean;
  onSend: () => void;
  onClose: () => void;
}) {
  if (props.leads.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
        <p className="font-semibold text-white/80">No claimed leads yet</p>
        <p className="mt-1">
          Walk to the Leads Board and press SPACE on a pending lead first.
        </p>
        <button
          type="button"
          onClick={props.onClose}
          className="mt-4 rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
        >
          Got it
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-white/40">
          Lead
        </label>
        <select
          value={props.selectedLeadId ?? ""}
          onChange={(e) => props.onSelectLead(e.target.value)}
          disabled={props.sending}
          className="w-full rounded border border-white/15 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-400/60 focus:outline-none"
        >
          {props.leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {(lead.customer_name ?? "Unknown")} —{" "}
              {(lead.vehicle_interest ?? "Unknown vehicle")} (
              {lead.source})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-white/40">
          Template
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {EMAIL_TEMPLATES.map((t) => {
            const active = props.template === t;
            return (
              <button
                key={t}
                type="button"
                disabled={props.sending}
                onClick={() => props.onSelectTemplate(t)}
                className={`rounded border px-3 py-2 text-left text-xs transition ${
                  active
                    ? "border-emerald-400/60 bg-emerald-400/10 text-white"
                    : "border-white/15 bg-zinc-900 text-white/70 hover:border-white/30"
                }`}
              >
                <div className="font-semibold">{TEMPLATE_LABELS[t]}</div>
                <div className="mt-1 text-[10px] text-white/40">
                  {TEMPLATE_DESCRIPTIONS[t]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {props.preview && (
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-white/40">
            Preview
          </label>
          <div className="rounded border border-white/10 bg-zinc-900 p-4 text-sm">
            <div className="text-white/40">
              <span className="text-white/60">Subject:</span> {props.preview.subject}
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-white/85">
              {props.preview.body}
            </pre>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] text-white/40">
          Prototype mode: outbound goes to EMAIL_TEST_RECIPIENT, not the
          customer's address.
        </p>
        <button
          type="button"
          onClick={props.onSend}
          disabled={props.sending || !props.selectedLeadId}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
        >
          {props.sending ? "Sending…" : "Send Email"}
        </button>
      </div>
    </div>
  );
}
