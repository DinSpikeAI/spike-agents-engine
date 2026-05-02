// src/lib/webhooks/whatsapp/signature.ts
//
// Verify Meta's X-Hub-Signature-256 header on incoming WhatsApp webhooks.
//
// Meta signs the raw request body using HMAC-SHA-256 with the app secret.
// Header format: "sha256=<hex>"
// Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#payload
//
// STAGE 1 (current): WHATSAPP_APP_SECRET is unset → we accept all signatures.
//   This lets us test with curl/Postman/the demo UI without setting up Meta.
//
// STAGE 2 (later): WHATSAPP_APP_SECRET is set in Vercel env → real signature
//   verification runs. Any unsigned or bad-signature request is rejected.
//
// IMPORTANT: when Stage 2 ships, the env var presence is the switch — no code
// change required. Set WHATSAPP_APP_SECRET in Vercel and verification activates.

import crypto from "crypto";

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 *
 * @param rawBody - the raw body as received (must be the *exact* bytes sent)
 * @param signatureHeader - value of X-Hub-Signature-256 (e.g. "sha256=abc123...")
 * @returns true if the signature is valid OR if no app secret is configured (Stage 1 mode)
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // Stage 1: no app secret → bypass verification.
  // (Demo / Postman testing.)
  if (!appSecret) {
    return true;
  }

  // Stage 2: app secret is set → enforce signature.
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = signatureHeader.slice("sha256=".length);
  const computedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks.
  // timingSafeEqual throws if the buffers differ in length, hence the try/catch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHex, "hex"),
      Buffer.from(computedHex, "hex"),
    );
  } catch {
    return false;
  }
}
