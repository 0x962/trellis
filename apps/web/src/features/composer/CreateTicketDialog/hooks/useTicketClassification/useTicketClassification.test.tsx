import { afterEach, expect, test } from "bun:test";
import type { TicketClassification, TicketClassificationInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { useTicketClassification } from "./useTicketClassification";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Input = Parameters<typeof useTicketClassification>[0];
type Request = {
	input: TicketClassificationInput;
	signal: AbortSignal;
	resolve: (result: TicketClassification) => void;
	reject: (error: Error) => void;
};
const suggestion: TicketClassification = {
	epic: "TRL/forms",
	wave: "TRL/forms/fixes",
	priority: "high",
	difficulty: "medium",
	model: null,
};
const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const dispose of disposals.splice(0)) await dispose();
});
const wait = (ms = 650) =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});

const fixture = async (initial: Partial<Input> = {}) => {
	const requests: Request[] = [];
	const applied: Array<{ result: TicketClassification; input: TicketClassificationInput }> = [];
	const app = {
		client: {
			tickets: {
				classify: (input: TicketClassificationInput, options: { signal: AbortSignal }) =>
					new Promise<TicketClassification>((resolve, reject) =>
						requests.push({ input, signal: options.signal, resolve, reject }),
					),
			},
		},
	} as unknown as AppContext;
	let input: Input = {
		project: "TRL",
		title: "Fix form",
		description: "The save button fails.",
		epic: undefined,
		wave: undefined,
		disabled: false,
		onResult: (result, input) => {
			applied.push({ result, input });
		},
		...initial,
	};
	let state: ReturnType<typeof useTicketClassification>;
	function Probe() {
		state = useTicketClassification(input);
		return null;
	}
	const root = createRoot();
	const render = async (next: Partial<Input> = {}) =>
		act(async () => {
			input = { ...input, ...next };
			root.render(
				<AppProvider value={app}>
					<Probe />
				</AppProvider>,
			);
		});
	const close = async () => {
		await act(async () => root.unmount());
	};
	disposals.push(close);
	await render();
	return { requests, applied, render, state: () => state!, close };
};

test("typing debounces the complete title and description into one request", async () => {
	const f = await fixture();
	await wait(300);
	await f.render({ title: "Fix ticket form", description: "Full context ".repeat(3000) });
	await wait(350);
	expect(f.requests).toHaveLength(0);
	await wait(300);
	expect(f.requests).toHaveLength(1);
	expect(f.requests[0]!.input).toMatchObject({ title: "Fix ticket form", description: "Full context ".repeat(3000) });
	expect(f.state()).toBe("pending");
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.applied).toEqual([{ result: suggestion, input: f.requests[0]!.input }]);
	expect(f.state()).toBe("idle");
	await wait();
	expect(f.requests).toHaveLength(1);
});

test("a response from an earlier title cannot update the new draft", async () => {
	const f = await fixture();
	await wait();
	await f.render({ title: "Fix database" });
	expect(f.requests[0]!.signal.aborted).toBe(true);
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.applied).toHaveLength(0);
	await wait();
	const fresh = { ...suggestion, epic: "TRL/database", wave: "TRL/database/fixes", priority: "urgent" } as const;
	await act(async () => f.requests[1]!.resolve(fresh));
	expect(f.applied[0]!.result).toEqual(fresh);
});

test("project changes discard prior responses and send the current project", async () => {
	const f = await fixture();
	await wait();
	await f.render({ project: "OP" });
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.applied).toHaveLength(0);
	await wait();
	expect(f.requests[1]!.input.project).toBe("OP");
});

test("a harness change cancels its pending recommendation", async () => {
	const f = await fixture({ harness: "claude" });
	await wait();
	expect(f.requests[0]!.input.harness).toBe("claude");
	await f.render({ harness: "codex" });
	expect(f.requests[0]!.signal.aborted).toBe(true);
	await act(async () => f.requests[0]!.resolve({ ...suggestion, model: "anthropic/claude-opus-5.5" }));
	expect(f.applied).toHaveLength(0);
	await wait();
	expect(f.requests[1]!.input.harness).toBe("codex");
});

test("manual placement constrains the next request and discards the pending choice", async () => {
	const f = await fixture();
	await wait();
	await f.render({ epic: "TRL/chosen", wave: "TRL/chosen/work" });
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.applied).toHaveLength(0);
	await wait();
	expect(f.requests[1]!.input).toMatchObject({ epic: "TRL/chosen", wave: "TRL/chosen/work" });
});

test("blank drafts, missing projects, and submission do not dispatch", async () => {
	const f = await fixture({ title: "  " });
	await wait();
	expect(f.requests).toHaveLength(0);
	await f.render({ title: "Work", project: undefined });
	await wait();
	expect(f.requests).toHaveLength(0);
	await f.render({ project: "TRL" });
	await wait();
	await f.render({ disabled: true });
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.applied).toHaveLength(0);
	await wait();
	expect(f.requests).toHaveLength(1);
});

test("closing a modal cancels its pending result", async () => {
	const f = await fixture();
	await wait();
	await f.close();
	disposals.pop();
	expect(f.requests[0]!.signal.aborted).toBe(true);
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.applied).toHaveLength(0);
});

test("a failed call reports an error and leaves the draft unchanged without a retry", async () => {
	const f = await fixture();
	await wait();
	await act(async () => f.requests[0]!.reject(new Error("Provider unavailable")));
	expect(f.state()).toBe("error");
	expect(f.applied).toHaveLength(0);
	await wait();
	expect(f.requests).toHaveLength(1);
	await f.render({ title: "A new title" });
	await wait();
	expect(f.requests).toHaveLength(2);
});
