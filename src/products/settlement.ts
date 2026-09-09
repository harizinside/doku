import type { DokuClient } from "../core/client.js";

// ---------------------------------------------------------------------------
// Shared additional_info types (documented as generic Direct-API fields, not
// specific to one product). Reuse these wherever `additional_info` appears.
// ---------------------------------------------------------------------------

/**
 * Split Settlement rule (docs.doku.com: Finance and Settlement > Split Settlement).
 * Split is calculated on the *net* settlement amount (order amount minus fees).
 */
export interface SettlementSplit {
  /** Bank Settlement ID retrieved from the DOKU Back Office (e.g. SBS-1004-...) */
  bank_account_settlement_id: string;
  /** Exact IDR amount when `type` is FIX, or the percentage when PERCENTAGE */
  value: number | string;
  type: "FIX" | "PERCENTAGE";
}

/** Custom Settlement Report column (docs: Finance and Settlement > Custom Settlement Report) */
export interface SettlementReportEntry {
  /** Column name in the settlement report export. Max length: 64 */
  key: string;
  /** Column value for the transaction. Max length: 128 */
  value: string;
}

/**
 * Generic Direct-API `additional_info` extension for settlement features.
 * Documented for Checkout but valid wherever `additional_info` is accepted.
 */
export interface SettlementAdditionalInfo {
  /** Hold & Release: defer the payout for this payment until released via `releaseSettlement` */
  hold_settlement?: boolean;
  /** Split Settlement: route the net settlement amount to one or more sub bank accounts */
  settlement?: SettlementSplit[];
  /** Custom Settlement Report: extra columns in the settlement report export */
  report?: SettlementReportEntry[];
}

// ---------------------------------------------------------------------------
// Split Settlement (host-to-host, Non-SNAP signing)
// ---------------------------------------------------------------------------

export interface SplitSettlementQuery {
  /** Transaction invoice number */
  invoice_number: string;
  /** Transaction date in ISO-8601 */
  transaction_date: string;
  amount: number;
}

export interface SplitSettlementCheckStatusItem {
  bank_account_settlement_id?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  value?: number;
  type?: string;
}

export interface SplitSettlementEditRequest extends SplitSettlementQuery {
  /** At least 1 entry; empty arrays are rejected by DOKU */
  split_transaction_bank_account: SettlementSplit[];
}

export interface SplitSettlementCancelResponse {
  invoice_number?: string;
  /** Reformatted to yyyy-MM-dd by DOKU */
  transaction_date?: string;
  amount?: number;
}

/**
 * Check Status of Split Settlement — POST /v1/split-settlement/check-status
 *
 * docs.doku.com: Finance and Settlement > Split Settlement. Non-SNAP signing.
 * NOTE: the docs show the base host only as the placeholder
 * `{sandbox|production}.doku.com/fc-h2h-api`; if your integration uses a concrete
 * host, pass `financeBaseUrl` to DokuClient (e.g. "https://api-sandbox.doku.com/fc-h2h-api").
 */
export async function splitSettlementCheckStatus(
  client: DokuClient,
  body: SplitSettlementQuery,
): Promise<SplitSettlementCheckStatusItem[]> {
  const base = client.config.financeBaseUrl ?? client.financeApiBase;
  const result = (await client.requestNonSnap(
    "POST",
    "/v1/split-settlement/check-status",
    body as unknown as Record<string, unknown>,
    base,
  )) as SplitSettlementCheckStatusItem[];
  return result;
}

/**
 * Edit Split Settlement of an unbatched pending transaction — POST /v1/split-settlement/edit
 * (same host caveat as `splitSettlementCheckStatus`).
 */
export async function splitSettlementEdit(
  client: DokuClient,
  body: SplitSettlementEditRequest,
): Promise<SplitSettlementCheckStatusItem[]> {
  const base = client.config.financeBaseUrl ?? client.financeApiBase;
  const result = (await client.requestNonSnap(
    "POST",
    "/v1/split-settlement/edit",
    body as unknown as Record<string, unknown>,
    base,
  )) as SplitSettlementCheckStatusItem[];
  return result;
}

/**
 * Cancel Split Settlement of a transaction — POST /v1/split-settlement/cancel
 * (same host caveat as `splitSettlementCheckStatus`).
 */
export async function splitSettlementCancel(
  client: DokuClient,
  body: SplitSettlementQuery,
): Promise<SplitSettlementCancelResponse> {
  const base = client.config.financeBaseUrl ?? client.financeApiBase;
  const result = (await client.requestNonSnap(
    "POST",
    "/v1/split-settlement/cancel",
    body as unknown as Record<string, unknown>,
    base,
  )) as SplitSettlementCancelResponse;
  return result;
}

// ---------------------------------------------------------------------------
// Hold & Release Settlement
// ---------------------------------------------------------------------------

export interface ReleaseSettlementRequest {
  order: {
    /** Same invoice number as the original payment initiation */
    invoice_number: string;
    /** Same amount as the original payment initiation */
    amount: number;
    /** Same currency as the original payment. Default: IDR */
    currency?: string;
  };
  transaction: {
    /** The Request-Id sent when the payment was initiated */
    original_request_id: string;
  };
  /** Override the split settlement rule at release time */
  override_settlement?: SettlementSplit[];
}

export interface ReleaseSettlementResponse {
  order?: {
    invoice_number?: string;
    amount?: number;
    currency?: string;
  };
  transaction?: {
    original_request_id?: string;
  };
}

/**
 * Release a held settlement — POST {api|api-sandbox}.doku.com/finance/v1/release
 * (host confirmed by docs.doku.com: Finance and Settlement > Hold and Release Settlement).
 * The payment must have been initiated with `additional_info.hold_settlement: true`.
 */
export async function releaseSettlement(
  client: DokuClient,
  body: ReleaseSettlementRequest,
): Promise<ReleaseSettlementResponse> {
  const result = (await client.requestNonSnap(
    "POST",
    "/finance/v1/release",
    body as unknown as Record<string, unknown>,
    client.financeApiBase,
  )) as ReleaseSettlementResponse;
  return result;
}
