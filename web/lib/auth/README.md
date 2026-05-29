# `web/lib/auth` — BFF session & internal-JWT minting (WP 0.10)

- `session.ts` — HttpOnly, Secure, `SameSite=Lax` **encrypted session** (iron-session).
  The browser never holds a FastAPI token.
- `jwt.ts` — mints the 5-minute **EdDSA (Ed25519)** internal JWT carrying the tenant
  claims `{sub, org_id, active_client_id, roles, scope, consent_caps, jti, exp}`.
  FastAPI verifies it via JWKS and sets the RLS GUCs from the **verified** claims
  (invariant #3). The shape matches the Python verifier in `services/api/app/auth`.

Next: wire these into the recruiter login route (email + password + TOTP) and the
typed FastAPI client (the JWT rides the `Authorization` header). Candidate
passwordless magic-link/OTP is P1+; WorkOS SSO/SCIM is P3.
