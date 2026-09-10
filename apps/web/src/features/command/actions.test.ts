import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Settings, TrellisClient } from "@trellis/api";
import {
	type ActionContext,
	branchName,
	bulkChangeStatus,
	bulkDelete,
	changeStatus,
	copyAgentBrief,
	copyBranchName,
	copyId,
	copyLink,
	deleteTicket,
	moveToProject,
	openPullRequest,
	setParent,
	setPriority,
	startWithAgent,
} from "./actions";

const settings: Settings = {
	startWithAgentTemplate: 'claude "$(trellis brief {brief})"',
	defaultActorName: "navid",
	stalledHours: 24,
};

const markdown = "# CDE-42 Restore the fork pages";

// A client that records the path and the input of every call.
const stubClient = () => {
	const calls: { path: string; input: unknown }[] = [];
	const record = (path: string, result: unknown) =>
		mock(async (input: unknown) => {
			calls.push({ path, input });
			return result;
		});
	const client = {
		tickets: {
			update: record("tickets.update", {}),
			updateMany: record("tickets.updateMany", { updated: 3 }),
			delete: record("tickets.delete", { deleted: "CDE-42" }),
			deleteMany: record("tickets.deleteMany", { deleted: 3 }),
		},
		brief: { get: record("brief.get", { markdown, generatedAt: new Date().toISOString() }) },
	};
	return { calls, client, api: client as unknown as TrellisClient };
};

const build = (answer = true) => {
	const stub = stubClient();
	const clipboard: string[] = [];
	const notify = mock((_message: string, _options?: { command?: string; retry?: () => void }) => {});
	const openUrl = mock((_url: string) => {});
	const confirm = mock(async () => answer);
	const context: ActionContext = {
		client: stub.api,
		settings,
		origin: "http://localhost:4521",
		copy: async (text) => {
			clipboard.push(text);
		},
		confirm,
		notify,
		openUrl,
		navigate: mock((_to: string) => {}),
	};
	return { ...stub, clipboard, notify, openUrl, confirm, context };
};

const ticket = { identifier: "CDE-42", title: "Restore the fork pages!" };

let harness: ReturnType<typeof build>;

beforeEach(() => {
	harness = build();
});

describe("features/command/actions", () => {
	// AC-01
	test("changeStatus calls tickets.update with the status", async () => {
		await changeStatus(harness.context, "CDE-42", "in-progress");
		expect(harness.calls).toEqual([{ path: "tickets.update", input: { ticket: "CDE-42", status: "in-progress" } }]);
	});

	// AC-02
	test("setPriority calls tickets.update with the priority", async () => {
		await setPriority(harness.context, "CDE-42", "high");
		expect(harness.calls).toEqual([{ path: "tickets.update", input: { ticket: "CDE-42", priority: "high" } }]);
	});

	// AC-03
	test("moveToProject calls tickets.update with the project", async () => {
		await moveToProject(harness.context, "CDE-42", "CDE.web.auth");
		expect(harness.calls).toEqual([{ path: "tickets.update", input: { ticket: "CDE-42", project: "CDE.web.auth" } }]);
	});

	// AC-04. `parent: null` is how the contract clears a parent.
	test("setParent sends the parent ref and sends null for no parent", async () => {
		await setParent(harness.context, "CDE-42", "CDE-1");
		await setParent(harness.context, "CDE-42", null);
		expect(harness.calls).toEqual([
			{ path: "tickets.update", input: { ticket: "CDE-42", parent: "CDE-1" } },
			{ path: "tickets.update", input: { ticket: "CDE-42", parent: null } },
		]);
	});

	// AC-05
	test("deleteTicket deletes after the person confirms", async () => {
		await deleteTicket(harness.context, "CDE-42");
		expect(harness.calls).toEqual([{ path: "tickets.delete", input: { ticket: "CDE-42" } }]);
	});

	// AC-06
	test("deleteTicket calls nothing when the person refuses", async () => {
		const refused = build(false);
		await deleteTicket(refused.context, "CDE-42");
		expect(refused.confirm).toHaveBeenCalledTimes(1);
		expect(refused.calls).toEqual([]);
	});

	// AC-07. One call, one transaction: three separate writes would show
	// three activity rows and three events.
	test("bulkChangeStatus sends one updateMany call for the selection", async () => {
		const selection = ["CDE-42", "CDE-44", "CDE-41"];
		await bulkChangeStatus(harness.context, selection, "in-progress");
		expect(harness.calls).toEqual([
			{ path: "tickets.updateMany", input: { tickets: selection, status: "in-progress" } },
		]);
	});

	// AC-08
	test("bulkDelete sends one deleteMany call after the confirm", async () => {
		const selection = ["CDE-42", "CDE-44", "CDE-41"];
		await bulkDelete(harness.context, selection);
		expect(harness.calls).toEqual([{ path: "tickets.deleteMany", input: { tickets: selection } }]);
	});

	// AC-09
	test("copyId writes the identifier to the clipboard", async () => {
		await copyId(harness.context, "CDE-42");
		expect(harness.clipboard).toEqual(["CDE-42"]);
	});

	// AC-10
	test("branchName lowercases the identifier and slugs the title", () => {
		expect(branchName(ticket)).toBe("cde-42-restore-the-fork-pages");
	});

	// AC-11
	test("copyBranchName writes the derived branch name", async () => {
		await copyBranchName(harness.context, ticket);
		expect(harness.clipboard).toEqual([branchName(ticket)]);
	});

	// AC-12
	test("copyLink writes the full page link for the ticket", async () => {
		await copyLink(harness.context, "CDE-42");
		expect(harness.clipboard).toEqual(["http://localhost:4521/t/CDE-42"]);
	});

	// AC-13. `{brief}` in the template stands for the ticket.
	test("startWithAgent copies the command from the settings template", async () => {
		await startWithAgent(harness.context, "CDE-42");
		const command = 'claude "$(trellis brief CDE-42)"';
		expect(harness.clipboard).toEqual([command]);
		expect(harness.notify).toHaveBeenCalledTimes(1);
		expect(harness.notify.mock.calls[0]![1]?.command).toBe(command);
	});

	// AC-14
	test("copyAgentBrief fetches the brief and copies the markdown", async () => {
		await copyAgentBrief(harness.context, "CDE-42");
		expect(harness.calls).toEqual([{ path: "brief.get", input: { ticket: "CDE-42" } }]);
		expect(harness.clipboard).toEqual([markdown]);
	});

	// AC-15
	test("openPullRequest opens the pull request URL", () => {
		const url = "https://github.com/canary-technologies-corp/de/pull/118";
		openPullRequest(harness.context, url);
		expect(harness.openUrl.mock.calls).toEqual([[url]]);
	});

	// AC-16. The network is a boundary: a failed write says so and offers
	// the same call again.
	test("a failed mutation notifies with a retry that repeats the call", async () => {
		const failing = build();
		failing.client.tickets.update = mock(async () => {
			throw new Error("VERSION_CONFLICT");
		});
		failing.context.client = failing.client as unknown as TrellisClient;
		await changeStatus(failing.context, "CDE-42", "in-progress");
		expect(failing.notify).toHaveBeenCalledTimes(1);
		const retry = failing.notify.mock.calls[0]![1]?.retry;
		expect(retry).toBeFunction();
		retry!();
		expect(failing.client.tickets.update).toHaveBeenCalledTimes(2);
		expect(failing.client.tickets.update.mock.calls[1]![0]).toEqual({ ticket: "CDE-42", status: "in-progress" });
	});

	// AC-17. The page's client carries the actor header, so every write
	// records the person who ran it.
	test("every action calls through the context client", async () => {
		await changeStatus(harness.context, "CDE-42", "in-progress");
		await setPriority(harness.context, "CDE-42", "high");
		await moveToProject(harness.context, "CDE-42", "CDE.web");
		await setParent(harness.context, "CDE-42", "CDE-1");
		await deleteTicket(harness.context, "CDE-42");
		await bulkChangeStatus(harness.context, ["CDE-42"], "done");
		await bulkDelete(harness.context, ["CDE-42"]);
		await copyAgentBrief(harness.context, "CDE-42");
		expect(harness.calls.map((call) => call.path)).toEqual([
			"tickets.update",
			"tickets.update",
			"tickets.update",
			"tickets.update",
			"tickets.delete",
			"tickets.updateMany",
			"tickets.deleteMany",
			"brief.get",
		]);
	});
});
