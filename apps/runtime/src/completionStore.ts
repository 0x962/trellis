import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

export class CompletionStore {
	latest: RuntimeProcessStatus["result"] = null;
	constructor(private readonly path: string) {
		if (existsSync(path)) {
			const lines = readFileSync(path, "utf8").trim().split("\n");
			this.latest = JSON.parse(lines.at(-1)!);
		}
	}
	append(text: string) {
		const result = { id: randomUUID(), text };
		appendFileSync(this.path, `${JSON.stringify(result)}\n`, { mode: 0o600, flush: true });
		this.latest = result;
	}
}
