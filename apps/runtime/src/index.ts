import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { startRuntime } from "./server.ts";

const { values } = parseArgs({ options: { home: { type: "string" } } });
if (!values.home) throw new Error("--home is required");
const runtime = await startRuntime(resolve(values.home));
process.stdout.write(`${JSON.stringify(runtime.hello)}\n`);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, async () => {
		if (stopping) return;
		stopping = true;
		await runtime.close();
		process.exit(0);
	});
