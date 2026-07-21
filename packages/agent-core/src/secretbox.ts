import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Secrets at rest: AES-256-GCM with a per-machine key file (0600). Honest
 * threat model: protects config files in backups/sync/casual reads — NOT
 * against malware running as this user (that requires an OS keychain, which
 * the desktop vault covers for DB credentials; connector secrets get this
 * local envelope until they move behind the vault too).
 */
export class SecretBox {
  private key: Buffer;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    const keyFile = join(dataDir, ".connector-key");
    if (existsSync(keyFile)) {
      this.key = Buffer.from(readFileSync(keyFile, "utf8").trim(), "hex");
    } else {
      this.key = randomBytes(32);
      writeFileSync(keyFile, this.key.toString("hex"), { mode: 0o600 });
      try {
        chmodSync(keyFile, 0o600);
      } catch {
        /* windows */
      }
    }
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `enc:v1:${iv.toString("base64")}:${ct.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
  }

  open(value: string): string {
    if (!value.startsWith("enc:v1:")) return value; // legacy plaintext
    const [, , iv, ct, tag] = value.split(":");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
  }

  isSealed(value: string): boolean {
    return value.startsWith("enc:v1:");
  }
}
