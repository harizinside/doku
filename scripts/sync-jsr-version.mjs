// Keeps jsr.json's version in lockstep with package.json's. npm's `version`
// lifecycle runs this after every `npm version <bump>` and after `npm pkg set`.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const jsr = JSON.parse(readFileSync("jsr.json", "utf8"));
if (jsr.version !== pkg.version) {
  jsr.version = pkg.version;
  writeFileSync("jsr.json", JSON.stringify(jsr, null, 2) + "\n");
  console.log(`jsr.json: version synced to ${pkg.version}`);
} else {
  console.log(`jsr.json: version already ${pkg.version}`);
}
