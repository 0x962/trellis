import { readFile, rename, writeFile } from "node:fs/promises";
import { DurableAuthorityFixture } from "./durableAuthorityFixture.ts";

export type AuthorityProcessInput = {
	directory: string;
	marker: string;
	nonce: string;
	action: "hold" | "takeover" | "authorize" | "inspect";
	ownerId: string;
	capabilityId: string;
	at: string;
	permission?: Parameters<DurableAuthorityFixture["authorize"]>[2];
	release?: string;
	request?: Parameters<DurableAuthorityFixture["takeover"]>[0];
};

const input = JSON.parse(await readFile(process.argv[2]!, "utf8")) as AuthorityProcessInput;
const authority = DurableAuthorityFixture.open(input.directory);
const publish = async (state: string, value: Record<string, unknown> = {}) => {
	const temporary = `${input.marker}-${crypto.randomUUID()}.next`;
	await writeFile(temporary, JSON.stringify({ pid: process.pid, nonce: input.nonce, state, ...value }), {
		mode: 0o600,
	});
	await rename(temporary, input.marker);
};
const hold = async () => {
	await new Promise(() => setInterval(() => {}, 1000));
};

if (input.action === "takeover") {
	authority.commitBoundary = async (phase, sequence) => {
		await publish(phase, { sequence });
		if (phase === "after_commit" || input.release === undefined) await hold();
		else while (!(await Bun.file(input.release).exists())) await Bun.sleep(5);
	};
	try {
		await authority.takeover(input.request!);
	} catch (error) {
		if (!(error instanceof Error) || error.message !== "stale_owner") throw error;
		await publish("rejected", { reason: error.message });
	}
} else if (input.action === "inspect") {
	await publish("inspected", { trace: await authority.trace() });
} else {
	try {
		await authority.authorize(input.ownerId, input.capabilityId, input.permission ?? "completion.deliver", input.at);
		await publish("authorized");
		if (input.action === "hold") await hold();
	} catch (error) {
		if (!(error instanceof Error) || !["stale_owner", "authority_expired"].includes(error.message)) throw error;
		await publish("rejected", { reason: error.message });
	}
}
