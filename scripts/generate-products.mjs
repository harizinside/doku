#!/usr/bin/env node
/**
 * One-time / re-runnable codegen.
 *
 * Reads the DOKU Postman export (collection.json) and emits
 * src/products/<module>.ts for the generic API families:
 * o2o, directDebitLegacy, directDebitSnap, paylater, directTransfer, kki,
 * subAccountV1, subAccountV2.
 *
 * Hand-written modules (virtualAccount*, creditCard, checkout, emoney, misc,
 * settlement) are never overwritten: existing files are skipped unless --force.
 *
 * Usage: node scripts/generate-products.mjs [--collection path] [--force]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const FORCE = args.includes("--force");

const collectionPath = resolve(
  argVal("--collection") ?? join(pkgRoot, "..", "collection.json"),
);
if (!existsSync(collectionPath)) {
  console.error(`collection.json not found at ${collectionPath}`);
  console.error("Pass --collection /path/to/collection.json");
  process.exit(1);
}
const collection = JSON.parse(readFileSync(collectionPath, "utf8"));

/** Folder prefix -> output module. Requests outside these trees are ignored. */
const MODULES = {
  o2o: ["DOKU Direct>O2O"],
  directDebitLegacy: ["DOKU Direct>Direct Debit>BRI Direct Debit"],
  directDebitSnap: [
    "DOKU Direct>Direct Debit>OVO Snap Direct Debit",
    "DOKU Direct>Direct Debit>CIMB Snap Direct Debit",
    "DOKU Direct>Direct Debit>ALLO Snap Direct Debit",
    "DOKU Direct>Direct Debit>BRI Snap Direct Debit",
    "DOKU Direct>Direct Debit>Mandiri Snap Direct Debit",
    "DOKU Direct>Direct Debit>Dana Snap Direct Debit",
    "DOKU Direct>Direct Debit>ShopeePay Snap Direct Debit",
  ],
  paylater: ["DOKU Direct>Paylater"],
  directTransfer: ["DOKU Direct>Direct Transfer"],
  kki: ["DOKU Direct>KKI"],
  subAccountV1: ["DOKU Sub Account>Sub Account V1"],
  subAccountV2: ["DOKU Sub Account>Sub Account V2"],
};

const SKIP_NAME = /init KJUR/i;
const SKIP_PATH = /\/authorization\/v1\/access-token\/(b2b|b2b2c)$/;

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const BANK_WORDS = [
  "ovo", "cimb", "allo", "bri", "mandiri", "dana", "shopeepay",
];

function camelCase(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

/** Function name for a request, prefixed with the bank word when missing. */
function fnName(requestName, folderName) {
  let name = camelCase(requestName);
  const src = (camelCase(requestName) + camelCase(folderName)).toLowerCase();
  const bank = BANK_WORDS.find((b) => src.includes(b));
  if (bank && !name.toLowerCase().startsWith(bank) && !name.toLowerCase().includes(bank)) {
    name = bank + name[0].toUpperCase() + name.slice(1);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Path templatization
// ---------------------------------------------------------------------------

function templatizePath(rawUrl) {
  let path = rawUrl.replace(/\{\{(url|prod_url)\}\}/, "").split("?")[0];
  const params = [];
  const templates = [
    [/\/orders\/v1\/status\/[^/]+$/, "/orders/v1/status/${invoiceNumber}", ["invoiceNumber", "string"]],
    [/\/sac-merchant\/v1\/balances\/[^/]+$/, "/sac-merchant/v1/balances/${accountId}", ["accountId", "string"]],
  ];
  for (const [re, replacement, param] of templates) {
    if (re.test(path)) {
      path = path.replace(re, replacement);
      params.push(param);
    }
  }
  return { path, params };
}

// ---------------------------------------------------------------------------
// Type inference from example bodies (leaf fields default to optional)
// ---------------------------------------------------------------------------

function fieldEntry(key, value) {
  const name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const inner = Object.entries(value).map(([k, v]) => fieldEntry(k, v));
    return { name, fields: inner };
  }
  let type;
  if (value === null) type = "unknown";
  else if (Array.isArray(value)) type = value.length ? `Array<${scalarType(value[0])}>` : "unknown[]";
  else type = scalarType(value);
  return { name, type };
}

function scalarType(value) {
  if (value === null) return "unknown";
  switch (typeof value) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    default: return "unknown";
  }
}

function renderFields(fields, indent) {
  const pad = " ".repeat(indent);
  return fields
    .map((f) => {
      if (f.fields) {
        return `${pad}${f.name}: {\n${renderFields(f.fields, indent + 2)}\n${pad}};`;
      }
      const doc = "  /** TODO: verify against developers.doku.com */";
      return `${pad}${doc}\n${pad}${f.name}?: ${f.type};`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Scheme detection
// ---------------------------------------------------------------------------

function prerequestScript(item) {
  const e = (item.event || []).find((x) => x.listen === "prerequest");
  return e ? (e.script.exec || []).join("\n") : "";
}

function detectScheme(item) {
  const script = prerequestScript(item);
  if (/HmacSHA512/.test(script)) {
    return /shared_key/.test(script) ? "snapShared" : "snap";
  }
  return "nonSnap";
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

const leaves = [];
function walk(items, path) {
  for (const it of items || []) {
    if (it.item) {
      walk(it.item, path.concat(it.name));
      continue;
    }
    if (it.request) leaves.push({ path: path.join(">"), item: it });
  }
}
walk(collection.item, []);

const opsByModule = new Map();
for (const { path, item } of leaves) {
  const rawUrl = item.request.url?.raw ?? item.request.url ?? "";
  if (SKIP_NAME.test(item.name) || SKIP_PATH.test(rawUrl)) continue;
  const moduleKey = Object.keys(MODULES).find((m) =>
    MODULES[m].some((prefix) => path.startsWith(prefix)),
  );
  if (!moduleKey) continue;

  const request = item.request;
  const { path: cleanPath, params } = templatizePath(rawUrl);
  let body;
  if (request.body?.raw && request.method !== "GET") {
    try {
      body = JSON.parse(request.body.raw.replace(/\{\{[^}]+\}\}/g, null));
    } catch {
      body = undefined;
    }
  }
  const folder = path.split(">").slice(-1)[0];
  const fn = fnName(item.name, folder);
  const op = {
    fn,
    cleanPath,
    params,
    method: request.method,
    scheme: detectScheme(item),
    body,
    requestName: item.name,
  };
  if (!opsByModule.has(moduleKey)) opsByModule.set(moduleKey, []);
  const list = opsByModule.get(moduleKey);
  if (!list.some((o) => o.fn === fn)) list.push(op);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function renderModule(moduleKey, ops) {
  const usesSnap = ops.some((o) => o.scheme !== "nonSnap");
  const usesSharedKey = ops.some((o) => o.scheme === "snapShared");
  const lines = [];
  lines.push(`/**`);
  lines.push(` * ${moduleKey} — generated by scripts/generate-products.mjs from the DOKU Postman`);
  lines.push(` * collection. Re-run \`npm run generate\` instead of hand-editing.`);
  lines.push(` *`);
  lines.push(` * Request field types are inferred from the collection's example bodies (all leaf`);
  lines.push(` * fields optional). Responses are \`unknown\` until verified against the docs.`);
  lines.push(` */`);
  lines.push(`import type { DokuClient } from "../core/client.js";`);
  lines.push(``);
  if (usesSnap) {
    lines.push(`export interface ${cap(moduleKey)}SnapOptions {`);
    lines.push(`  /** CHANNEL-ID header (some flows require e.g. "H2H") */`);
    lines.push(`  channelId?: string;`);
    if (usesSharedKey) {
      lines.push(`  /** B2B2C customer token; sent as \`Authorization-Customer: Bearer ...\` when set */`);
      lines.push(`  customerToken?: string;`);
    }
    lines.push(`}`);
    lines.push(``);
  }
  for (const op of ops) {
    const bodyTypeName = `${cap(op.fn)}Body`;
    const hasBody = op.body !== undefined;
    const hasOptions = usesSnap;
    if (hasBody) {
      lines.push(`export interface ${bodyTypeName} {`);
      lines.push(renderFields(Object.entries(op.body).map(([k, v]) => fieldEntry(k, v)), 2));
      lines.push(`}`);
      lines.push(``);
    }
    lines.push(`/** ${op.requestName} — ${op.method} ${op.cleanPath} */`);
    lines.push(`export async function ${op.fn}(`);
    const args = [`client: DokuClient`];
    for (const [p, t] of op.params) args.push(`${p}: ${t}`);
    if (hasBody) args.push(`body: ${bodyTypeName}`);
    if (hasOptions) args.push(`options?: ${cap(moduleKey)}SnapOptions`);
    lines.push(`  ${args.join(", ")}`);
    lines.push(`): Promise<unknown> {`);
    const pathExpr = op.params.length ? `\`${op.cleanPath}\`` : JSON.stringify(op.cleanPath);
    if (op.scheme === "nonSnap") {
      const bodyArg = hasBody ? `body as unknown as Record<string, unknown>` : `undefined`;
      lines.push(`  return client.requestNonSnap(${JSON.stringify(op.method)}, ${pathExpr}, ${bodyArg});`);
    } else {
      lines.push(`  return client.requestSnap(${JSON.stringify(op.method)}, ${pathExpr}, {`);
      if (hasBody) lines.push(`    body: body as unknown as Record<string, unknown>,`);
      if (usesSharedKey) {
        lines.push(`    useSharedKey: true,`);
        lines.push(`    customerToken: options?.customerToken,`);
      }
      lines.push(`    channelId: options?.channelId,`);
      lines.push(`  });`);
    }
    lines.push(`}`);
    lines.push(``);
  }
  return lines.join("\n");
}

mkdirSync(join(pkgRoot, "src", "products"), { recursive: true });
let written = 0;
for (const [moduleKey, ops] of opsByModule) {
  const target = join(pkgRoot, "src", "products", `${moduleKey}.ts`);
  if (existsSync(target) && !FORCE) {
    console.log(`skip (exists): ${moduleKey}.ts`);
    continue;
  }
  writeFileSync(target, renderModule(moduleKey, ops));
  written++;
  console.log(`wrote: ${moduleKey}.ts (${ops.length} operations)`);
}
console.log(`\nDone. ${written} module(s) written from ${leaves.length} collection requests.`);
