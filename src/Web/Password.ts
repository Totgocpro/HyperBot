import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PasswordIterations = 210000;
const PasswordKeyLength = 64;
const PasswordDigest = "sha512";

export function HashPassword(Password: string): { PasswordHash: string; PasswordSalt: string } {
  const PasswordSalt = randomBytes(32).toString("hex");
  const PasswordHash = pbkdf2Sync(Password, PasswordSalt, PasswordIterations, PasswordKeyLength, PasswordDigest).toString("hex");

  return { PasswordHash, PasswordSalt };
}

export function VerifyPassword(Password: string, PasswordHash: string, PasswordSalt: string): boolean {
  const CandidateHash = pbkdf2Sync(Password, PasswordSalt, PasswordIterations, PasswordKeyLength, PasswordDigest);
  const StoredHash = Buffer.from(PasswordHash, "hex");

  if (CandidateHash.length !== StoredHash.length) {
    return false;
  }

  return timingSafeEqual(CandidateHash, StoredHash);
}
