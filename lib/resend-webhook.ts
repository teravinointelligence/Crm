// Verificación de la firma de webhooks de Resend (esquema Svix), sin SDK.
// Resend firma cada webhook con un secreto `whsec_...` y envía las cabeceras
// `svix-id`, `svix-timestamp` y `svix-signature`. La firma se calcula como
// HMAC-SHA256 sobre `${id}.${timestamp}.${rawBody}` y se compara, en tiempo
// constante, contra cada firma `v1,<base64>` de la cabecera.
import "server-only";
import crypto from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; error: string };

/**
 * Verifica una petición de webhook de Resend.
 * @param rawBody Cuerpo crudo (texto), tal cual llegó: la firma es sobre los bytes.
 * @param headers Cabeceras de la petición.
 * @param secret  Secreto del webhook (formato `whsec_<base64>`).
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): VerifyResult {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return { ok: false, error: "Faltan cabeceras de firma (svix-*)" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: "Timestamp inválido" };
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > TOLERANCE_SECONDS) return { ok: false, error: "Timestamp fuera de tolerancia" };

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // La cabecera puede traer varias firmas separadas por espacio: "v1,<b64> v1,<b64>".
  const provided = signature
    .split(" ")
    .map((p) => p.split(",")[1])
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  const match = provided.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });

  return match ? { ok: true } : { ok: false, error: "Firma no coincide" };
}
