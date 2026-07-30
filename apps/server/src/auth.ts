import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

export interface TokenDigest {
  lookup: string;
  salt: Uint8Array;
  hash: Uint8Array;
}

const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024
} as const;

export function createSeatToken(): { token: string; digest: TokenDigest } {
  const token = randomBytes(32).toString("base64url");
  const salt = randomBytes(16);

  return {
    token,
    digest: {
      lookup: tokenLookup(token),
      salt,
      hash: scryptSync(token, salt, 64, SCRYPT_OPTIONS)
    }
  };
}

export function tokenLookup(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifySeatToken(
  token: string,
  salt: Uint8Array,
  expectedHash: Uint8Array
): boolean {
  const actualHash = scryptSync(token, salt, expectedHash.byteLength, SCRYPT_OPTIONS);
  return (
    actualHash.byteLength === expectedHash.byteLength &&
    timingSafeEqual(actualHash, expectedHash)
  );
}
