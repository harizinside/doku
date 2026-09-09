import type { DokuClient } from "../core/client.js";
import type {
  SettlementAdditionalInfo,
  SettlementReportEntry,
  SettlementSplit,
} from "./settlement.js";

// Re-export so users can import settlement helpers from the checkout namespace too.
export type { SettlementAdditionalInfo, SettlementReportEntry, SettlementSplit };

/**
 * DOKU Checkout — Initiate Payment (Non-SNAP signing)
 * POST /checkout/v1/payment
 * docs.doku.com: DOKU Checkout > Integration Guide > Backend Integration.
 */

export type CheckoutPaymentMethodType =
  | "VIRTUAL_ACCOUNT_BCA"
  | "VIRTUAL_ACCOUNT_BANK_MANDIRI"
  | "VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI"
  | "VIRTUAL_ACCOUNT_DOKU"
  | "VIRTUAL_ACCOUNT_BRI"
  | "VIRTUAL_ACCOUNT_BNI"
  | "VIRTUAL_ACCOUNT_BANK_PERMATA"
  | "VIRTUAL_ACCOUNT_BANK_CIMB"
  | "VIRTUAL_ACCOUNT_BANK_DANAMON"
  | "VIRTUAL_ACCOUNT_BNC"
  | "VIRTUAL_ACCOUNT_BTN"
  | "VIRTUAL_ACCOUNT_SINARMAS"
  | "ONLINE_TO_OFFLINE_ALFA"
  | "ONLINE_TO_OFFLINE_INDOMARET"
  | "CREDIT_CARD"
  | "DIRECT_DEBIT_BRI"
  | "DIRECT_DEBIT_CIMB"
  | "DIRECT_DEBIT_ALLO"
  | "EMONEY_SHOPEEPAY"
  | "EMONEY_OVO"
  | "EMONEY_DANA"
  | "QRIS"
  | "PEER_TO_PEER_AKULAKU"
  | "PEER_TO_PEER_KREDIVO"
  | "PEER_TO_PEER_INDODANA"
  | (string & {});

export interface CheckoutLineItem {
  /** Conditional: mandatory for Akulaku, Kredivo, Indodana, Allobank. Max length: 64 */
  id?: string;
  /** Conditional: mandatory for Jenius, Kredivo, Indodana, KKI, Akulaku, Allobank */
  name?: string;
  /** Conditional: must total `order.amount` together with quantity */
  price?: number;
  /** Conditional */
  quantity?: number;
  /** Conditional: mandatory for Akulaku, Kredivo, Indodana */
  sku?: string;
  /** Conditional: mandatory for Akulaku, Kredivo, Indodana */
  category?: string;
  /** Conditional: mandatory for Kredivo */
  url?: string;
  /** Conditional: mandatory for Indodana */
  image_url?: string;
  /** Conditional: mandatory for Indodana, Kredivo */
  type?: string;
}

export interface CheckoutRequest {
  order: {
    /** In IDR and without decimal. Max length: 12 */
    amount: number;
    /** Max length: 64 (30 with Credit Card; no symbols for KKI) */
    invoice_number: string;
    /** 3-letter ISO 4217. Default: IDR */
    currency?: string;
    /** Conditional: mandatory for Jenius ("Back to Merchant" button) */
    callback_url?: string;
    /** Conditional: only for Indodana */
    callback_url_cancel?: string;
    /** "Back to merchant" button on the result page */
    callback_url_result?: string;
    /** Checkout page default language. Max length: 2 */
    language?: string;
    /** true: result page redirects to callback URL */
    auto_redirect?: boolean;
    /** Only applied for Credit Card, DOKU Wallet, Akulaku, OVO, ShopeePay when true */
    disable_retry_payment?: boolean;
    /** Only for VA, O2O, Credit Card */
    recover_abandoned_cart?: boolean;
    /** Only for VA, O2O, Credit Card. Max: 44640 minutes */
    expired_recovered_cart?: number;
    line_items?: CheckoutLineItem[];
  };
  payment: {
    /** Checkout page due date in minutes. Default: 60. Max length: 6 */
    payment_due_date?: number;
    /** Only for Credit Card: SALE | INSTALLMENT | AUTHORIZE */
    type?: "SALE" | "INSTALLMENT" | "AUTHORIZE" | (string & {});
    /** Omit to show all activated payment methods on the Checkout page */
    payment_method_types?: CheckoutPaymentMethodType[];
  };
  customer?: {
    /** Conditional: mandatory for tokenization (BRI DD, Allobank, CC) and Akulaku. Max length: 50 */
    id?: string;
    /** Conditional: mandatory for Jenius, Akulaku, Indodana, Kredivo. Max length: 255 */
    name?: string;
    last_name?: string;
    /** Conditional: mandatory for Indodana, Kredivo, Allobank. Max length: 128 */
    email?: string;
    /** Conditional: mandatory for Indodana, Akulaku, Kredivo. Format: {calling_code}{number}. Max length: 16 */
    phone?: string;
    /** Conditional: mandatory for Akulaku. Max length: 400 */
    address?: string;
    /** Conditional: mandatory for Akulaku */
    postcode?: string;
    /** Conditional: mandatory for Akulaku */
    state?: string;
    /** Conditional: mandatory for Akulaku */
    city?: string;
    /** 2-letter ISO 3166-1 */
    country?: string;
  };
  /** Conditional: mandatory for Kredivo and Indodana */
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    phone?: string;
    country_code?: string;
  };
  /** Conditional: mandatory for Indodana */
  billing_address?: {
    first_name?: string;
    last_name?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    phone?: string;
    country_code?: string;
  };
  additional_info?: SettlementAdditionalInfo & {
    /** Installment tenors allowed on the page (0, 3, 6, 12) */
    allow_tenor?: number[];
    /** Only for DOKU Wallet */
    doku_wallet_notify_url?: string;
    /** Overrides the notification URL configured in the Back Office */
    override_notification_url?: string;
  };
}

export interface CheckoutResponse {
  message?: string[];
  response?: {
    order?: {
      amount?: string | number;
      invoice_number?: string;
      currency?: string;
      session_id?: string;
      callback_url?: string;
      callback_url_cancel?: string;
      callback_url_result?: string;
      language?: string;
      auto_redirect?: boolean;
      disable_retry_payment?: boolean;
      recover_abandoned_cart?: boolean;
      expired_recovered_cart?: number;
      line_items?: CheckoutLineItem[];
    };
    payment?: {
      payment_method_types?: string[];
      payment_due_date?: number;
      token_id?: string;
      /** Checkout page URL to show the customer */
      url?: string;
      /** yyyyMMddHHmmss, UTC+7 */
      expired_date?: string;
    };
    customer?: Record<string, unknown>;
    shipping_address?: Record<string, unknown>;
    billing_address?: Record<string, unknown>;
    additional_info?: Record<string, unknown>;
    uuid?: string;
    headers?: Record<string, unknown>;
  };
}

/** Initiate a DOKU Checkout payment and get back the Checkout page URL. */
export async function initiateCheckoutPayment(
  client: DokuClient,
  body: CheckoutRequest,
): Promise<CheckoutResponse> {
  return client.requestNonSnap("POST", "/checkout/v1/payment", body) as Promise<CheckoutResponse>;
}
