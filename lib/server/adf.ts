// ADF/XML parsing — the auto industry's standard lead format.
//
// Every lead provider (CarGurus, AutoTrader, Cars.com, dealer websites)
// delivers leads as ADF XML inside an email. Dealerships can add extra
// recipients in their lead routing, which is how Race to the Sale receives
// REAL leads in parallel with the CRM — no DriveCentric API needed.
//
// ADF is old (1998!) and messy in the wild: fields appear in different
// orders, name comes as parts or whole, providers misspell tags. This
// parser is deliberately tolerant: extract what we can, never throw on
// missing fields, keep the raw XML in metadata for forensics.

import { XMLParser } from "fast-xml-parser";

export type ParsedAdfLead = {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleInterest: string | null;
  providerName: string | null;
  comments: string | null;
  /** Mapped to our leads.source CHECK constraint values. */
  source: string;
};

/** Pulls the <adf>…</adf> document out of a larger blob (email body, JSON). */
export function extractAdfXml(raw: string): string | null {
  const match = raw.match(/<adf[\s>][\s\S]*?<\/adf>/i) ?? raw.match(/<adf\/>/i);
  return match ? match[0] : null;
}

type AnyNode = Record<string, unknown> | unknown[] | string | number | null | undefined;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node: AnyNode): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && !Array.isArray(node)) {
    const t = (node as Record<string, unknown>)["#text"];
    if (typeof t === "string") return t.trim() || null;
    if (typeof t === "number") return String(t);
  }
  return null;
}

// Map ADF provider/source names to our leads.source enum.
function mapSource(providerName: string | null): string {
  const p = (providerName ?? "").toLowerCase();
  if (!p) return "website";
  if (/cargurus|autotrader|cars\.com|carscom|truecar|carfax|edmunds/.test(p)) {
    return "third_party";
  }
  if (/facebook|instagram|social|tiktok/.test(p)) return "social";
  if (/chat/.test(p)) return "chat";
  if (/referral/.test(p)) return "referral";
  if (/website|dealer\s?site|web/.test(p)) return "website";
  return "third_party";
}

export function parseAdf(xml: string): ParsedAdfLead | null {
  let doc: Record<string, unknown>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // ADF in the wild mixes cases; normalize tags to lowercase.
      transformTagName: (tag) => tag.toLowerCase(),
    });
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }

  const adf = doc["adf"] as Record<string, unknown> | undefined;
  if (!adf) return null;
  // ADF allows multiple prospects per document; take the first.
  const prospect = asArray(adf["prospect"] as AnyNode)[0] as
    | Record<string, unknown>
    | undefined;
  if (!prospect) return null;

  // ── Customer ──────────────────────────────────────────────────────────
  const customer = asArray(prospect["customer"] as AnyNode)[0] as
    | Record<string, unknown>
    | undefined;
  const contact = customer
    ? (asArray(customer["contact"] as AnyNode)[0] as
        | Record<string, unknown>
        | undefined)
    : undefined;

  let customerName: string | null = null;
  if (contact) {
    const names = asArray(contact["name"] as AnyNode);
    if (names.length === 1 && typeof names[0] !== "object") {
      customerName = textOf(names[0] as AnyNode);
    } else {
      // <name part="first">…</name><name part="last">…</name>
      const parts = new Map<string, string>();
      const loose: string[] = [];
      for (const n of names) {
        const text = textOf(n as AnyNode);
        if (!text) continue;
        const part =
          typeof n === "object" && n !== null
            ? String((n as Record<string, unknown>)["@_part"] ?? "")
            : "";
        if (part) parts.set(part.toLowerCase(), text);
        else loose.push(text);
      }
      const ordered = [
        parts.get("first"),
        parts.get("middle"),
        parts.get("last"),
        ...loose,
      ].filter(Boolean);
      customerName = ordered.length > 0 ? ordered.join(" ") : null;
    }
  }

  const customerEmail = contact ? textOf(contact["email"] as AnyNode) : null;
  const customerPhone = contact
    ? textOf(asArray(contact["phone"] as AnyNode)[0] as AnyNode)
    : null;
  const comments = customer ? textOf(customer["comments"] as AnyNode) : null;

  // ── Vehicle ───────────────────────────────────────────────────────────
  const vehicle = asArray(prospect["vehicle"] as AnyNode)[0] as
    | Record<string, unknown>
    | undefined;
  let vehicleInterest: string | null = null;
  if (vehicle) {
    const pieces = [
      textOf(vehicle["year"] as AnyNode),
      textOf(vehicle["make"] as AnyNode),
      textOf(vehicle["model"] as AnyNode),
      textOf(vehicle["trim"] as AnyNode),
    ].filter(Boolean);
    vehicleInterest = pieces.length > 0 ? pieces.join(" ") : null;
  }

  // ── Provider ──────────────────────────────────────────────────────────
  const provider = asArray(prospect["provider"] as AnyNode)[0] as
    | Record<string, unknown>
    | undefined;
  const providerName = provider
    ? (textOf(provider["name"] as AnyNode) ?? textOf(provider as AnyNode))
    : null;

  return {
    customerName,
    customerEmail,
    customerPhone,
    vehicleInterest,
    providerName,
    comments,
    source: mapSource(providerName),
  };
}
