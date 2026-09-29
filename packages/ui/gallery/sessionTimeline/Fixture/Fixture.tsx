import { Play, Plus, Sun } from "@phosphor-icons/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { SessionStatusPane, type SessionUpdate } from "../../../src/domain/SessionStatusPane";
import { IconButton } from "../../../src/primitives/IconButton";
import { Select } from "../../../src/primitives/Select";
import { Tooltip } from "../../../src/primitives/Tooltip";
import { runChecks } from "./components/runChecks";
import { runHistoryChecks } from "./components/runHistoryChecks";

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
	const [generation, setGeneration] = useState(0);
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
				<Tooltip content="Add update">
					<IconButton label="Add update" className="max-md:size-11" icon={<Plus />} onClick={add} />
				</Tooltip>
				<Tooltip content="Theme">
					<IconButton
						label="Theme"
						className="max-md:size-11"
						icon={<Sun />}
						onClick={() => {
							document.documentElement.dataset.theme =
								document.documentElement.dataset.theme === "dark" ? "light" : "dark";
						}}
					/>
				</Tooltip>
				<Select
					label="Fixture state"
					value={mode}
					onValueChange={setMode}
					items={["ready", "empty", "paused", "failed", "history-error"].map((value) => ({ value, label: value }))}
				/>
				<Tooltip content="Run mounted checks">
					<IconButton
						label="Run mounted checks"
						className="max-md:size-11"
						icon={<Play />}
						onClick={() => {
							flushSync(() => {
								setMode("ready");
								setGeneration((value) => value + 1);
								setUpdates(initial);
							});
							const checks = runChecks(add);
							checks.push(
								...runHistoryChecks(
									() => {
										setGeneration((value) => value + 1);
										setUpdates(
											Array.from({ length: 1000 }, (_, index) => ({
												...initial[0]!,
												id: `history-${index}`,
												createdAt: new Date(Date.parse(now) - index * 60_000).toISOString(),
												body: `## Retained update ${index}`,
												embeds: [],
											})),
										);
									},
									() => setMode("history-error"),
									add,
								),
							);
							setResult(JSON.stringify(checks));
						}}
					/>
				</Tooltip>
			</div>
			<output aria-label="Mounted results" className="max-h-24 overflow-auto break-words">
				{result}
			</output>
			<div data-fixture-pane className="h-130 w-93.5 max-w-full min-h-0">
				<SessionStatusPane
					key={generation}
					updates={{
						latest: mode === "empty" || mode === "history-error" ? null : updates[0]!,
						previous: updates[1]!,
						history: mode === "empty" || mode === "history-error" ? [] : updates,
						request: null,
					}}
					historyControl={{
						hasMore: false,
						loading: false,
						error: mode === "history-error",
						load() {},
						retry: () => setMode("empty"),
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
