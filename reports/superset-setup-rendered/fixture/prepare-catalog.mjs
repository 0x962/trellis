import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const source = "9a50076c324b3d2575762e5bdcba6838061c8be5";
const path = "packages/i18n/locales/en/messages.po";
const expected = "f09ceacde81e4983fb2ef79f36356717c771b11e5147762c5e53790de2387d31";
const response = await fetch(`https://raw.githubusercontent.com/superset-sh/superset/${source}/${path}`);
if (!response.ok) throw new Error(`The official catalog request failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const actual = createHash("sha256").update(bytes).digest("hex");
if (actual !== expected) throw new Error("The official catalog digest does not match the captured source.");
const destination = new URL(`./upstream/${path}`, import.meta.url);
await mkdir(new URL(".", destination), { recursive: true });
await writeFile(destination, bytes);
console.log(`Verified official catalog: ${bytes.length} bytes; SHA256 ${actual}`);
