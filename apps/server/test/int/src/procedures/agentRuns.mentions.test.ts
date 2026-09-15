import { afterEach, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let ticket: string;
let builder: string;

// A Git repository for the project directory, because a native ticket agent
// works in a Git worktree of that directory.
const repository = () => {
	const directory = mkdtempSync(join(tmpdir(), "trellis-mention-repo-"));
	execFileSync("git", ["init", "-q", directory]);
	writeFileSync(join(directory, "README.md"), "mention fixture\n");
	execFileSync("git", ["-C", directory, "add", "."]);
	execFileSync("git", [
		"-C",
		directory,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"-qm",
		"Fixture",
	]);
	return directory;
};

const configure = (concurrency: number, directory: string) =>
	t.client.projects.update({
		project: "RUN",
		managerConfig: {
			personaId: null,
			concurrency,
			directory,
			ade: "native",
			// The agent prints its launch prompt and then echoes each message it
			// takes, so the output of the run shows both.
			harness: {
				preset: "custom",
				startCommand: `/bin/sh -c 'printf "%s\\n" "$1"; exec cat' sh {{prompt}}`,
				resumeCommand: "/bin/cat",
			},
		},
	});

let directory: string;
beforeEach(async () => {
	t = await createTestApp({ home: mkdtempSync("/tmp/trellis-mention-home-") });
	await t.seedProject("RUN");
	await t.client.projects.setRepos({ project: "RUN", repos: [{ owner: "example", repo: "code" }] });
	directory = repository();
	await configure(3, directory);
	ticket = (await t.createTicket({ project: "RUN", title: "Build the feature" })).identifier;
	builder = (
		await t.client.personas.create({ name: "Feature Builder", kind: "builder", instruction: "Build carefully." })
	).id;
});
afterEach(async () => {
	const socket = join(t.home, "runtime", "runtime.sock");
	if (existsSync(socket)) await new RuntimeClient(socket).shutdown();
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

// comments.create answers before the mention path launches an agent, so a
// test waits for the calls in flight before it reads the result.
const comment = async (body: string) => {
	const created = await t.client.comments.create({ ticket, body });
	await t.transport.settle();
	return created;
};
type TimelineComment = {
	kind: string;
	body: string;
	parentId: string | null;
	actor: { name: string; kind: string };
};
const threadComments = async () =>
	(await t.client.timeline.list({ ticket })).items.filter(
		(item): item is typeof item & TimelineComment => item.kind === "comment",
	);
const bodies = async () => (await threadComments()).map((item) => item.body);
const openRuns = async () => (await t.client.agentRuns.list({ ticket })).filter((run) => run.state === "running");
// The terminal output of a run arrives after the process writes it, so the
// test polls for the text it expects.
const outputOf = async (id: string, expected: string) => {
	let text = "";
	for (let poll = 0; poll < 100 && !text.includes(expected); poll++) {
		text = (await t.client.agentRuns.output({ id })).text;
		await Bun.sleep(25);
	}
	return text;
};

test("a mention starts the persona and carries the comment text into its prompt", async () => {
	const created = await comment("@feature-builder please read the failing test first.");
	expect(created.body).toContain("@feature-builder");
	const runs = await t.client.agentRuns.list({ ticket });
	expect(runs).toHaveLength(1);
	expect(runs[0]).toMatchObject({ personaId: builder, state: "running", ticketIdentifier: ticket, runtime: "native" });
	const output = await outputOf(runs[0]!.id, "please read the failing test first.");
	expect(output).toContain("A comment on this ticket mentioned you:");
	expect(output).toContain("please read the failing test first.");
	expect(output).toContain("Build carefully.");
}, 20000);

test("a comment without a mention starts nothing", async () => {
	await comment("Please read the failing test first.");
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(0);
	expect(await bodies()).toEqual(["Please read the failing test first."]);
});

test("a second mention reaches the running agent instead of starting another", async () => {
	await comment("@feature-builder start here.");
	await comment("@feature-builder one more thing.");
	const runs = await t.client.agentRuns.list({ ticket });
	expect(runs).toHaveLength(1);
	expect(await outputOf(runs[0]!.id, "one more thing.")).toContain("@feature-builder one more thing.");
}, 20000);

test("a mention of a persona without an open run here starts it beside the other agents", async () => {
	await t.client.personas.create({ name: "Code Clarity", kind: "reviewer", instruction: "Review." });
	await comment("@feature-builder start here.");
	await comment("@code-clarity review what the builder wrote.");
	const runs = await openRuns();
	expect(runs.map((run) => run.personaName).sort()).toEqual(["Code Clarity", "Feature Builder"]);
}, 20000);

test("a mention after the agent stopped starts a new run", async () => {
	await comment("@feature-builder start here.");
	const [first] = await t.client.agentRuns.list({ ticket });
	await t.client.agentRuns.stop({ id: first!.id });
	await comment("@feature-builder start again.");
	const runs = await t.client.agentRuns.list({ ticket });
	expect(runs).toHaveLength(2);
	expect(runs[0]).toMatchObject({ personaId: builder, state: "running" });
	expect(runs[0]!.id).not.toBe(first!.id);
}, 20000);

test("a mention in a comment by an agent starts nothing", async () => {
	// Two agents that mention each other would trade text with no end, so only
	// a comment by a human runs the mention path.
	await t.as("agent:reviewer-run").comments.create({ ticket, body: "@feature-builder done." });
	await t.transport.settle();
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(0);
	expect(await bodies()).toEqual(["@feature-builder done."]);
});

test("a reply from trellis sits in the thread of the comment that holds the mention", async () => {
	// Paused local work refuses every start, so each mention below gets a reply.
	await t.client.system.stopNativeWork({});
	const top = await comment("@feature-builder please start.");
	const root = await t.client.comments.create({ ticket, body: "A thread about the plan." });
	const inner = await t.client.comments.create({ ticket, parentId: root.id, body: "@feature-builder you too." });
	await t.transport.settle();
	const replies = (await threadComments()).filter((item) => item.actor.kind === "system");
	expect(replies.map((item) => item.parentId).sort()).toEqual([top.id, root.id].sort());
	expect(inner.parentId).toBe(root.id);
});

test("an unknown mention starts nothing and adds no comment", async () => {
	await comment("@nobody-here can you look?");
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(0);
	expect(await bodies()).toEqual(["@nobody-here can you look?"]);
});

test("an ambiguous mention starts nothing and names both personas in a reply", async () => {
	await t.client.personas.create({ name: "Feature builder", kind: "reviewer", instruction: "Review." });
	await comment("@feature-builder please start.");
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(0);
	const reply = (await bodies()).find((body) => body.includes("@feature-builder names"))!;
	expect(reply).toContain("Feature Builder");
	expect(reply).toContain("Feature builder");
	const written = (await threadComments()).find((item) => item.body === reply)!;
	expect(written.actor).toEqual({ name: "trellis", kind: "system" });
});

test("a refused start keeps the comment and names the reason", async () => {
	await t.client.system.stopNativeWork({});
	await comment("@feature-builder please start.");
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(0);
	const all = await bodies();
	expect(all).toContain("@feature-builder please start.");
	expect(all.find((body) => body.includes("Feature Builder"))).toContain("Local work is paused.");
});

test("a start that closes before the process runs names the reason in a reply", async () => {
	// The default project config has the claude preset and trustedDirectory
	// false, so startNative closes the run with an error and throws nothing.
	await t.client.projects.update({
		project: "RUN",
		managerConfig: { personaId: null, concurrency: 3, directory, ade: "native", harness: { preset: "claude" } },
	});
	await comment("@feature-builder please start.");
	const runs = await t.client.agentRuns.list({ ticket });
	expect(runs).toHaveLength(1);
	// No process ever ran, so the execution service holds no record of the
	// run, and the list reports it as interrupted with the stored error.
	expect(runs[0]).toMatchObject({
		personaId: builder,
		state: "interrupted",
		error: "Trust this repository in project settings before an agent starts.",
	});
	const refusal = (await bodies()).find((body) => body.includes("Feature Builder") && body.startsWith("trellis"))!;
	expect(refusal).toContain("Trust this repository in project settings before an agent starts.");
});

test("a refusal from the concurrency limit names the limit", async () => {
	await configure(1, directory);
	await t.client.personas.create({ name: "Code Clarity", kind: "reviewer", instruction: "Review." });
	await comment("@feature-builder start here.");
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(1);
	await comment("@code-clarity you too.");
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(1);
	const refusal = (await bodies()).find((body) => body.includes("Code Clarity") && body.startsWith("trellis"))!;
	expect(refusal).toContain("project concurrency limit");
	expect(refusal).not.toContain("A row with this value exists");
}, 20000);

test("a comment longer than the send cap reaches the terminal cut to 20000 characters", async () => {
	await comment("@feature-builder start here.");
	const body = `@feature-builder ${"detail. ".repeat(4000)}${"tail".repeat(10)}`;
	await comment(body);
	const [run] = await t.client.agentRuns.list({ ticket });
	const cut = body.slice(0, 20_000);
	const output = await outputOf(run!.id, cut.slice(-40));
	expect(output).toContain(cut.slice(-40));
	expect(output).not.toContain("tailtail");
}, 20000);

test("an edit to a comment starts nothing", async () => {
	const created = await comment("Please read the failing test first.");
	await t.client.comments.update({ id: created.id, body: "@feature-builder please read the failing test first." });
	await t.transport.settle();
	expect(await t.client.agentRuns.list({ ticket })).toHaveLength(0);
});
