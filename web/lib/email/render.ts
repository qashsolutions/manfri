// Render one campaign email for one recipient: merge the recruiter's body, wrap it as HTML,
// and append the CAN-SPAM footer (physical-address placeholder + a working unsubscribe link).
// v1 supports the {{first_name}} merge field; other tokens are left as-typed (the composer
// hints which are supported). The unsubscribe URL must be the same signed link the
// List-Unsubscribe header carries so one-click and in-body unsubscribe agree.

const PHYSICAL_ADDRESS =
  process.env.EMAIL_PHYSICAL_ADDRESS || "ManFriday Talent · 100 Congress Ave, Austin, TX 78701";

function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0] ?? "there";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mergeBody(body: string, name: string | null | undefined): string {
  return body.replace(/\{\{\s*first_name\s*\}\}/g, firstNameOf(name));
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderCampaignEmail(opts: {
  body: string;
  candidateName: string | null | undefined;
  unsubUrl: string;
}): RenderedEmail {
  const merged = mergeBody(opts.body, opts.candidateName);

  const text = `${merged}\n\n—\n${PHYSICAL_ADDRESS}\nUnsubscribe: ${opts.unsubUrl}`;

  const bodyHtml = escapeHtml(merged).replace(/\n/g, "<br>");
  const html =
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">` +
    `<div>${bodyHtml}</div>` +
    `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">` +
    `<div style="font-size:12px;color:#6b7280">` +
    `${escapeHtml(PHYSICAL_ADDRESS)}<br>` +
    `You received this because you opted in to role alerts. ` +
    `<a href="${opts.unsubUrl}" style="color:#6b7280">Unsubscribe</a>` +
    `</div></div>`;

  return { html, text };
}
