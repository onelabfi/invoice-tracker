// Pure MOD-97 IBAN checksum — no external dependency, no BigInt
export function validateIban(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();
  if (iban.length < 4 || iban.length > 34) return false;
  // Move first 4 chars to end, convert letters to digits (A=10, B=11, …)
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((c) => (c >= "A" ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  // String-based mod 97 to avoid BigInt
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }
  return remainder === 1;
}
