import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

const { boot } = await import(join(import.meta.dir, "apps/server/src/index.ts"));
const { loadConfig } = await import(join(import.meta.dir, "apps/server/src/config.ts"));
const { startLangflowBootstrap } = await import(join(import.meta.dir, "apps/server/src/langflowBootstrap/index.ts"));
assert.equal(process.env.TRELLIS_LANGFLOW_CONFIG_FILE, undefined);
const forbidden = () => {
	throw new Error("Absent Langflow configuration touched a runtime dependency");
};
const transport = new Proxy({}, { get: forbidden });
assert.equal(await startLangflowBootstrap(loadConfig(process.env), transport, forbidden), undefined);
let port: number | undefined;
let stopped = false;
await boot({
	sink: {
		isTTY: false,
		write: (line: string) => {
			process.stdout.write(line);
			const record = JSON.parse(line);
			if (record.msg === "listening") port = record.port;
		},
	},
	hooks: [
		{
			name: "isolated-package",
			start: async () => {
				assert(port);
				const response = await fetch(`http://127.0.0.1:${port}/api/health`);
				assert.equal(response.status, 200);
				assert.equal(existsSync(join(process.env.TRELLIS_HOME!, "langflow")), false);
				setTimeout(() => process.emit("SIGTERM"), 0);
			},
			stop: () => {
				stopped = true;
			},
		},
	],
	exit: (code: number) => {
		assert.equal(code, 0);
		assert(stopped);
		console.log("staged server passed");
		process.exit(code);
	},
});
