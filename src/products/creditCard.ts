import type { DokuClient } from "../core/client.js";

/**
 * Credit Card (Non-SNAP): Payment Page + Refund.
 * docs.doku.com: Direct API > Non-SNAP > Card.
 */

export interface CreditCardPaymentPageRequest {
  order: {
    /** In IDR and without decimal */
    amount: number;
    /** Max length: 64 (30 for Mandiri acquirer) */
    invoice_number: string;
    line_items?: Array<{
      name?: string;
      price?: number;
      quantity?: number;
    }>;
    /** Conditional: mandatory when `auto_redirect` is true */
    callback_url?: string;
    /** Redirect target on failure; defaults to callback_url */
    failed_url?: string;
    /** Redirection to callback_url after payment completes. Default: false */
    auto_redirect?: boolean;
    /** Custom statement descriptor (max 22 chars; must be activated by DOKU first) */
    descriptor?: string;
    session_id?: string;
  };
  customer?: {
    /** Conditional: mandatory for tokenization */
    id?: string;
    name?: string;
    /** Conditional: mandatory if phone is blank */
    email?: string;
    /** Conditional: mandatory if email is blank. Format: {calling_code}{number} */
    phone?: string;
    address?: string;
    country?: string;
    city?: string;
  };
  /** Conditional: for AUTHORIZE / INSTALLMENT flows */
  payment?: {
    /** Conditional: mandatory if you support multiple card transaction types */
    type?: "SALE" | "AUTHORIZE" | "INSTALLMENT" | (string & {});
    /** true: capture immediately after AUTHORIZE (behaves like SALE) */
    auto_capture?: boolean;
    /** Conditional: mandatory for INSTALLMENT (BNI, BRI, BANK_CIMB, BANK_MANDIRI, BCA, ...) */
    acquirer?: string;
    /** Conditional: mandatory for INSTALLMENT */
    tenor?: number;
  };
  /** Card tokenization (pre-fill / force save) */
  card?: {
    /** Pre-fills the card number field */
    token?: string;
    /** Force the customer to save the card token for the next payment */
    save?: boolean;
  };
  override_configuration?: {
    themes?: {
      /** EN (default) | ID */
      language?: string;
      background_color?: string;
      font_color?: string;
      button_background_color?: string;
      button_font_color?: string;
    };
    promo?: Array<{
      /** BIN that gets the promo (6 or 8 digits) */
      bin?: string;
      /** final amount = order.amount - discount_amount */
      discount_amount?: number;
    }>;
    /** Only accept these BINs (6 or 8 digits) */
    allow_bin?: number[];
    /** Only accept these installment tenors */
    allow_tenor?: number[];
  };
  additional_info?: {
    override_notification_url?: string;
    disclaimer?: {
      id?: Record<string, unknown>;
      en?: Record<string, unknown>;
    };
  };
}

export interface CreditCardPaymentPageResponse {
  order?: {
    invoice_number?: string;
    line_items?: Array<Record<string, unknown>>;
  };
  credit_card_payment_page?: {
    /** Card payment page URL to show the customer */
    url?: string;
  };
  credit_card_js?: {
    session_id?: string;
    payment_plan_codes?: Array<Record<string, unknown>>;
  };
}

/**
 * Generate a hosted Credit Card payment page — POST /credit-card/v1/payment-page
 * (docs path confirmed; the bundled Postman collection uses the same path).
 */
export async function generateCreditCardPaymentPage(
  client: DokuClient,
  body: CreditCardPaymentPageRequest,
): Promise<CreditCardPaymentPageResponse> {
  return client.requestNonSnap(
    "POST",
    "/credit-card/v1/payment-page",
    body,
  ) as Promise<CreditCardPaymentPageResponse>;
}

export interface CreditCardRefundRequest {
  order: {
    /** Invoice number of the transaction being refunded */
    invoice_number: string;
  };
  payment: {
    /** Request ID from the payment initiation (or Capture) of the original transaction */
    original_request_id: string;
  };
  refund: {
    /** Amount to refund; partial refunds allowed until the original amount is reached */
    amount: number;
  };
}

export interface CreditCardRefundResponse {
  order?: { invoice_number?: string };
  payment?: { original_request_id?: string };
  refund?: {
    amount?: number;
    reason?: string;
    type?: "VOID" | "PARTIAL_REFUND" | "FULL_REFUND" | "MANUAL_PARTIAL_REFUND" | "MANUAL_FULL_REFUND";
    status?: "SUCCESS" | "FAILED";
    message?: string;
    approval_code?: string;
  };
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
}

/**
 * Online void / refund — POST /credit-card/v1/cancellation/credit-card/refund
 *
 * NOTE: docs.doku.com currently documents `/cancellation/credit-card/refund` (no
 * /credit-card/v1 prefix) while the DOKU Postman collection uses
 * `/credit-card/v1/cancellation/credit-card/refund`; this SDK follows the collection
 * (verified against the user's sandbox export).
 */
export async function refundCreditCard(
  client: DokuClient,
  body: CreditCardRefundRequest,
): Promise<CreditCardRefundResponse> {
  return client.requestNonSnap(
    "POST",
    "/credit-card/v1/cancellation/credit-card/refund",
    body,
  ) as Promise<CreditCardRefundResponse>;
}
