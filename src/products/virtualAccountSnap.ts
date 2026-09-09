import type { DokuClient } from "../core/client.js";
import { partnerServiceId } from "../core/signature.js";

/**
 * SNAP Virtual Accounts (BI-SNAP create-va), one endpoint per bank.
 * Field set follows the DOKU Postman collection (richer body than the current
 * docs pages, which show a flatter SNAP v1.1 shape); signing per the SNAP docs.
 *
 * Headers sent automatically: X-PARTNER-ID, X-EXTERNAL-ID, X-TIMESTAMP,
 * X-SIGNATURE (HMAC-SHA512 with secretKey), Authorization (B2B), CHANNEL-ID.
 */

export interface SnapMoneyAmount {
  /** Amount string with 2 decimal places, e.g. "12500.00" */
  value: string;
  /** ISO 4217, e.g. "IDR" */
  currency: string;
}

export interface SnapVaBillDetail {
  billCode: string;
  billNo: string;
  billName: string;
  billShortName?: string;
  billDescription?: {
    english?: string;
    indonesia?: string;
  };
  billSubCompany?: string;
  billAmount?: SnapMoneyAmount;
  additionalInfo?: Record<string, unknown>;
}

export interface SnapVaFreeText {
  english?: string;
  indonesia?: string;
}

interface SnapVaBodyBase {
  /**
   * 8-char partner service id derived from the acquirer BIN
   * (left-padded with spaces — see `partnerServiceId()`).
   */
  partnerServiceId: string;
  /** Merchant transaction id / invoice number. Max length: 18 per BI-SNAP */
  trxId: string;
  /** "1": closed amount, "O": open amount */
  virtualAccountTrxType?: string;
  totalAmount: SnapMoneyAmount;
  /** ISO8601 datetime */
  expiredDate?: string;
  virtualAccountName?: string;
  virtualAccountEmail?: string;
  virtualAccountPhone?: string;
  billDetails?: SnapVaBillDetail[];
  freeTexts?: SnapVaFreeText[];
  additionalInfo?: {
    /** e.g. { reusableStatus: true, minAmount, maxAmount } */
    virtualAccountConfig?: {
      reusableStatus?: boolean;
      minAmount?: string;
      maxAmount?: string;
    };
    [key: string]: unknown;
  };
}

export type SnapCreateVaRequest = SnapVaBodyBase;

export interface SnapCreateVaResponse {
  responseCode?: string;
  responseMessage?: string;
  virtualAccountNo?: string;
  partnerServiceId?: string;
  customerNo?: string;
  virtualAccountName?: string;
  virtualAccountEmail?: string;
  virtualAccountPhone?: string;
  trxId?: string;
  totalAmount?: SnapMoneyAmount;
  expiredDate?: string;
  additionalInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

const CHANNEL_ID = "H2H";

async function createVa(
  client: DokuClient,
  path: string,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return client.requestSnap("POST", path, { body, channelId: CHANNEL_ID }) as Promise<SnapCreateVaResponse>;
}

// ---------------------------------------------------------------------------
// Banks sharing the standard DGPC body: /bi-snap-va/{bank}/v1/...
// (compute partnerServiceId with the `partnerServiceId(bin)` helper)
// ---------------------------------------------------------------------------

/** BNC — POST /virtual-accounts/bi-snap-va/v1/transfer-va/create-va */
export function bncCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/virtual-accounts/bi-snap-va/v1/transfer-va/create-va", body);
}

/** BNI — POST /virtual-accounts/bi-snap-va/v1/transfer-va/create-va */
export function bniCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/virtual-accounts/bi-snap-va/v1/transfer-va/create-va", body);
}

/** BSI — POST /bi-snap-va/bsi/v1/transfer-va/create-va */
export function bsiCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/bsi/v1/transfer-va/create-va", body);
}

/** BTN — POST /bi-snap-va/btn/v1/transfer-va/create-va */
export function btnCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/btn/v1/transfer-va/create-va", body);
}

/** DANAMON — POST /bi-snap-va/danamon/v1/transfer-va/create-va */
export function danamonCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/danamon/v1/transfer-va/create-va", body);
}

/** MANDIRI — POST /bi-snap-va/mandiri/v1/transfer-va/create-va */
export function mandiriSnapCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/mandiri/v1/transfer-va/create-va", body);
}

/** MAYBANK — POST /bi-snap-va/maybank/v1/transfer-va/create-va */
export function maybankCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/maybank/v1/transfer-va/create-va", body);
}

/** PERMATA — POST /bi-snap-va/permata/v1/transfer-va/create-va */
export function permataSnapCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/permata/v1/transfer-va/create-va", body);
}

/** SINARMAS — POST /bi-snap-va/sinarmas/v1/transfer-va/create-va */
export function sinarmasCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/sinarmas/v1/transfer-va/create-va", body);
}

/** CIMB — POST /bi-snap-va/cimb/v1/transfer-va/create-va */
export function cimbSnapCreateVa(
  client: DokuClient,
  body: SnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(client, "/bi-snap-va/cimb/v1/transfer-va/create-va", body);
}

// ---------------------------------------------------------------------------
// BRI (SNAP v1.1, MGPC-style open-amount VA)
// ---------------------------------------------------------------------------

export interface BriSnapCreateVaRequest {
  /** 8-char partner service id, e.g. partnerServiceId("02186") => "   02186" */
  partnerServiceId: string;
  trxId: string;
  /** Customer number appended to the partner service id to form the VA number */
  customerNo?: string;
  /** "O": open amount */
  virtualAccountTrxType?: string;
  totalAmount: SnapMoneyAmount;
  expiredDate?: string;
  virtualAccountName?: string;
  /** Full VA number, space-padded to 18 chars */
  virtualAccountNo?: string;
  additionalInfo?: {
    channel?: string;
    virtualAccountConfig?: {
      reusableStatus?: boolean;
      minAmount?: string;
      maxAmount?: string;
    };
    [key: string]: unknown;
  };
}

/** BRI — POST /virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va */
export function briSnapCreateVa(
  client: DokuClient,
  body: BriSnapCreateVaRequest,
): Promise<SnapCreateVaResponse> {
  return createVa(
    client,
    "/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va",
    body,
  );
}

export { partnerServiceId };
