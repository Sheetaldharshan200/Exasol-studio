// Decisions of the connect / test flow (ConnectRunOverlay), kept pure: what a
// failure means for the person, and the TLS choices the form offers.

/** What to offer after a failed connect: trust the server's certificate
 *  (nothing pinned yet), or decide about one that changed. */
export type TrustOffer = { fingerprint: string; changedFrom?: string };

export function trustOffer(err: unknown): TrustOffer | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { kind?: unknown; fingerprint?: unknown; expected?: unknown };
  if (typeof e.fingerprint !== "string" || !/^[0-9A-F]{64}$/.test(e.fingerprint)) return null;
  if (e.kind === "untrusted-certificate") return { fingerprint: e.fingerprint };
  if (e.kind === "certificate-changed" && typeof e.expected === "string") return { fingerprint: e.fingerprint, changedFrom: e.expected };
  return null;
}

/** Groups of four, so two fingerprints can be compared by eye. */
export function displayFingerprint(fp: string): string {
  return fp.replace(/(.{4})(?=.)/g, "$1 ");
}

/** The encryption choices: always encrypted (Exasol 8.19+ refuses plain). */
export const ENCRYPTION_MODES: { value: string; label: string }[] = [
  { value: "verify_identity", label: "Verify certificate and host (recommended)" },
  { value: "verify_ca", label: "Verify certificate" },
  { value: "required", label: "Encrypt without verifying" },
];

/** A stored mode as one of the offered choices: "disabled" and the old
 *  "preferred" are both "encrypt without verifying" now. */
export function encryptionChoice(sslMode: string | undefined): string {
  return ENCRYPTION_MODES.some((m) => m.value === sslMode) ? (sslMode as string) : "required";
}

export const AUTH_METHODS: { value: string; label: string; secret: string }[] = [
  { value: "password", label: "User and password", secret: "Password" },
  { value: "access_token", label: "OpenID access token", secret: "Access token" },
  { value: "refresh_token", label: "OpenID refresh token", secret: "Refresh token" },
];

/** Exasol SaaS hosts, whose sign-in is a personal access token. */
export function isSaasHost(host: string): boolean {
  return /\.exasol\.com$/i.test(host.trim().split(/[/:]/)[0] ?? "");
}
