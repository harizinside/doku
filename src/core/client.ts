import { randomUUID } from "node:crypto";
import { DokuApiError, httpRequest, type HttpResult } from "./http.js";
import {
  type VerifyNotificationInput,
  verifyNotificationSignature,
} from "./notification.js";
import {
  nonSnapTimestamp,
  signNonSnap,
  signSnapRequest,
  signSnapToken,
  snapTimestamp,
} from "./signature.js";

export type DokuEnv = "sandbox" | "production";

export interface DokuClientConfig {
  clientId: string;
  /** Secret Key from DOKU Back Office — used for Non-SNAP HMAC-SHA256 and most SNAP HMAC-SHA512 signing */
  secretKey: string;
  /** RSA private key (PKCS#8 PEM) — required for SNAP access-token requests */
  privateKey?: string;
  /**
   * Separate shared key for SNAP Direct Debit / KKI symmetric signing, if DOKU issued one.
   * Defaults to `secretKey` (the collection's `shared_key` variable is usually the same secret).
   */
  sharedKey?: string;
  env?: DokuEnv;
  /** Override the base URL for the main API host (defaults per `env`) */
  baseUrl?: string;
  /**
   * Override the base URL for Finance/Settlement endpoints. The docs show
   * `https://{sandbox|production}.doku.com/fc-h2h-api` as a placeholder, so the exact
   * host is unconfirmed; `releaseSettlement` (confirmed) uses the main API host.
   */
  financeBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const TOKEN_REFRESH_MARGIN_MS = 30_000;
const DEFAULT_TOKEN_TTL_MS = 14 * 60 * 1000;

function defaultBaseUrl(env: DokuEnv): string {
  return env === "production" ? "https://api.doku.com" : "https://api-sandbox.doku.com";
}

/**
 * The only class users touch. Product functions are standalone and take a DokuClient
 * as their first argument; `index.ts` groups them into namespaces on the instance.
 */
export class DokuClient {
  readonly config: Required<Pick<DokuClientConfig, "clientId" | "secretKey">> &
    Pick<DokuClientConfig, "privateKey" | "sharedKey" | "financeBaseUrl" | "fetchImpl"> &
    Required<Pick<DokuClientConfig, "env" | "baseUrl">>;

  private b2bToken?: CachedToken;
  private b2b2cTokens = new Map<string, CachedToken>();

  constructor(config: DokuClientConfig) {
    const env = config.env ?? "sandbox";
    this.config = {
      clientId: config.clientId,
      secretKey: config.secretKey,
      privateKey: config.privateKey,
      sharedKey: config.sharedKey ?? config.secretKey,
      env,
      baseUrl: config.baseUrl ?? defaultBaseUrl(env),
      financeBaseUrl: config.financeBaseUrl,
      fetchImpl: config.fetchImpl,
    };
  }

  get financeApiBase(): string {
    return this.config.financeBaseUrl ?? this.config.baseUrl.replace(/\/$/, "");
  }

  private async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<HttpResult> {
    return httpRequest({
      method,
      url,
      headers,
      body: body === "" ? undefined : body,
      fetchImpl: this.config.fetchImpl,
    });
  }

  /**
   * Non-SNAP request (Client-Id / Request-Id / Request-Timestamp / Signature).
   * `targetPath` must start with "/" (e.g. "/mandiri-virtual-account/v2/payment-code").
   * `baseUrlOverride` swaps the host while keeping `targetPath` as the signed Request-Target
   * (used for the Finance/Settlement fc-h2h-api host).
   */
  async requestNonSnap(
    method: string,
    targetPath: string,
    body?: object,
    baseUrlOverride?: string,
  ): Promise<unknown> {
    const requestId = randomUUID();
    const requestTimestamp = nonSnapTimestamp();
    const rawBody = body === undefined ? undefined : JSON.stringify(body, null, 2);
    const signature = signNonSnap({
      clientId: this.config.clientId,
      requestId,
      requestTimestamp,
      requestTarget: targetPath,
      body: rawBody,
      secretKey: this.config.secretKey,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Id": this.config.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": requestTimestamp,
      Signature: signature,
    };
    const base = baseUrlOverride ?? this.config.baseUrl;
    const result = await this.send(method, base + targetPath, headers, rawBody);
    return result.body;
  }

  /**
   * Fetch (and cache) a SNAP B2B access token.
   */
  async snapB2BToken(force = false): Promise<string> {
    const cached = this.b2bToken;
    if (!force && cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    const { token, expiresInMs } = await this.fetchSnapToken("b2b", {
      grantType: "client_credentials",
    });
    this.b2bToken = {
      token,
      expiresAt: Date.now() + Math.min(expiresInMs, 60 * 60 * 1000),
    };
    return token;
  }

  /**
   * Fetch (and cache per authCode) a SNAP B2B2C customer token.
   */
  async snapB2B2CToken(authCode: string): Promise<string> {
    const cached = this.b2b2cTokens.get(authCode);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    const { token, expiresInMs } = await this.fetchSnapToken("b2b2c", {
      grantType: "authorization_code",
      authCode,
    });
    this.b2b2cTokens.set(authCode, {
      token,
      expiresAt: Date.now() + Math.min(expiresInMs, 60 * 60 * 1000),
    });
    return token;
  }

  private async fetchSnapToken(
    kind: "b2b" | "b2b2c",
    body: Record<string, string>,
  ): Promise<{ token: string; expiresInMs: number }> {
    if (!this.config.privateKey) {
      throw new DokuApiError(
        `DokuClientConfig.privateKey is required for SNAP ${kind} token requests`,
        0,
        undefined,
        {},
      );
    }
    const targetPath = `/authorization/v1/access-token/${kind}`;
    const timestamp = snapTimestamp();
    const xSignature = signSnapToken({
      clientId: this.config.clientId,
      timestamp,
      privateKey: this.config.privateKey,
    });
    const result = await this.send(
      "POST",
      this.config.baseUrl + targetPath,
      {
        "Content-Type": "application/json",
        "X-CLIENT-KEY": this.config.clientId,
        "X-TIMESTAMP": timestamp,
        "X-SIGNATURE": xSignature,
      },
      JSON.stringify(body, null, 2),
    );
    const parsed = (result.body ?? {}) as {
      accessToken?: string;
      expiresIn?: string | number;
    };
    if (!parsed.accessToken) {
      throw new DokuApiError(
        `DOKU SNAP ${kind} token response did not contain accessToken`,
        result.status,
        result.body,
        result.headers,
      );
    }
    const expiresInSec = Number(parsed.expiresIn);
    const expiresInMs = Number.isFinite(expiresInSec) && expiresInSec > 0
      ? expiresInSec * 1000 - TOKEN_REFRESH_MARGIN_MS
      : DEFAULT_TOKEN_TTL_MS;
    return { token: parsed.accessToken, expiresInMs };
  }

  /**
   * SNAP resource request (X-PARTNER-ID / X-EXTERNAL-ID / X-TIMESTAMP / X-SIGNATURE / Authorization).
   */
  async requestSnap(
    method: string,
    targetPath: string,
    options: {
      body?: object;
      /** Value for the CHANNEL-ID header (some SNAP endpoints require it) */
      channelId?: string;
      /** B2B2C customer token; when set, adds `Authorization-Customer: Bearer ...` */
      customerToken?: string;
      /** Sign with `sharedKey` instead of `secretKey` (Direct Debit / KKI) */
      useSharedKey?: boolean;
    } = {},
  ): Promise<unknown> {
    const accessToken = await this.snapB2BToken();
    const timestamp = snapTimestamp();
    const rawBody = options.body === undefined ? "" : JSON.stringify(options.body, null, 2);
    const xSignature = signSnapRequest({
      httpMethod: method.toUpperCase(),
      endpointUrl: targetPath,
      accessToken,
      body: rawBody,
      timestamp,
      clientSecret: options.useSharedKey ? this.config.sharedKey! : this.config.secretKey,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-PARTNER-ID": this.config.clientId,
      "X-EXTERNAL-ID": randomUUID(),
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": xSignature,
      Authorization: `Bearer ${accessToken}`,
    };
    if (options.channelId !== undefined) {
      headers["CHANNEL-ID"] = options.channelId;
    }
    if (options.customerToken !== undefined) {
      headers["Authorization-Customer"] = `Bearer ${options.customerToken}`;
    }
    const result = await this.send(
      method,
      this.config.baseUrl + targetPath,
      headers,
      rawBody === "" ? undefined : rawBody,
    );
    return result.body;
  }

  /**
   * Verify a DOKU HTTP Notification's `Signature` header using this client's
   * secret key. See `verifyNotificationSignature` for details; `parseDokuNotification`
   * (exported from the package root) parses the body once verified.
   */
  verifyNotification(input: Omit<VerifyNotificationInput, "secretKey">): boolean {
    return verifyNotificationSignature({ ...input, secretKey: this.config.secretKey });
  }
}
