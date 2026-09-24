import { expect, test } from "bun:test";
import { type Deps, run } from "../index.ts";

const fixture = (reply: (path: string, input: unknown) => unknown = () => ({})) => {
	const output: string[] = [];
	const errors: string[] = [];
	const calls: { path: string; input: unknown }[] = [];
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "agent:Builder" },
		stdout: { write: (text: string) => output.push(text), isTTY: false },
		stderr: { write: (text: string) => errors.push(text), isTTY: false },
		stdin: async () => "body",
		gitUserName: () => "Sam",
		osUser: () => "sam",
		now: () => new Date(),
		sleep: async () => {},
		open: () => {},
		signal: new AbortController().signal,
		apiVersion: "1",
		home: "/home/test",
		fetch: async (request: Request) => {
			const path = new URL(request.url).pathname;
			const body = (await request.json()) as { json: unknown };
			calls.push({ path, input: body.json });
			return Response.json({ json: reply(path, body.json) }, { headers: { "x-trellis-api-version": "1" } });
		},
	} as unknown as Deps;
	return { deps, calls, text: () => output.join(""), errors: () => errors.join("") };
};

test("nested help names the canonical command and makes no server call", async () => {
	for (const command of [
		"diff comment add",
		"flow run list",
		"project status list",
		"resource comment reply",
		"account quota show",
		"host status show",
	]) {
		const f = fixture();
		expect(await run([...command.split(" "), "--help"], f.deps)).toBe(0);
		expect(f.text()).toContain(`trellis ${command}`);
		expect(f.calls).toHaveLength(0);
	}
});

test("a project's own status passes through without a hard-coded review gate", async () => {
	const f = fixture(() => ({ identifier: "DEMO-1" }));
	expect(await run(["ticket", "set-status", "DEMO-1", "author-validation", "--json"], f.deps)).toBe(0);
	expect(f.calls).toEqual([{ path: "/rpc/tickets/move", input: { ticket: "DEMO-1", status: "author-validation" } }]);
});

test("a global flag spelling can be a leaf flag's value", async () => {
	const f = fixture(() => ({ identifier: "DEMO-2" }));
	expect(await run(["ticket", "create", "-p", "DEMO", "-t", "--help"], f.deps)).toBe(0);
	expect(f.calls[0]).toMatchObject({ path: "/rpc/tickets/create", input: { title: "--help", project: "DEMO" } });
});

test("resource lists accept the canonical flag and the saved positional syntax", async () => {
	for (const args of [["--epic", "DEMO/accounts"], ["DEMO/accounts"]]) {
		const f = fixture(() => []);
		expect(await run(["resource", "list", ...args], f.deps)).toBe(0);
		expect(f.calls).toEqual([{ path: "/rpc/resources/list", input: { epic: "DEMO/accounts" } }]);
	}
});

test("diff links do not require review evidence", async () => {
	const f = fixture(() => ({ id: "diff", fetchError: null }));
	expect(await run(["diff", "link", "https://github.com/example/app/pull/1", "--ticket", "DEMO-1"], f.deps)).toBe(0);
	expect(f.calls).toEqual([
		{ path: "/rpc/pullRequests/link", input: { ticket: "DEMO-1", url: "https://github.com/example/app/pull/1" } },
	]);
});

test("saved root commands remain callable", async () => {
	const f = fixture(() => ({ identifier: "DEMO-1" }));
	expect(await run(["move", "DEMO-1", "author-validation"], f.deps)).toBe(0);
	expect(f.calls[0]?.path).toBe("/rpc/tickets/move");
});

const reviewReply = (path: string) => {
	const ref = { id: "diff", url: "https://github.com/example/app/pull/1" };
	switch (path) {
		case "/rpc/pullRequests/resolve":
			return ref;
		case "/rpc/pullRequests/refresh":
			return {
				...ref,
				number: 1,
				headSha: "commit",
				isDraft: true,
				localState: "not-ready",
				files: null,
				reviewGaps: [{ kind: "not-asked", count: 1 }],
			};
		case "/rpc/reviews/status":
			return { headRefOid: "commit", ticket: { identifier: "DEMO-1" } };
		case "/rpc/pullRequests/readSummaryHead":
			return { headline: "Fix the label.", why: "The label has a typo.", watch: "nothing" };
		case "/rpc/pullRequests/readEvidence":
			return { headSha: "commit", body: "The label has the correct text." };
		case "/rpc/flows/list":
			return [];
		default:
			return {};
	}
};

test("diff check reports the missing local request without a state mutation", async () => {
	const f = fixture(reviewReply);
	expect(await run(["diff", "check", "example/app#1"], f.deps)).toBe(1);
	expect(JSON.parse(f.text())).toMatchObject({
		ready: false,
		localState: "not-ready",
		storedGaps: [{ kind: "not-asked", count: 1 }],
	});
	expect(f.calls.map((call) => call.path)).toEqual([
		"/rpc/pullRequests/resolve",
		"/rpc/pullRequests/refresh",
		"/rpc/reviews/status",
		"/rpc/pullRequests/readSummaryHead",
		"/rpc/pullRequests/readEvidence",
		"/rpc/flows/list",
	]);
});

test("diff set-state clears the GitHub draft before the local request and reports the new state", async () => {
	const f = fixture(reviewReply);
	expect(await run(["diff", "set-state", "example/app#1", "ready"], f.deps)).toBe(0);
	expect(f.calls.slice(-2)).toEqual([
		{
			path: "/rpc/reviews/action",
			input: { pr: "https://github.com/example/app/pull/1", action: "ready", headSha: "commit" },
		},
		{ path: "/rpc/pullRequests/setLocalState", input: { id: "diff", localState: "ready" } },
	]);
	expect(JSON.parse(f.text())).toMatchObject({
		requestRecorded: true,
		ready: true,
		pullRequest: { localState: "ready", isDraft: false },
	});
});
