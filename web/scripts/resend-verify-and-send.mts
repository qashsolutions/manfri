// Trigger Resend domain verification for manfriday.app (DNS records are already live), poll
// until verified (or time out), then send the live test email via our EmailProvider.
//   node_modules/.bin/tsx scripts/resend-verify-and-send.mts [recipient]

import { getEmailProvider } from "../lib/email/provider";
import { renderCampaignEmail } from "../lib/email/render";
import { signUnsub } from "../lib/email/unsub-token";

const TO = process.argv[2] || "admin@manfriday.app";
const BASE = process.env.APP_BASE_URL || "https://manfriday.app";
const ORG_DEMO = "00000000-0000-0000-0000-00000000a000";
const CAND_DEMO = "00000000-0000-0000-0000-0000000a0001";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface DomainRow { id: string; name: string; status: string; region?: string }

async function main(): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("RESEND_API_KEY not set — aborting.");
    process.exit(1);
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);

  const list = (await resend.domains.list()) as { data?: { data?: DomainRow[] } | null };
  const d = (list.data?.data ?? []).find((x) => x.name === "manfriday.app");
  if (!d) {
    console.log("⚠ manfriday.app not found in Resend domains — add it in the dashboard first.");
    process.exit(1);
  }
  console.log(`domain ${d.name} (${d.id.slice(0, 8)}…) status: ${d.status}, region ${d.region ?? "?"}`);

  if (d.status !== "verified") {
    console.log("triggering verification …");
    await resend.domains.verify(d.id);
    for (let i = 0; i < 18; i++) {
      await sleep(5000);
      const got = (await resend.domains.get(d.id)) as { data?: { status?: string } | null };
      const st = got.data?.status ?? "?";
      console.log(`  [${(i + 1) * 5}s] status: ${st}`);
      if (st === "verified") break;
      if (st === "failure") {
        console.log("  verification failed — check the records in Resend.");
        break;
      }
    }
  }

  const finalGet = (await resend.domains.get(d.id)) as { data?: { status?: string } | null };
  const finalStatus = finalGet.data?.status ?? "?";
  console.log(`\nfinal domain status: ${finalStatus}`);
  if (finalStatus !== "verified") {
    console.log("Not verified yet — Resend can take a few minutes after triggering. Re-run this script (or scripts/resend-live-send.mts) shortly.");
    process.exit(2);
  }

  // ── Verified → send the live test ────────────────────────────────────────────
  const provider = getEmailProvider();
  const unsubUrl = `${BASE}/api/v1/unsubscribe?token=${signUnsub(ORG_DEMO, CAND_DEMO)}`;
  const { html, text } = renderCampaignEmail({
    body: "Hi {{first_name}},\n\nThis is a live deliverability test from ManFriday via Resend. If this landed in the admin@ inbox, sending from no-reply@manfriday.app works end to end (DKIM/SPF/DMARC + the unsubscribe footer below + Reply-To to admin@).\n\n— ManFriday",
    candidateName: "Admin",
    unsubUrl,
  });

  console.log(`provider mode: ${provider.mode} · from ${process.env.EMAIL_FROM} · reply-to ${process.env.EMAIL_REPLY_TO ?? "(unset)"}`);
  console.log(`sending to: ${TO} …`);
  const [result] = await provider.sendBatch([
    {
      to: TO,
      subject: "ManFriday — live send test",
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
  ]);

  if (result?.ok) {
    console.log(`✅ SENT — message id: ${result.id ?? "(none)"}`);
    process.exit(0);
  }
  console.log(`❌ FAILED — ${result?.error ?? "unknown error"}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
