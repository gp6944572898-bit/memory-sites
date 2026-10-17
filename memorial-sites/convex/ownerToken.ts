// A long, hard-to-guess bearer token — this, not sign-in, is what the owner
// panel checks. crypto.getRandomValues (not Math.random) because it protects
// control of a page, same standard as a password-reset token.
const TOKEN_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export function generateOwnerToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let token = ""
  for (const byte of bytes) {
    token += TOKEN_CHARS[byte % TOKEN_CHARS.length]
  }
  return token
}
