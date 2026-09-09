import type { DokuClient } from "../core/client.js";

/**
 * Check Status API (Non-SNAP) — GET /orders/v1/status/{invoiceNumber}
 *
 * docs.doku.com: Get Started > Check Status API > Non-SNAP.
 * GET requests are signed without a Digest line.
 * Hit it at least 60 seconds after payment completion.
 */
export async function checkOrderStatus(
  client: DokuClient,
  invoiceNumber: string,
): Promise<unknown> {
  return client.requestNonSnap("GET", `/orders/v1/status/${encodeURIComponent(invoiceNumber)}`);
}
