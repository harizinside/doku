import type { DokuClient } from "../core/client.js";
import { ovoCheckSum } from "../core/signature.js";

/**
 * E-Money endpoints that don't fit the generic codegen shape:
 * - Legacy OVO Push Payment (signature is a `check_sum` hash, not the standard header scheme)
 * - Generic SNAP debit host-to-host (shared by DANA / ShopeePay / OVO SNAP e-money)
 * - ShopeePay order (simple Non-SNAP)
 */

// ---------------------------------------------------------------------------
// Legacy OVO Push Payment (check_sum based)
// ---------------------------------------------------------------------------

export interface OvoPaymentRequest {
  /** Merchant invoice number */
  invoice_number: string;
  /** Payment amount */
  amount: number;
  /** Customer's OVO registered phone number, e.g. "081211111111" */
  ovo_id: string;
}

export interface OvoVoidRequest extends OvoPaymentRequest {
  batch_number: string | number;
  trace_number: string | number;
  reference_number: string | number;
  approval_code: string | number;
}

function ovoBody(
  client: DokuClient,
  input: OvoPaymentRequest,
  paymentFields?: Record<string, string | number>,
): Record<string, unknown> {
  const checkSum = ovoCheckSum({
    amount: input.amount,
    clientId: client.config.clientId,
    invoiceNumber: input.invoice_number,
    ovoId: input.ovo_id,
    secretKey: client.config.secretKey,
    approvalCode: paymentFields?.approval_code,
    batchNumber: paymentFields?.batch_number,
    referenceNumber: paymentFields?.reference_number,
    traceNumber: paymentFields?.trace_number,
  });
  const body: Record<string, unknown> = {
    client: { id: client.config.clientId },
    order: {
      invoice_number: input.invoice_number,
      amount: input.amount,
    },
    ovo_info: {
      ovo_id: input.ovo_id,
    },
    security: {
      check_sum: checkSum,
    },
  };
  if (paymentFields) {
    body.ovo_payment = paymentFields;
  }
  return body;
}

/** Legacy OVO push payment — POST /ovo-emoney/v1/payment */
export async function ovoPayment(
  client: DokuClient,
  input: OvoPaymentRequest,
): Promise<unknown> {
  return client.requestNonSnap(
    "POST",
    "/ovo-emoney/v1/payment",
    ovoBody(client, input),
  );
}

/** Legacy OVO void/cancel — POST /ovo-emoney/v1/cancel (check_sum includes the payment identifiers) */
export async function ovoVoid(
  client: DokuClient,
  input: OvoVoidRequest,
): Promise<unknown> {
  return client.requestNonSnap(
    "POST",
    "/ovo-emoney/v1/cancel",
    ovoBody(client, input, {
      batch_number: input.batch_number,
      trace_number: input.trace_number,
      reference_number: input.reference_number,
      approval_code: input.approval_code,
    }),
  );
}

// ---------------------------------------------------------------------------
// Generic SNAP debit payment host-to-host (DANA / ShopeePay / OVO SNAP e-money)
// ---------------------------------------------------------------------------

export interface DebitPaymentHostToHostRequest {
  /** Merchant invoice / reference number */
  partnerReferenceNo: string;
  /** ISO8601 datetime with offset, e.g. 2024-07-10T11:57:58+07:00 */
  validUpTo?: string;
  /** e.g. "app" */
  pointOfInitiation?: string;
  urlParam?: {
    url?: string;
    /** e.g. PAY_RETURN */
    type?: string;
    /** "Y" | "N" */
    isDeepLink?: string;
  };
  amount: {
    value: string;
    currency: string;
  };
  additionalInfo: {
    /** e.g. EMONEY_DANA_SNAP, EMONEY_OVO_SNAP, EMONEY_SHOPEEPAY_SNAP */
    channel: string;
    orderTitle?: string;
    supportDeepLinkCheckoutUrl?: string;
    [key: string]: unknown;
  };
}

/**
 * SNAP e-money payment — POST /direct-debit/core/v1/debit/payment-host-to-host
 * Signed with `secretKey` (per DOKU's E-Money host-to-host reference script).
 */
export async function debitPaymentHostToHost(
  client: DokuClient,
  body: DebitPaymentHostToHostRequest,
): Promise<unknown> {
  return client.requestSnap("POST", "/direct-debit/core/v1/debit/payment-host-to-host", { body });
}

// ---------------------------------------------------------------------------
// ShopeePay (Non-SNAP)
// ---------------------------------------------------------------------------

export interface ShopeePayCreateOrderRequest {
  order: {
    invoice_number: string;
    amount: number;
  };
}

/** ShopeePay order — POST /shopeepay-emoney/v2/order */
export async function shopeePayCreateOrder(
  client: DokuClient,
  body: ShopeePayCreateOrderRequest,
): Promise<unknown> {
  return client.requestNonSnap("POST", "/shopeepay-emoney/v2/order", body);
}
