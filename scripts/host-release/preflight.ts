import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { hostReleasePreflightResult } from "./preflightResult/index.ts";

const { values } = parseArgs({ options: { release: { type: "string" } } });
if (!values.release) throw new Error("--release is required");
const root = resolve(values.release);
const result = await hostReleasePreflightResult(root);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
