import { useState } from "react";
import { flushSync } from "react-dom";
import { SessionStatusPane, type SessionUpdate } from "../../../../src/domain/SessionStatusPane";
import { runChecks } from "../runChecks";

const now = new Date(2026, 8, 29, 14, 45).toISOString();
const initial: SessionUpdate[] = Array.from({ length: 12 }, (_, index) => ({
	id: `update-${index}`,
	runId: "fixture-run",
	sessionId: null,
	requestId: null,
	createdAt: new Date(2026, 8, 29 - Math.floor(index / 4), 14, 42 - index).toISOString(),
	body: `## Update ${index}\n\n${"A retained update explains the current work and the next step. ".repeat(index === 0 ? 35 : 3)}\n\n[Read the report](https://example.com)`,
	embeds:
		index === 0
			? [
					{
						title: "Isolated report",
						html: '<h1>Report</h1><p>Retained HTML content</p><input aria-label="Report note" />',
					},
				]
			: [],
}));

export function Fixture() {
	const [updates, setUpdates] = useState(initial);
	const [mode, setMode] = useState("ready");
	const [result, setResult] = useState("Not run");
	const add = () =>
		flushSync(() =>
			setUpdates((rows) => [
				{
					...initial[0]!,
					id: `new-${rows.length}`,
					createdAt: new Date(2026, 8, 29, 15, rows.length).toISOString(),
					body: "## A new update\n\nNew content.",
					embeds: [],
				},
				...rows,
			]),
		);
	return (
		<main className="flex min-h-screen flex-col gap-3 bg-bg p-3 text-fg">
			<h1>Session timeline fixture</h1>
			<div className="flex flex-wrap gap-3">
				<button type="button" onClick={add}>
					Add update
				</button>
				<button
					type="button"
					onClick={() => {
						document.documentElement.classList.toggle("dark");
					}}
				>
					Theme
				</button>
				<select aria-label="Fixture state" value={mode} onChange={(event) => setMode(event.target.value)}>
					{["ready", "empty", "paused", "failed"].map((value) => (
						<option key={value}>{value}</option>
					))}
				</select>
				<button
					type="button"
					onClick={() => {
						flushSync(() => {
							setMode("ready");
							setUpdates(initial);
						});
						setResult(JSON.stringify(runChecks(add)));
					}}
				>
					Run mounted checks
				</button>
			</div>
			<output aria-label="Mounted results">{result}</output>
			<div data-fixture-pane className="h-130 w-93.5 max-w-full min-h-0">
				<SessionStatusPane
					updates={{
						latest: mode === "empty" ? null : updates[0]!,
						previous: updates[1]!,
						history: mode === "empty" ? [] : updates,
						request: null,
					}}
					processState={mode === "paused" ? "paused" : "active"}
					now={now}
					observerError={mode === "failed" ? "Fixture failure" : null}
					onOpenLink={(href) => setResult(href)}
					renderMarkdown={(body) => (
						<>
							{body.split("\n\n").map((part) =>
								part.startsWith("## ") ? (
									<h2 key={part}>{part.slice(3)}</h2>
								) : part.startsWith("[Read") ? (
									<a key={part} href="https://example.com">
										Read the report
									</a>
								) : (
									<p key={part}>{part}</p>
								),
							)}
						</>
					)}
				/>
			</div>
		</main>
	);
}
