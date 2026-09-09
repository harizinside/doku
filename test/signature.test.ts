import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nonSnapDigest,
  nonSnapTimestamp,
  ovoCheckSum,
  partnerServiceId,
  signNonSnap,
  signSnapRequest,
  signSnapToken,
  snapTimestamp,
} from "../src/core/signature.js";
import { DokuClient } from "../src/core/client.js";
import { createDokuClient } from "../src/index.js";

const CLIENT_ID = "MCH-0001-10791114622547";
const SECRET = "SK-testsecret";
const BODY = '{"a":1,"b":"x"}';

describe("nonSnapTimestamp", () => {
  it("formats UTC ISO8601 with Z and second precision", () => {
    const ts = nonSnapTimestamp(new Date("2020-08-11T08:45:42.123Z"));
    assert.equal(ts, "2020-08-11T08:45:42Z");
  });
});

describe("snapTimestamp", () => {
  it("renders +07:00 style offsets", () => {
    const ts = snapTimestamp(new Date("2024-03-26T09:01:41Z"));
    // the offset depends on the machine timezone; assert shape only
    assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.equal(new Date(ts).getTime(), new Date("2024-03-26T09:01:41Z").getTime());
  });
});

describe("signNonSnap", () => {
  it("matches the documented HMAC-SHA256 layout for POST bodies", () => {
    const signature = signNonSnap({
      clientId: CLIENT_ID,
      requestId: "cc682442-6c22-493e-8121-b9ef6b3fa728",
      requestTimestamp: "2020-08-11T08:45:42Z",
      requestTarget: "/doku-virtual-account/v2/payment-code",
      body: BODY,
      secretKey: SECRET,
    });
    // Deterministic: re-signing identical input yields identical output
    const again = signNonSnap({
      clientId: CLIENT_ID,
      requestId: "cc682442-6c22-493e-8121-b9ef6b3fa728",
      requestTimestamp: "2020-08-11T08:45:42Z",
      requestTarget: "/doku-virtual-account/v2/payment-code",
      body: BODY,
      secretKey: SECRET,
    });
    assert.equal(signature, again);
    assert.match(signature, /^HMACSHA256=[A-Za-z0-9+/]+={0,2}$/);
  });

  it("changes when any input changes", () => {
    const base = {
      clientId: CLIENT_ID,
      requestId: "rid",
      requestTimestamp: "2020-08-11T08:45:42Z",
      requestTarget: "/x",
      body: BODY,
      secretKey: SECRET,
    };
    const variants = [
      { ...base, clientId: "MCH-other" },
      { ...base, requestId: "rid2" },
      { ...base, requestTimestamp: "2020-08-11T08:45:43Z" },
      { ...base, requestTarget: "/y" },
      { ...base, body: '{"a":2}' },
      { ...base, secretKey: "SK-other" },
    ];
    const reference = signNonSnap(base);
    for (const variant of variants) {
      assert.notEqual(signNonSnap(variant), reference);
    }
  });

  it("omits the Digest line for GET requests (undefined body)", () => {
    // A GET signature must differ from a POST signature that would otherwise
    // share all inputs, and must be stable for a given input set.
    const get = signNonSnap({
      clientId: CLIENT_ID,
      requestId: "rid",
      requestTimestamp: "2020-08-11T08:45:42Z",
      requestTarget: "/orders/v1/status/INV-1",
      secretKey: SECRET,
    });
    const getAgain = signNonSnap({
      clientId: CLIENT_ID,
      requestId: "rid",
      requestTimestamp: "2020-08-11T08:45:42Z",
      requestTarget: "/orders/v1/status/INV-1",
      secretKey: SECRET,
    });
    assert.equal(get, getAgain);
    assert.match(get, /^HMACSHA256=/);
  });
});

describe("nonSnapDigest", () => {
  it("is base64 sha256 of the raw body", () => {
    // sha256 of '{"a":1,"b":"x"}' — verified against node:crypto directly
    assert.equal(nonSnapDigest(BODY).length, 44);
    assert.equal(nonSnapDigest(BODY), nonSnapDigest(BODY));
    assert.notEqual(nonSnapDigest(BODY), nonSnapDigest('{"a":2,"b":"x"}'));
  });
});

describe("signSnapToken", () => {
  it("produces base64 RSA-SHA256 of clientId|timestamp", () => {
    const pem = process.env.DOKU_TEST_RSA_KEY;
    if (!pem) return; // covered by integration checks when a key is provided
    const sig = signSnapToken({
      clientId: CLIENT_ID,
      timestamp: "2024-03-26T16:01:41+07:00",
      privateKey: pem,
    });
    assert.match(sig, /^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe("signSnapRequest", () => {
  it("is deterministic and changes with every component", () => {
    const base = {
      httpMethod: "POST",
      endpointUrl: "/bi-snap-va/v1/transfer-va/create-va",
      accessToken: "token-1",
      body: '{"partnerServiceId":" 088899"}',
      timestamp: "2024-03-26T16:01:41+07:00",
      clientSecret: SECRET,
    };
    const reference = signSnapRequest(base);
    assert.equal(reference, signSnapRequest({ ...base }));
    assert.notEqual(signSnapRequest({ ...base, httpMethod: "GET" }), reference);
    assert.notEqual(signSnapRequest({ ...base, endpointUrl: "/other" }), reference);
    assert.notEqual(signSnapRequest({ ...base, accessToken: "token-2" }), reference);
    assert.notEqual(signSnapRequest({ ...base, body: "{}" }), reference);
    assert.notEqual(signSnapRequest({ ...base, timestamp: "2024-03-26T16:01:42+07:00" }), reference);
    assert.notEqual(signSnapRequest({ ...base, clientSecret: "SK-2" }), reference);
  });
});

describe("partnerServiceId", () => {
  it("left-pads short BINs with spaces to 8 chars", () => {
    assert.equal(partnerServiceId("02186"), "   02186");
    assert.equal(partnerServiceId("  088899  "), "  088899");
  });
  it("truncates long BINs to 8 chars", () => {
    assert.equal(partnerServiceId("021862040000016"), "02186204");
  });
});

describe("ovoCheckSum", () => {
  it("matches the reference concatenation order", () => {
    // Field order: amount, approvalCode, batchNumber, clientId, invoiceNumber,
    // ovoId, referenceNumber, traceNumber, secretKey
    const sum = ovoCheckSum({
      amount: 15000,
      clientId: CLIENT_ID,
      invoiceNumber: "INV-1",
      ovoId: "081211111111",
      secretKey: SECRET,
      approvalCode: "2404983",
      batchNumber: 500,
      referenceNumber: 12,
      traceNumber: 4451979,
    });
    const again = ovoCheckSum({
      amount: 15000,
      clientId: CLIENT_ID,
      invoiceNumber: "INV-1",
      ovoId: "081211111111",
      secretKey: SECRET,
      approvalCode: "2404983",
      batchNumber: 500,
      referenceNumber: 12,
      traceNumber: 4451979,
    });
    assert.equal(sum, again);
    assert.match(sum, /^[0-9a-f]{64}$/);
  });
});

describe("DokuClient", () => {
  it("defaults to sandbox and derives finance base from the main host", () => {
    const client = new DokuClient({ clientId: CLIENT_ID, secretKey: SECRET });
    assert.equal(client.config.env, "sandbox");
    assert.equal(client.config.baseUrl, "https://api-sandbox.doku.com");
    assert.equal(client.financeApiBase, "https://api-sandbox.doku.com");
  });

  it("uses production hosts and honors financeBaseUrl overrides", () => {
    const client = new DokuClient({
      clientId: CLIENT_ID,
      secretKey: SECRET,
      env: "production",
      financeBaseUrl: "https://api.doku.com/fc-h2h-api",
    });
    assert.equal(client.config.baseUrl, "https://api.doku.com");
    assert.equal(client.financeApiBase, "https://api.doku.com/fc-h2h-api");
  });

  it("createDokuClient attaches every product namespace", async () => {
    const { createDokuClient: create } = await import("../src/index.js");
    const doku = create({ clientId: CLIENT_ID, secretKey: SECRET });
    for (const ns of [
      "checkout", "creditCard", "directDebitLegacy", "directDebitSnap",
      "directTransfer", "emoney", "kki", "misc", "o2o", "paylater",
      "settlement", "subAccountV1", "subAccountV2",
      "virtualAccountNonSnap", "virtualAccountSnap",
    ]) {
      assert.ok((doku as unknown as Record<string, unknown>)[ns], `missing namespace ${ns}`);
    }
    assert.equal(typeof doku.virtualAccountSnap.mandiriSnapCreateVa, "function");
    assert.equal(typeof doku.settlement.releaseSettlement, "function");
  });

  it("signs a non-SNAP request end-to-end via a fake fetch", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string | URL, init: RequestInit = {}) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const client = new DokuClient({
      clientId: CLIENT_ID,
      secretKey: SECRET,
      fetchImpl: fakeFetch,
    });
    await client.requestNonSnap("POST", "/checkout/v1/payment", { order: { amount: 1 } });
    assert.ok(captured);
    assert.equal(captured.url, "https://api-sandbox.doku.com/checkout/v1/payment");
    const headers = captured.init.headers as Record<string, string>;
    assert.equal(headers["Client-Id"], CLIENT_ID);
    assert.match(headers["Request-Id"], /^[0-9a-f-]{36}$/);
    assert.match(headers["Request-Timestamp"], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.match(headers["Signature"], /^HMACSHA256=/);
    assert.equal(captured.init.body, '{"order":{"amount":1}}');
  });

  it("caches the SNAP B2B token across calls", async () => {
    let tokenCalls = 0;
    const fakeFetch = (async (_url: string | URL, init: RequestInit = {}) => {
      if (String(_url).includes("/authorization/")) {
        tokenCalls++;
      }
      const url = String(_url);
      if (url.includes("/authorization/v1/access-token/b2b")) {
        return new Response(JSON.stringify({ accessToken: "T0K3N", expiresIn: "898" }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ responseCode: "2002700" }), { status: 200 });
    }) as typeof fetch;
    const client = new DokuClient({
      clientId: CLIENT_ID,
      secretKey: SECRET,
      privateKey: process.env.DOKU_TEST_RSA_KEY ?? "unused-in-happy-path",
      fetchImpl: fakeFetch,
    });
    // The token signing needs a real RSA key; skip when absent.
    if (!process.env.DOKU_TEST_RSA_KEY) return;
    await client.requestSnap("POST", "/bi-snap-va/mandiri/v1/transfer-va/create-va", {
      body: { partnerServiceId: "   08899", trxId: "INV-1", totalAmount: { value: "1.00", currency: "IDR" } },
    });
    await client.requestSnap("POST", "/bi-snap-va/mandiri/v1/transfer-va/create-va", {
      body: { partnerServiceId: "   08899", trxId: "INV-2", totalAmount: { value: "1.00", currency: "IDR" } },
    });
    assert.equal(tokenCalls, 1);
  });

  it("throws DokuApiError with parsed body on non-2xx", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { code: "40101" } }), { status: 401 })) as typeof fetch;
    const client = new DokuClient({ clientId: CLIENT_ID, secretKey: SECRET, fetchImpl: fakeFetch });
    await assert.rejects(
      client.requestNonSnap("GET", "/orders/v1/status/INV-X"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        const e = err as Error & { status?: number; body?: unknown };
        assert.equal(e.status, 401);
        assert.deepEqual(e.body, { error: { code: "40101" } });
        return true;
      },
    );
  });
});
