// Throwaway smoke test: initiate a real DOKU Checkout payment against the sandbox.
// Dev-only, not part of the published package. Run with:
//   node --env-file=.env scripts/smoke-checkout.mjs
import { DokuClient } from "../dist/index.js";
import { initiateCheckoutPayment } from "../dist/products/checkout.js";

const clientId = process.env.DOKU_CLIENT_ID;
const secretKey = process.env.DOKU_SECRET_KEY;
if (!clientId || !secretKey) {
  console.error("Missing DOKU_CLIENT_ID / DOKU_SECRET_KEY — run with: node --env-file=.env scripts/smoke-checkout.mjs");
  process.exit(1);
}

const client = new DokuClient({
  clientId,
  secretKey,
  env: process.env.DOKU_ENV === "production" ? "production" : "sandbox",
});

const invoiceNumber = `SMOKE-${Date.now()}`;
console.log(`> POST /checkout/v1/payment  invoice=${invoiceNumber}`);

try {
  const res = await initiateCheckoutPayment(client, {
    order: {
      amount: 10000,
      invoice_number: invoiceNumber,
      auto_redirect: true,
    },
    payment: {},
  });
  console.log("SUCCESS:");
  console.log(JSON.stringify(res, null, 2));
} catch (err) {
  console.error("FAILED:");
  if (err instanceof Error) {
    console.error(`${err.name}: ${err.message}`);
    console.error(`status: ${err.status}`);
    console.error(`body: ${JSON.stringify(err.body, null, 2)}`);
  } else {
    console.error(err);
  }
  process.exit(1);
}
