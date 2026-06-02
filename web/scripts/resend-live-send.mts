// Live Resend smoke test: confirm the domain is verified and that a real email sends from
// no-reply@manfriday.app through our actual EmailProvider (with the rendered body, merge,
// unsubscribe link + List-Unsubscribe header, and Reply-To). Recipient defaults to
// admin@manfriday.app (a real inbox the owner controls). Run from web/ with env loaded.
//   node_modules/.bin/tsx scripts/resend-live-send.mts [recipient]

import { getEmailProvider } from "../lib/email/provider";
import { renderCampaignEmail } from "../lib/email/render";
import { signUnsub } from "../lib/email/unsub-token";

const TO = process.argv[2] || "admin@manfriday.app";
const BASE = process.env.APP_BASE_URL || "https://manfriday.app";
const ORG_DEMO = "00000000-0000-0000-0000-00000000a000";
const CAND_DEMO = "00000000-0000-0000-0000-0000000a0001";

async function checkDomain(): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("RESEND_API_KEY not set — provider would be dry-run. Aborting live test.");
    process.exit(1);
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const res = (await resend.domains.list()) as { data?: { data?: Array<{ name: string; status: string; region?: string }> } | null; error?: { message?: string } | null };
  if (res.error) {
    console.log(`domains.list error: ${res.error.message ?? "unknown"}`);
    return;
  }
  const domains = res.data?.data ?? [];
  const d = domains.find((x) => x.name === "manfriday.app");
  if (!d) {
    console.log(`⚠ manfriday.app not found among Resend domains: [${domains.map((x) => `${x.name}:${x.status}`).join(", ") || "none"}]`);
    return;
  }
  console.log(`domain manfriday.app — status: ${d.status}${d.region ? `, region ${d.region}` : ""}`);
  if (d.status !== "verified") {
    console.log("  (not 'verified' yet — DNS may still be propagating, or click Verify in Resend. Sending from no-reply@ will fail until verified.)");
  }
}

async function main(): Promise<void> {
  const provider = getEmailProvider();
  console.log(`provider mode: ${provider.mode}`);
  console.log(`from: ${process.env.EMAIL_FROM}`);
  console.log(`reply-to: ${process.env.EMAIL_REPLY_TO ?? "(unset)"}`);
  await checkDomain();

  const unsubUrl = `${BASE}/api/v1/unsubscribe?token=${signUnsub(ORG_DEMO, CAND_DEMO)}`;
  const subject = "ManFriday — live send test";
  const { html, text } = renderCampaignEmail({
    body: "Hi {{first_name}},\n\nThis is a live deliverability test from ManFriday via Resend. If you can read this in the admin@ inbox, sending from no-reply@manfriday.app works end to end (DKIM/SPF + the unsubscribe footer below).\n\n— ManFriday",
    candidateName: "Admin",
    unsubUrl,
  });

  console.log(`\nsending to: ${TO} ...`);
  const [result] = await provider.sendBatch([
    {
      to: TO,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
  ]);

  if (result?.ok) {
    console.log(`✅ SENT — message id: ${result.id ?? "(none returned)"}`);
    process.exit(0);
  } else {
    console.log(`❌ FAILED — ${result?.error ?? "unknown error"}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
