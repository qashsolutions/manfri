// EmailProvider — the single seam every send goes through, so the rest of the app never
// imports a vendor SDK directly. Resend is the v1 implementation; SES (or anything else) is
// a later drop-in that implements the same `sendBatch`. When no RESEND_API_KEY is present
// (local/CI), a dry-run provider stands in: it logs and returns synthetic ids so the full
// queue → process → sent flow is exercisable without network or a key. Real delivery needs
// the owner to add RESEND_API_KEY (and verify a sending domain for non-test from-addresses).
// Server-only: imported by route handlers / server actions, never by a client component.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface EmailProvider {
  /** Provider name + whether sends actually leave the building. */
  readonly mode: "resend" | "dry-run";
  /** Send a batch (caller chunks to the provider limit). One result per input, in order. */
  sendBatch(messages: EmailMessage[]): Promise<SendResult[]>;
}

/** Resend's documented per-call batch limit. */
export const RESEND_BATCH_LIMIT = 100;

function fromAddress(): string {
  // onboarding@resend.dev works without domain verification but can only deliver to the
  // Resend account's verified test recipients (delivered@resend.dev, etc.). Override with a
  // verified-domain sender in prod via EMAIL_FROM.
  return process.env.EMAIL_FROM || "ManFriday <onboarding@resend.dev>";
}

class ResendProvider implements EmailProvider {
  readonly mode = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    if (messages.length === 0) return [];
    // Imported lazily so the SDK is only required when a key is configured.
    const { Resend } = await import("resend");
    const resend = new Resend(this.apiKey);
    const payload = messages.map((m) => ({
      from: this.from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      ...(m.text ? { text: m.text } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
    }));
    const { data, error } = await resend.batch.send(payload);
    if (error) {
      // Batch is all-or-nothing per call: a call-level error fails the whole chunk.
      const msg = error.message || "resend batch error";
      return messages.map(() => ({ ok: false, error: msg }));
    }
    const ids = data?.data ?? [];
    return messages.map((_, i) => ({ ok: true, id: ids[i]?.id }));
  }
}

class DryRunProvider implements EmailProvider {
  readonly mode = "dry-run" as const;
  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return messages.map((m, i) => {
      console.log(`[email:dry-run] -> ${m.to} :: ${m.subject}`);
      return { ok: true, id: `dryrun-${i}` };
    });
  }
}

/**
 * The active provider: Resend when RESEND_API_KEY is set, else a dry-run stand-in.
 * Never throws on a missing key — the send flow stays exercisable; only delivery differs.
 */
export function getEmailProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY;
  if (key) return new ResendProvider(key, fromAddress());
  return new DryRunProvider();
}
