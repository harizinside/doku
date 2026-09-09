import { DokuClient, type DokuClientConfig, type DokuEnv } from "./core/client.js";
import { DokuApiError } from "./core/http.js";
import { partnerServiceId, signNonSnap, signSnapRequest, signSnapToken } from "./core/signature.js";
import * as checkout from "./products/checkout.js";
import * as creditCard from "./products/creditCard.js";
import * as directDebitLegacy from "./products/directDebitLegacy.js";
import * as directDebitSnap from "./products/directDebitSnap.js";
import * as directTransfer from "./products/directTransfer.js";
import * as emoney from "./products/emoney.js";
import * as kki from "./products/kki.js";
import * as misc from "./products/misc.js";
import * as o2o from "./products/o2o.js";
import * as paylater from "./products/paylater.js";
import * as settlement from "./products/settlement.js";
import * as subAccountV1 from "./products/subAccountV1.js";
import * as subAccountV2 from "./products/subAccountV2.js";
import * as virtualAccountNonSnap from "./products/virtualAccountNonSnap.js";
import * as virtualAccountSnap from "./products/virtualAccountSnap.js";

/**
 * Standalone product functions, exported for direct use:
 *   `await paylater.generateOrder(client, body)`
 */
export {
  checkout,
  creditCard,
  directDebitLegacy,
  directDebitSnap,
  directTransfer,
  emoney,
  kki,
  misc,
  o2o,
  paylater,
  settlement,
  subAccountV1,
  subAccountV2,
  virtualAccountNonSnap,
  virtualAccountSnap,
};

/**
 * Maps `fn(client, ...args)` to `fn(...args)` so product namespaces can hang
 * off a client instance: `doku.paylater.generateOrder(body)`.
 */
export type Bound<T> = {
  [K in keyof T]: T[K] extends (client: DokuClient, ...args: infer A) => infer R
    ? (...args: A) => R
    : T[K];
};

function bindModule<T extends object>(client: DokuClient, mod: T): Bound<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mod)) {
    out[key] =
      typeof value === "function"
        ? (...args: unknown[]) =>
            (value as (c: DokuClient, ...a: unknown[]) => unknown)(client, ...args)
        : value;
  }
  return out as Bound<T>;
}

/** Product namespaces attached to a client by `createDokuClient`. */
export type DokuProductNamespaces = {
  checkout: Bound<typeof checkout>;
  creditCard: Bound<typeof creditCard>;
  directDebitLegacy: Bound<typeof directDebitLegacy>;
  directDebitSnap: Bound<typeof directDebitSnap>;
  directTransfer: Bound<typeof directTransfer>;
  emoney: Bound<typeof emoney>;
  kki: Bound<typeof kki>;
  misc: Bound<typeof misc>;
  o2o: Bound<typeof o2o>;
  paylater: Bound<typeof paylater>;
  settlement: Bound<typeof settlement>;
  subAccountV1: Bound<typeof subAccountV1>;
  subAccountV2: Bound<typeof subAccountV2>;
  virtualAccountNonSnap: Bound<typeof virtualAccountNonSnap>;
  virtualAccountSnap: Bound<typeof virtualAccountSnap>;
};

export interface DokuClientWithProducts extends DokuClient, DokuProductNamespaces {}

/**
 * Recommended entry point: a DokuClient with every product namespace attached
 * and pre-bound (the `client` argument is supplied for you):
 *
 * ```ts
 * const doku = createDokuClient({ clientId, secretKey, privateKey, env: "sandbox" });
 * const va = await doku.virtualAccountSnap.mandiriSnapCreateVa({ ... });
 * const status = await doku.misc.checkOrderStatus("INV-123");
 * ```
 */
export function createDokuClient(config: DokuClientConfig): DokuClientWithProducts {
  const client = new DokuClient(config) as DokuClientWithProducts;
  Object.assign(client, {
    checkout: bindModule(client, checkout),
    creditCard: bindModule(client, creditCard),
    directDebitLegacy: bindModule(client, directDebitLegacy),
    directDebitSnap: bindModule(client, directDebitSnap),
    directTransfer: bindModule(client, directTransfer),
    emoney: bindModule(client, emoney),
    kki: bindModule(client, kki),
    misc: bindModule(client, misc),
    o2o: bindModule(client, o2o),
    paylater: bindModule(client, paylater),
    settlement: bindModule(client, settlement),
    subAccountV1: bindModule(client, subAccountV1),
    subAccountV2: bindModule(client, subAccountV2),
    virtualAccountNonSnap: bindModule(client, virtualAccountNonSnap),
    virtualAccountSnap: bindModule(client, virtualAccountSnap),
  });
  return client;
}

export { DokuClient, DokuApiError };
export type { DokuClientConfig, DokuEnv };
export { partnerServiceId, signNonSnap, signSnapRequest, signSnapToken };
