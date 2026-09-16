import type { HarnessHost } from "../../src/agents/harnessHost/harnessHost.ts";

export const nativeCodexTerminal = {
	async ready(host: HarnessHost, id: string, marker: string) {
		let output = "";
		let answered = false;
		for await (const event of host.subscribe(id, 0, AbortSignal.timeout(20000))) {
			if (event.type !== "output") continue;
			output += Buffer.from(event.data, "base64").toString();
			if (!answered && output.includes("\x1b[6n")) {
				answered = true;
				await host.input(id, "\x1b[1;1R\x1b[?0u\x1b[?1;2c", false);
			}
			if (output.includes(marker)) return;
		}
		throw new Error("The native manager terminal did not render its session.");
	},
	async submit(host: HarnessHost, id: string, prompt: string) {
		const { nextOffset } = await host.output(id);
		await host.input(id, prompt);
		let output = "";
		for await (const event of host.subscribe(id, nextOffset, AbortSignal.timeout(20000))) {
			if (event.type !== "output") continue;
			output += Buffer.from(event.data, "base64").toString();
			if (output.includes(prompt)) {
				await host.input(id, "\r");
				return;
			}
		}
		throw new Error("The native manager terminal did not render its prompt.");
	},
};
