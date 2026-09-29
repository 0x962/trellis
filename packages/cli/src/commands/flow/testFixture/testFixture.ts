import type { FlowExecutionRecord } from "@trellis/api";
import { legacyDocumentV1Example } from "@trellis/api";
import type { Deps } from "../../../index.ts";

export const legacyRun: FlowExecutionRecord = {
	id: "00000000000000000000000004",
	flowId: legacyDocumentV1Example.flow.id,
	ticketId: "00000000000000000000000005",
	projectId: "00000000000000000000000006",
	diffId: "00000000000000000000000008",
	revision: 1,
	headSha: "f".repeat(40),
	doc: { flow: legacyDocumentV1Example.flow, ...legacyDocumentV1Example.graphDocument },
	state: {
		version: 1,
		flowId: legacyDocumentV1Example.flow.id,
		flowVersion: 2,
		status: "running",
		startedAt: 0,
		updatedAt: 0,
		steps: [],
		error: null,
	},
	tasks: [],
	createdAt: "2026-09-29T06:00:00Z",
	updatedAt: "2026-09-29T06:00:00Z",
};

type Call = { path: string; input: Record<string, unknown> };

export const fixture = (reply: (call: Call) => unknown, isTTY = false) => {
	const output: string[] = [];
	const errors: string[] = [];
	const calls: Call[] = [];
	const sleeps: number[] = [];
	let now = 0;
	const deps: Deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "agent:Builder" },
		stdout: {
			write: (text) => {
				output.push(text);
			},
			isTTY,
		},
		stderr: {
			write: (text) => {
				errors.push(text);
			},
			isTTY,
		},
		stdin: async () => "",
		gitUserName: () => "Test",
		osUser: () => "test",
		now: () => new Date(now),
		sleep: async (ms) => {
			sleeps.push(ms);
			now += ms;
		},
		open: () => {},
		signal: new AbortController().signal,
		apiVersion: "1",
		home: "/home/test",
		launchdDomain: "gui/1",
		which: () => null,
		run: async () => {
			throw new Error("Unexpected subprocess");
		},
		spawn: () => {
			throw new Error("Unexpected subprocess");
		},
		fetch: async (request) => {
			const path = new URL(request.url).pathname;
			const body = (await request.json()) as { json: Record<string, unknown> };
			const call = { path, input: body.json };
			calls.push(call);
			const result = reply(call);
			return result instanceof Response
				? result
				: Response.json({ json: result }, { headers: { "x-trellis-api-version": "1" } });
		},
	};
	return { deps, calls, sleeps, text: () => output.join(""), errors: () => errors.join("") };
};

export const startReply = ({ path }: Call) => {
	switch (path) {
		case "/rpc/pullRequests/resolve":
			return { id: legacyRun.diffId, url: "https://github.com/example/app/pull/1" };
		case "/rpc/pullRequests/refresh":
			return { id: legacyRun.diffId, number: 1 };
		case "/rpc/reviews/status":
			return { headRefOid: legacyRun.headSha, ticket: { identifier: "TRL-1" } };
		case "/rpc/flows/list":
			return [{ ...legacyRun.doc.flow, nodeCount: 0 }];
		default:
			throw new Error(`Unexpected request: ${path}`);
	}
};
