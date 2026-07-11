import { getAddress, isAddress } from "viem";

/** True for a syntactically valid EVM address (any casing). */
export function isValidEvmAddress(value: string): boolean {
  return isAddress(value.trim(), { strict: false });
}

/**
 * Normalize user input to a checksummed address, or null if invalid.
 * Accepts surrounding whitespace and any casing.
 */
export function normalizeAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}
