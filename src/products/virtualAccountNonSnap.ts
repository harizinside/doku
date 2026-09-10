import type { DokuClient } from "../core/client.js";
import type { SettlementAdditionalInfo } from "./settlement.js";

/**
 * Legacy Non-SNAP Virtual Account APIs (v2 payment-code), one pair of
 * generate/update endpoints per bank. Paths and field sets follow the DOKU
 * Postman collection; required/optional annotations follow developers.doku.com
 * where the fields match (VA docs are per-bank pages).
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export interface VaOrder {
  /** Merchant invoice number that identifies the order. Max length: 64 */
  invoice_number: string;
  /** Payment amount. Optional for open-amount VAs (e.g. Mandiri NO_BILL) */
  amount?: number;
}

export interface VaCustomer {
  /** Customer name shown on the payment page/statement */
  name?: string;
  /** Customer email */
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
}

/** Shared virtual_account_info fields across banks (bank-specific fields below) */
interface VaInfoBase {
  /** VA expiry in minutes */
  expired_time?: number;
  /** true: VA can be paid multiple times */
  reusable_status?: boolean;
}

/** Shared response shape for VA generate/update (fields optional until verified per bank) */
export interface VaPaymentCodeResponse {
  order?: {
    invoice_number?: string;
    amount?: number | string;
    currency?: string;
  };
  customer?: VaCustomer;
  virtual_account_info?: {
    virtual_account_number?: string;
    created_date?: string;
    expired_date?: string;
    reusable_status?: boolean | string;
    billing_type?: string;
    [key: string]: unknown;
  };
  additional_info?: Record<string, unknown>;
  [key: string]: unknown;
}

function generate(client: DokuClient, path: string, body: object): Promise<VaPaymentCodeResponse> {
  return client.requestNonSnap("POST", path, body) as Promise<VaPaymentCodeResponse>;
}

function update(client: DokuClient, path: string, body: object): Promise<VaPaymentCodeResponse> {
  return client.requestNonSnap("PATCH", path, body) as Promise<VaPaymentCodeResponse>;
}

// ---------------------------------------------------------------------------
// Mandiri VA — /mandiri-virtual-account/v2/payment-code
// ---------------------------------------------------------------------------

export interface MandiriVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: {
    /** Mandiri-specific billing type, e.g. "NO_BILL" */
    billing_type?: string;
    reusable_status?: boolean;
  };
  customer?: VaCustomer;
  /** Route settlement to a Sub Account (wallet) */
  additional_info?: SettlementAdditionalInfo & {
    account?: {
      /** Sub Account id, e.g. SAC-2832-... */
      id?: string;
    };
  };
}

export interface MandiriVaUpdateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    /** VA number previously generated for this invoice */
    virtual_account_number?: string;
    billing_type?: string;
  };
  customer?: VaCustomer;
  additional_info?: SettlementAdditionalInfo & {
    account?: { id?: string };
  };
}

/** POST /mandiri-virtual-account/v2/payment-code */
export function mandiriGeneratePaymentCode(
  client: DokuClient,
  body: MandiriVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/mandiri-virtual-account/v2/payment-code", body);
}

/** PATCH /mandiri-virtual-account/v2/payment-code */
export function mandiriUpdatePaymentCode(
  client: DokuClient,
  body: MandiriVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/mandiri-virtual-account/v2/payment-code", body);
}

// ---------------------------------------------------------------------------
// BCA VA — /bca-virtual-account/v2/payment-code (MGPC: merchant provides the number)
// ---------------------------------------------------------------------------

export interface BcaVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    /** Full BCA VA number (company code + digits) */
    virtual_account_number?: string;
    /** e.g. "NO_BILL" */
    billing_type?: string;
  };
  customer?: VaCustomer;
}

export interface BcaVaUpdateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    virtual_account_number: string;
    /** Free-text info lines printed on the BCA statement */
    info1?: string;
    info2?: string;
    info3?: string;
  };
  customer?: VaCustomer;
}

/**
 * POST /bca-virtual-account/v2/payment-code
 *
 * Note: the source Postman collection has a copy-paste bug and points this
 * request at /bri-virtual-account/v2/merchant-payment-code (a path with no
 * corresponding BRI folder anywhere else in the collection). Verified against
 * DOKU's official docs (jokul.doku.com) that /bca-virtual-account/v2/payment-code
 * is correct here — same path as the update call below, just POST vs PATCH.
 */
export function bcaGeneratePaymentCode(
  client: DokuClient,
  body: BcaVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/bca-virtual-account/v2/payment-code", body);
}

/** PATCH /bca-virtual-account/v2/payment-code */
export function bcaUpdatePaymentCode(
  client: DokuClient,
  body: BcaVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/bca-virtual-account/v2/payment-code", body);
}

// ---------------------------------------------------------------------------
// BSI VA — /bsm-virtual-account/v2/payment-code
// ---------------------------------------------------------------------------

export interface BsiVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    info1?: string;
    info2?: string;
    info3?: string;
  };
  customer?: VaCustomer;
}

export interface BsiVaUpdateRequest extends BsiVaGenerateRequest {
  virtual_account_info: VaInfoBase & {
    virtual_account_number: string;
    info1?: string;
    info2?: string;
    info3?: string;
  };
}

/** POST /bsm-virtual-account/v2/payment-code */
export function bsiGeneratePaymentCode(
  client: DokuClient,
  body: BsiVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/bsm-virtual-account/v2/payment-code", body);
}

/** PATCH /bsm-virtual-account/v2/payment-code */
export function bsiUpdatePaymentCode(
  client: DokuClient,
  body: BsiVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/bsm-virtual-account/v2/payment-code", body);
}

// ---------------------------------------------------------------------------
// DOKU VA — /doku-virtual-account/v2/payment-code
// ---------------------------------------------------------------------------

export interface DokuVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    info1?: string;
    info2?: string;
    info3?: string;
  };
  customer?: VaCustomer;
}

export interface DokuVaUpdateRequest extends DokuVaGenerateRequest {
  virtual_account_info: VaInfoBase & {
    virtual_account_number: string;
    info1?: string;
    info2?: string;
    info3?: string;
  };
}

/** POST /doku-virtual-account/v2/payment-code */
export function dokuGeneratePaymentCode(
  client: DokuClient,
  body: DokuVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/doku-virtual-account/v2/payment-code", body);
}

/** PATCH /doku-virtual-account/v2/payment-code */
export function dokuUpdatePaymentCode(
  client: DokuClient,
  body: DokuVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/doku-virtual-account/v2/payment-code", body);
}

// ---------------------------------------------------------------------------
// Permata VA — /permata-virtual-account/v2/payment-code
// ---------------------------------------------------------------------------

export interface VaRefInfo {
  ref_name: string;
  ref_value: string;
}

export interface PermataVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    /** Custom reference info printed on the Permata statement */
    ref_info?: VaRefInfo[];
  };
  customer?: VaCustomer;
}

export interface PermataVaUpdateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    virtual_account_number: string;
    ref_info?: VaRefInfo[];
  };
  customer?: VaCustomer;
}

/** POST /permata-virtual-account/v2/payment-code */
export function permataGeneratePaymentCode(
  client: DokuClient,
  body: PermataVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/permata-virtual-account/v2/payment-code", body);
}

/** PATCH /permata-virtual-account/v2/payment-code */
export function permataUpdatePaymentCode(
  client: DokuClient,
  body: PermataVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/permata-virtual-account/v2/payment-code", body);
}

// ---------------------------------------------------------------------------
// CIMB VA — /cimb-virtual-account/v2/payment-code
// ---------------------------------------------------------------------------

export interface CimbVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    ref_info?: VaRefInfo[];
  };
  customer?: VaCustomer;
}

export interface CimbVaUpdateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    virtual_account_number: string;
    ref_info?: VaRefInfo[];
  };
  customer?: VaCustomer;
}

/** POST /cimb-virtual-account/v2/payment-code */
export function cimbGeneratePaymentCode(
  client: DokuClient,
  body: CimbVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/cimb-virtual-account/v2/payment-code", body);
}

/** PATCH /cimb-virtual-account/v2/payment-code */
export function cimbUpdatePaymentCode(
  client: DokuClient,
  body: CimbVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/cimb-virtual-account/v2/payment-code", body);
}

// ---------------------------------------------------------------------------
// BNI VA — /bni-virtual-account/v2/payment-code
// ---------------------------------------------------------------------------

export interface BniVaGenerateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    /**
     * BNI billing type, e.g. "FIXED".
     * NOTE: DOKU's API literally expects the misspelled key `biling_type`.
     */
    biling_type?: string;
    /** Product detail printed on the BNI statement */
    info?: string;
    /** Merchant-side unique reference */
    merchant_unique_reference?: string;
  };
  customer?: VaCustomer;
}

export interface BniVaUpdateRequest {
  order: VaOrder;
  virtual_account_info: VaInfoBase & {
    virtual_account_number: string;
    /** NOTE: DOKU's API literally expects the misspelled key `biling_type` */
    biling_type?: string;
    info?: string;
    merchant_unique_reference?: string;
  };
  customer?: VaCustomer;
}

/** POST /bni-virtual-account/v2/payment-code */
export function bniGeneratePaymentCode(
  client: DokuClient,
  body: BniVaGenerateRequest,
): Promise<VaPaymentCodeResponse> {
  return generate(client, "/bni-virtual-account/v2/payment-code", body);
}

/** PATCH /bni-virtual-account/v2/payment-code */
export function bniUpdatePaymentCode(
  client: DokuClient,
  body: BniVaUpdateRequest,
): Promise<VaPaymentCodeResponse> {
  return update(client, "/bni-virtual-account/v2/payment-code", body);
}
