import { runBatch } from "./runBatch";

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) {
	throw new Error("usage: bun run composed/run.ts <absolute-input.json> <new-absolute-evidence-directory>");
}
await runBatch(input, output);
