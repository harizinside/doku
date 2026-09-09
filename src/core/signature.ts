import { createHash, createHmac, createSign } from "node:crypto";

/**
 * Non-SNAP Request-Timestamp: UTC ISO8601 with Z suffix, e.g. 2020-08-11T08:45:42Z
 */
export function nonSnapTimestamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19) + "Z";
}

/**
 * SNAP X-TIMESTAMP: ISO8601 with numeric local offset, e.g. 2024-03-26T16:01:41+07:00
 * (same as moment().format('YYYY-MM-DDTHH:mm:ssZ') used in DOKU's Postman scripts)
 */
export function snapTimestamp(date: Date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  return local.toISOString().slice(0, 19) + sign + hh + ":" + mm;
}

/**
 * Digest component for the Non-SNAP signature: Base64(SHA256(rawJsonBody)).
 * Only used for requests with a body (POST/PATCH); GET requests omit the Digest line.
 */
export function nonSnapDigest(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("base64");
}

export interface NonSnapSignatureInput {
  clientId: string;
  requestId: string;
  requestTimestamp: string;
  /** Request-Target: the API path, e.g. /mandiri-virtual-account/v2/payment-code */
  requestTarget: string;
  /** Raw (minified) JSON body. Omit/undefined for GET requests (no Digest line). */
  body?: string;
  secretKey: string;
}

/**
 * Non-SNAP Signature header value: "HMACSHA256=" + Base64(HMAC-SHA256(stringToSign, secretKey))
 *
 * stringToSign (lines joined with \n, no trailing newline):
 *   Client-Id:{id}
 *   Request-Id:{rid}
 *   Request-Timestamp:{ts}
 *   Request-Target:{path}
 *   Digest:{base64 sha256 of body}   (omitted for GET)
 */
export function signNonSnap(input: NonSnapSignatureInput): string {
  const lines = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.requestTimestamp}`,
    `Request-Target:${input.requestTarget}`,
  ];
  if (input.body !== undefined) {
    lines.push(`Digest:${nonSnapDigest(input.body)}`);
  }
  const stringToSign = lines.join("\n");
  const hmac = createHmac("sha256", input.secretKey).update(stringToSign, "utf8").digest("base64");
  return `HMACSHA256=${hmac}`;
}

/** Normalize a PEM private key that may contain literal "\n" escapes (e.g. from .env files). */
function normalizePem(privateKey: string): string {
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

export interface SnapTokenSignatureInput {
  clientId: string;
  /** ISO8601 timestamp with offset; must equal the X-TIMESTAMP header sent with the request */
  timestamp: string;
  privateKey: string;
}

/**
 * SNAP asymmetric signature (X-SIGNATURE on the access-token request):
 * Base64(RSA-SHA256(`${clientId}|${timestamp}`, privateKey))
 */
export function signSnapToken(input: SnapTokenSignatureInput): string {
  const stringToSign = `${input.clientId}|${input.timestamp}`;
  const signer = createSign("RSA-SHA256");
  signer.update(stringToSign, "utf8");
  return signer.sign(normalizePem(input.privateKey), "base64");
}

export interface SnapRequestSignatureInput {
  httpMethod: string;
  /** Endpoint path, e.g. /virtual-accounts/bi-snap-va/v1/transfer-va/create-va */
  endpointUrl: string;
  /** B2B access token (without the "Bearer " prefix) */
  accessToken: string;
  /** Raw (minified) JSON body; empty string when the request has no body */
  body?: string;
  timestamp: string;
  clientSecret: string;
}

/**
 * SNAP symmetric signature (X-SIGNATURE on resource requests):
 * HMAC-SHA512 over `METHOD:path:accessToken:lowercaseHex(SHA256(minifiedBody)):timestamp`
 */
export function signSnapRequest(input: SnapRequestSignatureInput): string {
  const bodySha256 = createHash("sha256")
    .update(input.body ?? "", "utf8")
    .digest("hex")
    .toLowerCase();
  const stringToSign = [
    input.httpMethod,
    input.endpointUrl,
    input.accessToken,
    bodySha256,
    input.timestamp,
  ].join(":");
  return createHmac("sha512", input.clientSecret).update(stringToSign, "utf8").digest("base64");
}

export interface OvoCheckSumInput {
  /** order.amount (number or string; stringified as-is) */
  amount: number | string;
  clientId: string;
  invoiceNumber: string;
  ovoId: string;
  secretKey: string;
  /** Only for void; empty string for payment */
  approvalCode?: string | number;
  batchNumber?: string | number;
  referenceNumber?: string | number;
  traceNumber?: string | number;
}

/**
 * Legacy OVO Push Payment `security.check_sum`:
 * hex(SHA256(amount + approvalCode + batchNumber + clientId + invoiceNumber + ovoId
 *            + referenceNumber + traceNumber + secretKey))
 * (field order and plain concatenation exactly as in DOKU's reference implementation)
 */
export function ovoCheckSum(input: OvoCheckSumInput): string {
  const s = (v: string | number | undefined) => (v === undefined ? "" : String(v));
  const signatureComponents =
    s(input.amount) +
    s(input.approvalCode) +
    s(input.batchNumber) +
    input.clientId +
    input.invoiceNumber +
    input.ovoId +
    s(input.referenceNumber) +
    s(input.traceNumber) +
    input.secretKey;
  return createHash("sha256").update(signatureComponents, "utf8").digest("hex");
}

/**
 * SNAP VA partnerServiceId from the acquirer BIN, replicating DOKU's Postman helper:
 * - BIN shorter than 8 chars: left-pad the first `binLength` chars with spaces to 8 chars
 * - BIN 8+ chars: first 8 chars
 */
export function partnerServiceId(bin: string, binLength = 6): string {
  const trimmed = bin.trim();
  if (trimmed.length < 8) {
    return trimmed.substring(0, binLength).padStart(8, " ");
  }
  return trimmed.substring(0, 8);
}
