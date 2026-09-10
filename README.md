# doku

DOKU Payment Gateway SDK for Node.js — TypeScript, ESM, **zero runtime dependencies**
(signing uses only `node:crypto`).

Covers the full DOKU Direct API surface (Credit Card, Virtual Accounts — legacy Non-SNAP
and SNAP, O2O, E-Money, Direct Debit — legacy BRI and SNAP providers, Paylater, Direct
Transfer, KKI, Sub Account v1/v2, Check Status), DOKU Checkout, and the Finance &
Settlement APIs (Split Settlement, Hold & Release, Custom Settlement Report).

## Install

Pin to a release tag so installs never pick up untested WIP from `main`:

```sh
npm install github:harizinside/doku#v0.1.1
# or over SSH:
npm install git+ssh://git@github.com/harizinside/doku.git#v0.1.1
```

> **npm 12+:** git-hosted installs are opt-in now (`allow-git` defaults to `none`),
> so use `npm install --allow-git=all github:harizinside/doku#v0.1.1` once, or add
> `allow-git=all` to your project's `.npmrc`.

> `npm install github:harizinside/doku` (no `#ref`) always tracks the tip of `main` —
> fine if you want every fix immediately, but it installs untested WIP the moment it
> lands.

> **Server-only.** This SDK signs requests with your DOKU secret/private keys using
> `node:crypto`. Only import it from server code — Next.js Route Handlers / Server
> Actions, TanStack Start server functions, etc. Never import it from a `"use client"`
> file or any client bundle.

## Quick start

```ts
import { createDokuClient } from "doku";

const doku = createDokuClient({
  clientId: process.env.DOKU_CLIENT_ID!,
  secretKey: process.env.DOKU_SECRET_KEY!,
  // Required only for SNAP APIs (VA SNAP, Direct Debit SNAP, KKI, Sub Account v2):
  privateKey: process.env.DOKU_PRIVATE_KEY!, // PKCS#8 PEM (\n escapes in .env are fine)
  env: "sandbox", // or "production"
});

// DOKU Checkout — get a payment page URL
const checkout = await doku.checkout.initiateCheckoutPayment({
  order: { amount: 20000, invoice_number: "INV-0001" },
  payment: { payment_due_date: 60 },
});
console.log(checkout.response?.payment?.url);

// Legacy (Non-SNAP) Mandiri VA
await doku.virtualAccountNonSnap.mandiriGeneratePaymentCode({
  order: { invoice_number: "INV-0002", amount: 50000 },
  virtual_account_info: { reusable_status: true, billing_type: "NO_BILL" },
  customer: { name: "Anton", email: "anton@example.com" },
});

// SNAP Mandiri VA (B2B token fetch + caching is automatic)
import { partnerServiceId } from "doku";
await doku.virtualAccountSnap.mandiriSnapCreateVa({
  partnerServiceId: partnerServiceId("8899"), // -> "   8899"
  trxId: "INV-0002",
  totalAmount: { value: "50000.00", currency: "IDR" },
  virtualAccountName: "Anton",
  expiredDate: new Date(Date.now() + 3600e3).toISOString(),
  additionalInfo: { virtualAccountConfig: { reusableStatus: true } },
});

// Check order status
const status = await doku.misc.checkOrderStatus("INV-0001");

// Release a held settlement
await doku.settlement.releaseSettlement({
  order: { invoice_number: "INV-0001", amount: 20000 },
  transaction: { original_request_id: "the-request-id-from-initiation" },
});
```

Every product module is also exported standalone (`await paylater.generateOrder(doku, body)`),
and the namespace objects hang off the client pre-bound (`doku.paylater.generateOrder(body)`).

## Credentials & signing

| Config key | Used for |
| --- | --- |
| `clientId` | `Client-Id` / `X-PARTNER-ID` / `X-CLIENT-KEY` |
| `secretKey` | Non-SNAP HMAC-SHA256 signature; SNAP HMAC-SHA512 symmetric signature |
| `privateKey` | SNAP B2B/B2B2C access-token requests (RSA-SHA256 asymmetric signature) |
| `sharedKey` | Optional separate shared key for Direct Debit/KKI SNAP signing (defaults to `secretKey`) |
| `env` | `sandbox` → `https://api-sandbox.doku.com`, `production` → `https://api.doku.com` |

Both DOKU signing schemes are implemented exactly as documented:

- **Non-SNAP** (`Client-Id`/`Request-Id`/`Request-Timestamp`/`Signature`):
  `HMACSHA256=` + Base64(HMAC-SHA256(stringToSign)) where stringToSign is
  `Client-Id:…\nRequest-Id:…\nRequest-Timestamp:…\nRequest-Target:…\nDigest:…`
  (no `Digest` line for GET requests).
- **SNAP**: B2B token via `X-SIGNATURE` = Base64(RSA-SHA256(`clientId|timestamp`)), then
  `X-SIGNATURE` = Base64(HMAC-SHA512(`METHOD:path:token:lowerHex(SHA256(minBody)):timestamp`)).

B2B tokens are cached in-memory until shortly before expiry; B2B2C tokens are cached per
`authCode`. Direct Debit SNAP flows that need a customer token accept a
`customerToken` option (fetch one with `doku.snapB2B2CToken(authCode)`).

## Finance & Settlement

- **Hold settlement**: add `additional_info.hold_settlement: true` on any payment request,
  then call `doku.settlement.releaseSettlement(...)` (optionally with `override_settlement`).
- **Split settlement**: add `additional_info.settlement[]` (`bank_account_settlement_id`,
  `value`, `type: "FIX" | "PERCENTAGE"`) on the payment; manage existing rules with
  `splitSettlementCheckStatus` / `splitSettlementEdit` / `splitSettlementCancel`.
- **Custom settlement report**: add `additional_info.report[]` (`key` ≤ 64 chars,
  `value` ≤ 128 chars); the pairs become columns in the settlement report export.
- **Bulk registration bank**: manage settlement bank accounts host-to-host with
  `createSettlementBankAccount` / `updateSettlementBankAccount` / `getSettlementBankAccount`
  (`bank_account: { code, number, name, currency, country }`). Must be activated for your
  merchant account in the DOKU dashboard first; `update`/`get` need the account's
  `bank_account_settlement_id` / `{bankCode}/{accountNumber}`.

> **Host caveat:** the docs show the split-settlement and bulk-registration-bank host only as the placeholder
> `{sandbox|production}.doku.com/fc-h2h-api`. `releaseSettlement` uses the confirmed
> `{api|api-sandbox}.doku.com/finance/v1/release`. If you learn the concrete fc-h2h host,
> pass `financeBaseUrl: "https://…/fc-h2h-api"` to `createDokuClient`.

## Handling notifications

DOKU calls your Notification URL (configured in DOKU Back Office) with the same Non-SNAP
signature scheme, just in reverse — verify it with the raw body and headers:

```ts
import { parseDokuNotification } from "doku";

app.post("/api/doku/notifications", express.text({ type: "*/*" }), (req, res) => {
  const rawBody = req.body; // must be the exact bytes DOKU sent — see caveat below
  const ok = doku.verifyNotification({
    headers: req.headers,
    rawBody,
    notificationPath: "/api/doku/notifications", // your route's own path
  });
  if (!ok) return res.sendStatus(401);

  const notification = parseDokuNotification(rawBody);
  if (notification.transaction.status === "SUCCESS") {
    // mark notification.order.invoice_number as paid — make this idempotent,
    // DOKU may redeliver the same notification more than once
  }
  res.sendStatus(200); // DOKU only requires HTTP 200 to consider it delivered
});
```

> **Raw body caveat:** the signature is a digest of the exact bytes DOKU sent. A body
> parser that parses-then-lets-you-re-`JSON.stringify` it (e.g. Express's default
> `express.json()`) can reorder keys or change whitespace, breaking verification — use a
> raw/text body parser for this route specifically (`express.text({ type: "*/*" })` above;
> in Next.js, read `await request.text()` before any `.json()` call).

## API coverage

| Namespace | Endpoints | Notes |
| --- | --- | --- |
| `checkout` | 1 | Initiate payment, deep-typed from docs |
| `virtualAccountNonSnap` | 14 | 7 banks × generate/update, doc-annotated |
| `virtualAccountSnap` | 12 | 11 banks create-va + SNAP check status, incl. `partnerServiceId` helper |
| `creditCard` | 2 | Payment page + refund |
| `emoney` | 4 | Legacy OVO (check_sum), SNAP debit h2h, ShopeePay |
| `o2o`, `paylater`, `directTransfer` | 6 | Generated |
| `directDebitLegacy` | 9 | BRI Direct Debit v1 |
| `directDebitSnap` | 34 | OVO/CIMB/ALLO/BRI/Mandiri/Dana/ShopeePay |
| `kki` | 7 | Kartu Kredit Indonesia |
| `subAccountV1` / `subAccountV2` | 4 / 16 | Wallet-as-a-Service |
| `misc` | 1 | Check Status API (Non-SNAP, cross-product) |
| `settlement` | 7 | Split check-status/edit/cancel, release, bulk bank account create/update/get (hand-typed from docs) |

**Typing tiers.** Checkout, Credit Card, both VA families, Check Status and all of
`settlement` are hand-typed against developers.doku.com. The remaining generated modules
have request interfaces inferred from the collection's example bodies (leaf fields
optional, marked `TODO: verify against developers.doku.com`) and return `unknown` —
narrow/cast as needed.

## Development

```sh
npm install
npm run build        # tsc -> dist/
npm test             # node:test (signature + client behavior, no network)
npm run generate     # re-run codegen against a fresh collection.json export
```

`collection.json` (the Postman export) is a local codegen input only — it is
gitignored and must never be published: it contains sandbox credentials.

### Releasing a new version

One rule: **never hand-edit `"version"` in `package.json`.** Bump with `npm version`:

```sh
npm version patch   # or minor / major — requires a clean working tree
git push --follow-tags
```

`npm version` bumps `package.json`, commits, and tags `vX.Y.Z` in one step; a
`postversion` hook then syncs the new version into `jsr.json` (for publishing to
JSR as `@harizinside/doku`, via `npx jsr publish`) and amends it into the same
commit, so the three never drift apart. Consumers install the new release with
`npm install github:harizinside/doku#vX.Y.Z`.

## Known caveats

- DOKU's docs currently list CC refund as `/cancellation/credit-card/refund` while the
  collection uses `/credit-card/v1/cancellation/credit-card/refund`; this SDK follows the
  collection.
- The split-settlement host is unconfirmed (see above); a `financeBaseUrl` override exists.
- Generated modules carry `TODO: verify` markers — tighten endpoint-by-endpoint as you use them.

## License

MIT
