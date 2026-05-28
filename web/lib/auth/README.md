# `web/lib/auth` — BFF session & internal-JWT minting

**Empty in WP 0.1.** Filled in **WP 0.10**:

- HttpOnly, Secure, `SameSite=Lax`, encrypted BFF session cookie (iron-session / Auth.js, rotating key). The browser never holds a FastAPI token.
- Per-request minting of a **5-minute EdDSA (Ed25519)** internal JWT with claims `{sub, org_id, active_client_id, roles[], scope, consent_caps, jti, exp}`, verified by FastAPI via JWKS.
- In-house recruiter login (email + password + TOTP) and candidate magic-link/OTP scaffolding.

See [`docs/PHASE_0.md` §10](../../../docs/PHASE_0.md) and invariant #3 (RLS GUCs are set from *verified JWT claims*, never client input).
