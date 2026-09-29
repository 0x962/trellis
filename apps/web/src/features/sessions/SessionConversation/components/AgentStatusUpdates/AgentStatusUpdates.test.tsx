import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import type { SessionUpdates } from "@trellis/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentStatusUpdatesPane } from "./AgentStatusUpdatesPane";

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

const renderPane = (value = updates) =>
	renderToStaticMarkup(
		<AgentStatusUpdatesPane
			run={run}
			updates={value}
			now="2026-09-29T06:00:00.000Z"
			onOpenLink={() => {}}
			renderMarkdown={(markdown) => <p data-markdown={markdown}>{markdown}</p>}
		/>,
	);

const renderConversation = () =>
	renderToStaticMarkup(
		<section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex min-h-0 flex-1 max-md:flex-col">
				<div data-transcript className="flex min-h-0 min-w-0 flex-1 flex-col">
					Transcript
				</div>
				<AgentStatusUpdatesPane
					run={run}
					updates={updates}
					now="2026-09-29T06:00:00.000Z"
					onOpenLink={() => {}}
					renderMarkdown={(markdown) => <p data-markdown={markdown}>{markdown}</p>}
				/>
			</div>
		</section>,
	);

describe("AgentStatusUpdatesPane", () => {
	test("renders the saved update after the ticket completes", () => {
		const html = renderPane();
		expect(html).toContain("Session A **finished**.");
		expect(html).toContain("2 min ago");
		expect(html).toContain("Previous update");
		expect(html).not.toContain("The session is paused");
	});

	test("keeps updates from another session out of the selected session", () => {
		const html = renderPane({
			...updates,
			latest: { ...updates.latest!, body: "Only the selected session appears." },
		});
		expect(html).toContain("Only the selected session appears.");
		expect(html).not.toContain("Session B");
	});

	test("places the bounded pane beside the transcript and above it at narrow widths", () => {
		const html = renderConversation();
		expect(html).toContain("max-md:flex-col");
		expect(html).toContain("w-93.5");
		expect(html).toContain("max-md:order-first");
		expect(html).toContain("max-md:max-h-130");
		expect(html).toContain('aria-label="Agent status updates"');
		expect(html.indexOf("data-transcript")).toBeLessThan(html.indexOf('aria-label="Session status"'));
	});
});
