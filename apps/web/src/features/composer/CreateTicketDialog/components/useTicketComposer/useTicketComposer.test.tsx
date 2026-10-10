import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import type { AssignChoice } from "../../../../agents/AssignAgent/assignChoice";
import { useRecentChoices } from "../../../../agents/AssignAgent/recentChoices";
import { routeDefaults } from "../../../../command/utils/routeDefaults";
import { useComposerStore } from "../../../composerStore";
import { draftKey } from "../../../hooks/useComposerDraft/useComposerDraft";
import { act, fixture, remembered, storage, wait } from "./fixture";

test("the composer keeps the last preference through classification, reopen, and Create another", async () => {
	const f = await fixture();
	expect(f.current().choice).toEqual(remembered);
	await act(async () => f.current().setDraft({ title: "Fix a label", description: "" }));
	await wait();
	expect(f.requests[0]!.input).not.toHaveProperty("harness");
	await act(async () => f.requests[0]!.resolve({ epic: null, wave: null, priority: "low" }));
	expect(f.current().choice).toEqual(remembered);
	await f.reopen();
	expect(f.current().choice).toEqual(remembered);
	const chosen: AssignChoice = { ...remembered, model: "openai/gpt-5.6-luna", effort: "medium" };
	await act(async () => f.current().chooseClassification({ assignment: chosen }));
	await act(async () => f.current().finish(true));
	expect(f.current().draft.title).toBe("");
	expect(f.current().choice).toEqual(chosen);
	await f.reopen();
	expect(f.current().choice).toEqual(chosen);
});

test("fixed ticket fields need no Jev call to keep the last preference", async () => {
	const f = await fixture(true);
	await act(async () => f.current().setDraft({ title: "Fix a label", description: "" }));
	await wait();
	expect(f.requests).toHaveLength(0);
	expect(f.current().choice).toEqual(remembered);
});

test.each(["button", "keyboard"])("the %s keeps the page epic over a saved automatic placement", async (entry) => {
	storage.set(
		draftKey,
		JSON.stringify({
			title: "Fix a label",
			description: "",
			project: "OLD",
			epic: "OLD/closed",
			wave: "OLD/closed/work",
			parent: "OLD-1",
			labels: [{ id: "old-label" }],
			automatic: ["epic", "wave"],
		}),
	);
	const f = await fixture(false, {}, "/p/TRL/epics/current");
	if (entry === "button") await f.clickNew();
	else await f.open(routeDefaults("/p/TRL/epics/current", {}));
	expect(f.current().draft).toMatchObject({
		project: "TRL",
		epic: "TRL/current",
		wave: undefined,
		parent: null,
		labels: [],
	});
	await wait();
	expect(f.requests.at(-1)!.input).toMatchObject({ project: "TRL", epic: "TRL/current" });
	await act(async () => f.requests.at(-1)!.resolve({ epic: "TRL/current", wave: null, priority: "high" }));
	expect(f.current().placement).toMatchObject({ epic: "TRL/current", newWave: true, ready: true });
});

test.each(["!high", "high,low"])("the button preserves default priority rules for %s", async (priority) => {
	const f = await fixture(false, {}, `/p/TRL/epics/current?priority=${priority}`);
	await f.clickNew();
	expect(useComposerStore.getState().options).toEqual({ project: "TRL", epic: "TRL/current" });
	expect(f.current().priority).toBe("none");
});

test("page context applies to an initial draft and explicit choices remain editable", async () => {
	storage.set(
		draftKey,
		JSON.stringify({ title: "Fix a label", description: "", epic: "TRL/other", wave: "TRL/other/work" }),
	);
	const f = await fixture(false, { epic: "TRL/current" });
	expect(f.current().draft.epic).toBe("TRL/current");
	await act(async () => f.current().chooseClassification({ epic: "TRL/manual", wave: "TRL/manual/work" }));
	await wait();
	expect(f.requests.at(-1)!.input).toMatchObject({ epic: "TRL/manual", wave: "TRL/manual/work" });
	expect(f.current().draft.epic).toBe("TRL/manual");
});

test("a delayed classification cannot replace the epic of a new open", async () => {
	const f = await fixture();
	await act(async () => f.current().setDraft({ title: "Fix a label", description: "" }));
	await wait();
	const old = f.requests[0]!;
	await act(async () => f.current().close());
	await f.open({ project: "TRL", epic: "TRL/current" });
	await act(async () => old.resolve({ epic: "TRL/closed", wave: "TRL/closed/work", priority: "high" }));
	expect(f.current().draft.epic).toBe("TRL/current");
	await wait();
	expect(f.requests.at(-1)!.input.epic).toBe("TRL/current");
});

test("an isolated composer keeps the parent draft, receipt, and preferences through close and completion", async () => {
	const parentDraft = JSON.stringify({ title: "Parent draft", description: "Keep text" });
	const parentReceipt = JSON.stringify({ identifier: "TRL-10", assignment: null });
	storage.set("trellis-composer-draft", parentDraft);
	storage.set("trellis-composer-submission", parentReceipt);
	const childKey = "trellis-composer:related:parent";
	storage.set(`${childKey}-submission`, JSON.stringify({ identifier: "TRL-20", assignment: null }));
	const selected: string[] = [];
	let closed = 0;
	const f = await fixture(false, {}, "/", {
		storagePrefix: childKey,
		initialTitle: "Child title",
		options: { project: "TRL" },
		onClose: () => {
			closed++;
		},
		onCreated: async (identifier) => {
			selected.push(identifier);
			return true;
		},
	});
	expect(f.current().draft.title).toBe("Child title");
	expect(f.current().submission.receipt?.identifier).toBe("TRL-20");
	const parentPreference = useComposerStore.getState().assignAgent;
	await act(async () => f.current().onAssignAgent(!parentPreference));
	expect(useComposerStore.getState().assignAgent).toBe(parentPreference);
	await act(async () => f.current().close());
	expect(closed).toBe(1);
	expect(selected).toEqual([]);
	expect(storage.get(`${childKey}-submission`)).toContain("TRL-20");
	expect(storage.get("trellis-composer-draft")).toBe(parentDraft);
	expect(storage.get("trellis-composer-submission")).toBe(parentReceipt);
	await act(async () => {
		await Promise.all([f.current().finish(false), f.current().finish(false)]);
	});
	expect(selected).toEqual(["TRL-20"]);
	expect(storage.has(`${childKey}-submission`)).toBe(false);
	expect(storage.has(`${childKey}-draft`)).toBe(false);
	expect(storage.get("trellis-composer-draft")).toBe(parentDraft);
	expect(storage.get("trellis-composer-submission")).toBe(parentReceipt);
});

test("a saved child receipt permits missing-file recovery but keeps ticket fields locked", async () => {
	const scope = "related-missing-files";
	storage.set(`${scope}-submission`, JSON.stringify({ identifier: "TRL-30", assignment: null }));
	storage.set(`${scope}:uploads`, JSON.stringify([{ id: "file-1", name: "proof.txt", size: 5, lastModified: 12 }]));
	const f = await fixture(false, {}, "/", {
		storagePrefix: scope,
		initialTitle: "Child",
		options: { project: "TRL" },
		onClose() {},
		onCreated: async () => true,
	});
	expect(f.current().locked).toBe(true);
	expect(f.current().attachmentsLocked).toBe(false);
	expect(f.current().uploads.missingFiles).toEqual(["proof.txt"]);
	await act(async () => f.current().create());
	expect(f.current().submission.failure?.stage).toBe("uploading");
	expect(storage.get(`${scope}-submission`)).toContain("TRL-30");
	await act(async () => f.current().uploads.addFiles([new File(["proof"], "proof.txt", { lastModified: 12 })]));
	expect(f.current().uploads.missingFiles).toEqual([]);
	expect(f.current().uploads.uploads[0]?.id).toBe("file-1");
	expect(f.current().locked).toBe(true);
});

test("a child assignment preserves the parent's recent agent preference", async () => {
	const scope = "related-agent-choice";
	const childChoice = { ...remembered, model: null, effort: null, accountId: null };
	storage.set(
		`${scope}-submission`,
		JSON.stringify({
			identifier: "TRL-31",
			assignment: { choice: childChoice, requestId: "child-assignment", complete: false },
		}),
	);
	let assigned = 0;
	const f = await fixture(
		false,
		{},
		"/",
		{
			storagePrefix: scope,
			initialTitle: "Child",
			options: { project: "TRL" },
			onClose() {},
			onCreated: async () => true,
		},
		async () => {
			assigned++;
			return {} as AgentRun;
		},
	);
	await act(async () => f.current().create());
	expect(assigned).toBe(1);
	expect(useRecentChoices.getState().recent).toEqual([remembered]);
});
