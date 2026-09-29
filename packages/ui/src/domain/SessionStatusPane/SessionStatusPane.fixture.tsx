import { useState } from "react";
import { SessionStatusPane } from "./SessionStatusPane";
import type { SessionStatusPaneProps, SessionUpdateRequest, SessionUpdates } from "./types";

type FixtureState = "working" | "requested" | "late" | "empty" | "paused" | "failed" | "completed";

const latest = {
	id: "update-2",
	sessionId: "session-1",
	runId: "run-1",
	requestId: "request-2",
	body: "Rich status fixture",
	embeds: [
		{
			title: "Interactive check",
			html: "<button onclick=\"document.querySelector('output').textContent='Local control passed'\">Run local check</button><output>Waiting</output>",
		},
	],
	createdAt: "2026-09-29T05:38:00.000Z",
};

const previous = {
	...latest,
	id: "update-1",
	requestId: "request-1",
	body: "Earlier status fixture",
	embeds: [],
	createdAt: "2026-09-29T05:30:00.000Z",
};

const request = (state: SessionUpdateRequest["state"], requestedAt: string): SessionUpdateRequest => ({
	requestId: "request-3",
	requestedAt,
	state,
	error: state === "failed" ? "Provider unavailable" : null,
});

const fixtureProps = (state: FixtureState): Pick<SessionStatusPaneProps, "updates" | "processState"> => {
	const updates: SessionUpdates = { latest, previous, request: null };
	if (state === "empty") return { updates: { latest: null, previous: null, request: null }, processState: "active" };
	if (state === "requested")
		return { updates: { ...updates, request: request("sent", "2026-09-29T05:35:00.000Z") }, processState: "active" };
	if (state === "late")
		return {
			updates: {
				...updates,
				latest: { ...latest, createdAt: "2026-09-29T05:28:00.000Z" },
				request: request("pending", "2026-09-29T05:27:00.000Z"),
			},
			processState: "active",
		};
	if (state === "paused") return { updates, processState: "paused" };
	if (state === "failed")
		return { updates: { ...updates, request: request("failed", "2026-09-29T05:32:00.000Z") }, processState: "active" };
	if (state === "completed") return { updates, processState: "completed" };
	return { updates, processState: "active" };
};

const RichContent = () => (
	<>
		<p>
			<strong>I found why the session links stop.</strong> The status pane keeps the latest agent reply while a new
			request waits.
		</p>
		<h3>What I checked</h3>
		<ul>
			<li>The pane scrolls independently.</li>
			<li>The rich message keeps its table and code.</li>
		</ul>
		<table>
			<thead>
				<tr>
					<th>Check</th>
					<th>Result</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>Focused tests</td>
					<td>Passed</td>
				</tr>
				<tr>
					<td>Installed app</td>
					<td>Pending</td>
				</tr>
			</tbody>
		</table>
		<p>
			Read the <a href="https://example.com/check">rendered check</a> or run <code>bun test</code>.
		</p>
		<p>The latest reply stays visible while Trellis waits for the next safe break.</p>
		<p>The previous reply stays behind its disclosure and remains available for comparison.</p>
		<p>The session header remains above this pane while the rich message uses its own scroll area.</p>
	</>
);

export function SessionStatusPaneFixture() {
	const [state, setState] = useState<FixtureState>("working");
	const [selectedLink, setSelectedLink] = useState("None");
	const props = fixtureProps(state);
	return (
		<main className="flex h-dvh flex-col bg-surface text-fg">
			<header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-bg px-5">
				<div>
					<h1 className="text-md font-semibold">Build the rich session status pane</h1>
					<p className="text-xs text-fg-faint">TRL-654 · Agent session</p>
				</div>
				<label className="flex items-center gap-2 text-xs text-fg-muted">
					State
					<select
						value={state}
						onChange={(event) => setState(event.target.value as FixtureState)}
						className="min-h-7 rounded-sm border border-border-strong bg-control px-2 max-md:min-h-11"
					>
						{["working", "requested", "late", "empty", "paused", "failed", "completed"].map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
			</header>
			<div className="flex min-h-0 flex-1 max-md:flex-col">
				<section aria-label="Transcript" className="min-h-0 min-w-0 flex-1 overflow-auto p-6 text-sm leading-relaxed">
					<p className="max-w-2xl">Build the approved rich status pane and keep the transcript available.</p>
					<p className="mt-4 text-xs text-fg-faint">Selected status link: {selectedLink}</p>
					<div className="mt-96 border-t border-border pt-4 text-fg-faint">Long transcript content</div>
				</section>
				<SessionStatusPane
					{...props}
					now="2026-09-29T05:40:00.000Z"
					renderMarkdown={() => <RichContent />}
					onLink={(link) => setSelectedLink(JSON.stringify(link))}
				/>
			</div>
		</main>
	);
}
