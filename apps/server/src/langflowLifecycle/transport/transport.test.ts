import { expect, test } from "bun:test";
import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { LangflowCommit, LangflowLifecycle } from "../types";
import { langflowLifecycleTransport } from "./transport";

test("committed actions notify their domain only after the service promise resolves", async () => {
	const notices: LangflowCommit[] = [];
	const receipt = Promise.withResolvers<unknown>();
	const lifecycle: LangflowLifecycle = {
		committed: (value) => { notices.push(value); },
		stop: async () => {},
		pauseOrdinary: async () => { throw new Error("Unexpected pause"); },
	};
	const transport: ServiceTransport = {
		start: async () => { throw new Error("Unexpected start"); },
		close: async () => {},
		call: () => receipt.promise,
	};
	const wrapped = langflowLifecycleTransport(transport, lifecycle);
	const response = wrapped.call("flowExecutionsV1.decision", systemContext(), { requestId: "retained" });
	expect(notices).toEqual([]);
	const view = { engine: "langflow", id: "execution" };
	receipt.resolve(view);
	expect(await response).toBe(view);
	expect(notices).toEqual([{ domain: "decisions", executionId: "execution" }]);
});

test("unknown results and legacy actions leave Langflow notices unchanged", async () => {
	const notices: LangflowCommit[] = [];
	let fail = true;
	const transport: ServiceTransport = {
		start: async () => { throw new Error("Unexpected start"); },
		close: async () => {},
		call: async () => {
			if (fail) throw new Error("committed_response_lost");
			return { engine: "legacy", id: "execution" };
		},
	};
	const wrapped = langflowLifecycleTransport(transport, {
		committed: (value) => { notices.push(value); }, stop: async () => {},
		pauseOrdinary: async () => { throw new Error("Unexpected pause"); },
	});
	await expect(wrapped.call("flowExecutionsV1.start", systemContext(), {})).rejects.toThrow("committed_response_lost");
	fail = false;
	await wrapped.call("flowExecutionsV1.start", systemContext(), {});
	expect(notices).toEqual([]);
});
