import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionStatusPane } from "./SessionStatusPane";
import type { SessionStatusPaneProps, SessionUpdate, SessionUpdates } from "./types";

const latest: SessionUpdate = {
	id: "update-2",
	sessionId: "session-1",
	runId: "run-1",
	requestId: "request-2",
	body: "Latest **status**",
	embeds: [],
	createdAt: "2026-09-29T05:38:00.000Z",
};

const previous: SessionUpdate = {
	...latest,
	id: "update-1",
	requestId: "request-1",
	body: "Previous status",
	createdAt: "2026-09-29T05:30:00.000Z",
};

const baseUpdates: SessionUpdates = { latest, previous, request: null };
const baseProps: SessionStatusPaneProps = {
	updates: baseUpdates,
	processState: "active",
	now: "2026-09-29T05:40:00.000Z",
	renderMarkdown: (markdown) => <div data-markdown={markdown}>{markdown}</div>,
	onOpenLink() {},
};

const render = (patch: Partial<SessionStatusPaneProps> = {}) =>
	renderToStaticMarkup(<SessionStatusPane {...baseProps} {...patch} />);

describe("SessionStatusPane", () => {
	test("renders the latest update and defers the previous update", () => {
		const html = render();
		expect(html).toContain("From the agent");
		expect(html).toContain("2 min ago");
		expect(html).toContain('data-markdown="Latest **status**"');
		expect(html).toContain("Previous update");
		expect(html).not.toContain('data-markdown="Previous status"');
		expect(html).not.toContain("<details open");
	});

	test("renders semantic rich content from the supplied Markdown renderer", () => {
		const html = render({
			renderMarkdown: () => (
				<>
					<h3>Checks</h3>
					<p>One paragraph</p>
					<ul>
						<li>One item</li>
					</ul>
					<a href="https://example.com">Read the check</a>
					<code>bun test</code>
					<table>
						<tbody>
							<tr>
								<td>Result</td>
							</tr>
						</tbody>
					</table>
				</>
			),
		});
		for (const element of ["<h3", "<p", "<ul", "<a", "<code", "<table"]) expect(html).toContain(element);
	});

	test.each([
		[
			"requested",
			{
				...baseUpdates,
				request: {
					requestId: "request-3",
					requestedAt: "2026-09-29T05:35:00.000Z",
					state: "sent" as const,
					error: null,
				},
			},
			"active" as const,
			"An update was requested. The last agent reply stays below.",
		],
		[
			"late",
			{
				...baseUpdates,
				latest: { ...latest, createdAt: "2026-09-29T05:28:00.000Z" },
				request: {
					requestId: "request-3",
					requestedAt: "2026-09-29T05:27:00.000Z",
					state: "pending" as const,
					error: null,
				},
			},
			"active" as const,
			"This update is 12 minutes old. Trellis is waiting for a new reply.",
		],
		["paused", baseUpdates, "paused" as const, "The session is paused. This is the last update from the agent."],
		[
			"failed request",
			{
				...baseUpdates,
				request: {
					requestId: "request-3",
					requestedAt: "2026-09-29T05:32:00.000Z",
					state: "failed" as const,
					error: "Provider unavailable",
				},
			},
			"active" as const,
			"The status request failed. The last reply stays below; this does not mean the agent stopped.",
		],
	])("keeps the latest reply in the %s state", (_name, updates, processState, notice) => {
		const html = render({ updates, processState });
		expect(html).toContain(notice);
		expect(html).toContain('data-markdown="Latest **status**"');
	});

	test("shows the first-update state without a previous disclosure", () => {
		const html = render({ updates: { latest: null, previous: null, request: null } });
		expect(html).toContain("No update yet");
		expect(html).toContain("The agent has not supplied a status update yet.");
		expect(html).not.toContain("Previous update");
	});

	test("keeps a completed update without a process warning", () => {
		const html = render({
			processState: "completed",
			updates: {
				...baseUpdates,
				request: {
					requestId: "request-3",
					requestedAt: "2026-09-29T05:32:00.000Z",
					state: "failed",
					error: "Provider unavailable",
				},
			},
		});
		expect(html).toContain('data-markdown="Latest **status**"');
		expect(html).not.toContain("The session is paused");
		expect(html).not.toContain("status request failed");
	});

	test("uses an independent bounded pane at desktop and narrow widths", () => {
		const html = render();
		expect(html).toContain("w-93.5");
		expect(html).toContain("max-md:order-first");
		expect(html).toContain("max-md:max-h-130");
		expect(html).toContain('aria-label="Agent status updates"');
		expect(html).toContain("overflow-auto");
	});

	test("keeps the five-minute policy behind a disclosure", () => {
		const html = render();
		expect(html).toContain("Updates every 5 min");
		expect(html).toContain("The latest reply stays visible until a new reply arrives.");
		expect(html).toContain("A paused session receives no automatic request.");
	});
});
