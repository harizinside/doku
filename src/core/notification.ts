import { timingSafeEqual } from "node:crypto";
import { signNonSnap } from "./signature.js";

/**
 * DOKU HTTP Notification body. Structure and `transaction.status` values
 * (SUCCESS | FAILED) per developers.doku.com's notification guide; the
 * payment-method-specific block (`card_payment`, `virtual_account_info`,
 * `emoney`, etc.) varies by channel, so it's left as an index signature.
 */
export interface DokuNotification {
  order: {
    invoice_number: string;
    amount: number | string;
    currency?: string;
  };
  customer?: {
    id?: string;
    name?: string;
    email?: string;
    [key: string]: unknown;
  };
  transaction: {
    type?: string;
    status: "SUCCESS" | "FAILED" | (string & {});
    date?: string;
    original_request_id?: string;
  };
  service?: { id?: string };
  acquirer?: { id?: string };
  channel?: { id?: string };
  [key: string]: unknown;
}

export interface VerifyNotificationInput {
  /** Request headers, any casing ("Client-Id", "client-id", "CLIENT-ID" all work). */
  headers: Record<string, string | string[] | undefined>;
  /**
   * Exact raw request body as received — do NOT parse-then-restringify it first.
   * The digest must match the bytes DOKU hashed; re-serializing can reorder keys
   * or change whitespace and silently break verification.
   */
  rawBody: string;
  /** Path of your notification route as configured in DOKU Back Office, e.g. "/api/doku/notifications". */
  notificationPath: string;
  secretKey: string;
}

function header(headers: VerifyNotificationInput["headers"], name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Verify a DOKU HTTP Notification's `Signature` header — the same Non-SNAP
 * HMAC-SHA256 scheme as outgoing requests, just checked in reverse. Returns
 * `false` on any missing header or mismatch; never throws.
 */
export function verifyNotificationSignature(input: VerifyNotificationInput): boolean {
  const clientId = header(input.headers, "Client-Id");
  const requestId = header(input.headers, "Request-Id");
  const requestTimestamp = header(input.headers, "Request-Timestamp");
  const receivedSignature = header(input.headers, "Signature");
  if (!clientId || !requestId || !requestTimestamp || !receivedSignature) return false;

  const expected = signNonSnap({
    clientId,
    requestId,
    requestTimestamp,
    requestTarget: input.notificationPath,
    body: input.rawBody,
    secretKey: input.secretKey,
  });

  const a = Buffer.from(expected);
  const b = Buffer.from(receivedSignature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parse a DOKU notification body. Throws if it doesn't look like one. */
export function parseDokuNotification(rawBody: string): DokuNotification {
  const parsed = JSON.parse(rawBody);
  if (!parsed?.transaction?.status) {
    throw new Error("Not a DOKU notification: missing transaction.status");
  }
  return parsed as DokuNotification;
}
