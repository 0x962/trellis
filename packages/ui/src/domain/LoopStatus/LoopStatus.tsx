import { Lightning, Pause, Play, Trash } from "@phosphor-icons/react";
import { Badge } from "../../primitives/Badge";
import { IconButton } from "../../primitives/IconButton";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Tooltip } from "../../primitives/Tooltip";

type Entry = { id: number; at: string; message: string; level: "info" | "error" };
export type LoopStatusProps = {
	name: string;
	description: string;
	paused: boolean;
	working: boolean;
	step: string;
	runCount: number;
	lastStartedAt: string | null;
	lastFinishedAt: string | null;
	nextRunAt: string | null;
	lastError: string | null;
	output: Entry[];
	errors: Entry[];
	busy: boolean;
	onAction: (action: "pause" | "resume" | "run" | "clear") => void;
};
const timestamp = (at: string | null) => (at === null ? "None" : new Date(at).toLocaleString());

export function LoopStatus(props: LoopStatusProps) {
	const { name, description, paused, working, step, lastError, output, errors, busy, onAction } = props;
	const state = working
		? paused
			? "Paused after current pass"
			: "Working"
		: paused
			? "Paused"
			: lastError
				? "Error"
				: "Waiting";
	return (
		<section aria-label={name} className="flex min-w-0 flex-col gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-xl font-semibold text-fg">{name}</h2>
				<div className="flex items-center gap-2">
					<Badge tone={lastError ? "bad" : paused ? "wait" : working ? "accent" : "neutral"}>{state}</Badge>
					<Tooltip content={paused ? "Resume loop" : "Pause loop"}>
						<IconButton
							label={paused ? "Resume loop" : "Pause loop"}
							icon={paused ? <Play /> : <Pause />}
							disabled={busy}
							onClick={() => onAction(paused ? "resume" : "pause")}
						/>
					</Tooltip>
					<Tooltip content="Run now">
						<IconButton
							label="Run now"
							icon={<Lightning />}
							disabled={busy || working}
							onClick={() => onAction("run")}
						/>
					</Tooltip>
					<Tooltip content="Clear output and errors">
						<IconButton
							label="Clear output and errors"
							icon={<Trash />}
							disabled={busy || (!output.length && !errors.length)}
							onClick={() => onAction("clear")}
						/>
					</Tooltip>
				</div>
			</div>
			<p className="text-sm text-fg-muted text-pretty">{description}</p>
			<p className="text-sm text-fg-muted text-pretty">
				Checks repeat one second after each pass. Pause lets the current pass finish; agents and message delivery
				continue. Run now performs one pass. Automatic checks resume when Trellis restarts.
			</p>
			<dl className="grid grid-cols-2 gap-3 text-sm tabular-nums">
				<dt className="text-fg-muted">Current step</dt>
				<dd className="break-words">{step}</dd>
				<dt className="text-fg-muted">Passes</dt>
				<dd>{props.runCount}</dd>
				<dt className="text-fg-muted">Last start</dt>
				<dd>{timestamp(props.lastStartedAt)}</dd>
				<dt className="text-fg-muted">Last finish</dt>
				<dd>{timestamp(props.lastFinishedAt)}</dd>
				<dt className="text-fg-muted">Next pass</dt>
				<dd>{paused ? "Paused" : working ? "After this pass" : timestamp(props.nextRunAt)}</dd>
			</dl>
			{lastError && (
				<p role="alert" className="whitespace-pre-wrap break-words text-sm text-danger">
					{lastError}
				</p>
			)}
			<div>
				<SectionHeader title="Errors" count={errors.length} level={3} />
				{errors.length === 0 ? (
					<p className="py-2 text-sm text-fg-muted">No errors recorded.</p>
				) : (
					<ul aria-label="Loop errors" className="max-h-48 overflow-y-auto divide-y divide-border">
						{errors.toReversed().map((entry) => (
							<li key={entry.id} className="py-2 text-sm">
								<time dateTime={entry.at} className="text-xs text-fg-muted tabular-nums">
									{timestamp(entry.at)}
								</time>
								<p className="whitespace-pre-wrap break-words text-danger">{entry.message}</p>
							</li>
						))}
					</ul>
				)}
			</div>
			<div>
				<SectionHeader title="Recent output" count={output.length} level={3} />
				<div
					role="log"
					aria-label="Loop output"
					aria-live="off"
					className="h-64 overflow-y-auto rounded-lg border border-border bg-surface p-3"
				>
					{output.length === 0 ? (
						<p className="text-sm text-fg-muted">No output yet.</p>
					) : (
						<ol className="flex flex-col gap-2 font-mono text-xs">
							{output.toReversed().map((entry) => (
								<li key={entry.id} className="whitespace-pre-wrap break-words">
									<time dateTime={entry.at} className="text-fg-muted tabular-nums">
										{timestamp(entry.at)}{" "}
									</time>
									<span className={entry.level === "error" ? "text-danger" : "text-fg"}>{entry.message}</span>
								</li>
							))}
						</ol>
					)}
				</div>
				<p className="mt-2 text-xs text-fg-faint">
					Latest 200 output entries and 20 errors. History clears when Trellis restarts.
				</p>
			</div>
		</section>
	);
}
