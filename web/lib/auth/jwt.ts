import { SignJWT, importPKCS8 } from "jose";

// The 5-minute internal JWT the BFF mints per request. FastAPI verifies it (EdDSA
// via JWKS) and sets the RLS GUCs from the verified claims. The browser never holds
// this token — it lives only on the BFF↔FastAPI hop. Shape matches the Python
// verifier in services/api/app/auth.
export interface InternalJwtClaims {
  sub: string;
  org_id: string;
  active_client_id?: string | null;
  roles: string[];
  scope?: Record<string, unknown>;
  consent_caps?: string[];
}

const ALG = "EdDSA";
const ISSUER = "manfriday-bff";
const AUDIENCE = "manfriday-api";
const TTL_SECONDS = 300;

export async function mintInternalJwt(
  claims: InternalJwtClaims,
  privateKeyPkcs8: string,
): Promise<string> {
  const key = await importPKCS8(privateKeyPkcs8, ALG);
  return new SignJWT({
    org_id: claims.org_id,
    active_client_id: claims.active_client_id ?? null,
    roles: claims.roles,
    scope: claims.scope ?? {},
    consent_caps: claims.consent_caps ?? [],
  })
    .setProtectedHeader({ alg: ALG, kid: "manfriday-dev-ed25519" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key);
}
