// The agent's own database connections follow the connection's TLS trust: a
// pinned certificate is checked on the connection itself (at the WebSocket's
// TLS upgrade, before the driver signs in), a verify mode verifies, and only
// a connection set to "encrypt without verifying" skips the check.

export type TlsTrust = { verify?: boolean; fingerprint?: string | null };

/** `rejectUnauthorized` for the WebSocket: a pin is checked by fingerprint instead. */
export function rejectUnauthorized(t: TlsTrust): boolean {
  return !t.fingerprint && t.verify === true;
}

/** Node's fingerprint256 ("AB:CD:…") against a stored pin (64 hex digits). */
export function pinMatches(fingerprint256: string | undefined | null, pin: string): boolean {
  if (!fingerprint256) return false;
  return fingerprint256.replace(/:/g, "").toUpperCase() === pin.replace(/[^0-9a-f]/gi, "").toUpperCase();
}
