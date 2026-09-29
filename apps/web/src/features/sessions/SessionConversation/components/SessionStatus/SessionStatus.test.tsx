import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import type { SessionUpdates } from "@trellis/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionStatusContent } from "./SessionStatusContent";

const run = {
	id: "run-a",
	name: "Agent",
	runtime: "native",
	harness: null,
	kind: "agent",
	projectId: "project",
	projectKey: "TRL",
	ticketId: "ticket",
	ticketIdentifier: "TRL-655",
	ticketTitle: "Show saved agent updates in every session",
	ticketStatusCategory: "done",
	pinnedAt: null,
	assigned: false,
	state: "stopped",
	processStatus: "exited",
	observation: null,
	workspaceId: "workspace",
	terminalId: "attempt",
	url: null,
	error: null,
	sessionId: "provider-session",
	sessionLost: false,
	activityAt: "2026-09-29T06:00:00.000Z",
	createdAt: "2026-09-29T05:00:00.000Z",
	updatedAt: "2026-09-29T06:00:00.000Z",
} as AgentRun;

const updates: SessionUpdates = {
	latest: {
		id: "update-a",
		sessionId: null,
		runId: "run-a",
		requestId: null,
		body: "Session A **finished**.",
		embeds: [],
		createdAt: "2026-09-29T05:58:00.000Z",
	},
	previous: {
		id: "previous-a",
		sessionId: null,
		runId: "run-a",
		requestId: null,
		body: "Session A started.",
		embeds: [],
		createdAt: "2026-09-29T05:50:00.000Z",
	},
	request: null,
};

const render = (value = updates) =>
	renderToStaticMarkup(
		<SessionStatusContent
			run={run}
			updates={value}
			now="2026-09-29T06:00:00.000Z"
			onOpenLink={() => {}}
			renderMarkdown={(markdown) => <p data-markdown={markdown}>{markdown}</p>}
		/>,
	);

describe("SessionStatusContent", () => {
	test("renders the saved update after the ticket completes", () => {
		const html = render();
		expect(html).toContain("Session A **finished**.");
		expect(html).toContain("2 min ago");
		expect(html).toContain("Previous update");
		expect(html).not.toContain("The session is paused");
	});

	test("keeps updates from another session out of the selected session", () => {
		const html = render({
			...updates,
			latest: { ...updates.latest!, body: "Only the selected session appears." },
		});
		expect(html).toContain("Only the selected session appears.");
		expect(html).not.toContain("Session B");
	});

	test("uses the bounded desktop and narrow pane", () => {
		const html = render();
		expect(html).toContain("w-93.5");
		expect(html).toContain("max-md:order-first");
		expect(html).toContain("max-md:max-h-130");
		expect(html).toContain('aria-label="Agent status updates"');
	});
});
