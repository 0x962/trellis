import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../../primitives/Badge";
import { cx } from "../../utils/cx";
import { formatClock } from "../../utils/formatClock";

export type FlowRunStatus = "running" | "waiting" | "succeeded" | "failed" | "canceled";

const statuses: Record<FlowRunStatus, { label: string; tone: BadgeTone }> = {
	running: { label: "Running", tone: "accent" },
	waiting: { label: "Needs you", tone: "wait" },
	succeeded: { label: "Succeeded", tone: "ok" },
	failed: { label: "Failed", tone: "bad" },
	canceled: { label: "Canceled", tone: "neutral" },
};

const noticeTones: Record<FlowRunStatus, string> = {
	running: "text-fg-muted",
	waiting: "text-warning",
	succeeded: "text-fg-muted",
	failed: "text-danger",
	canceled: "text-fg-muted",
};

export type FlowRunSummaryProps = {
	name: string;
	version: number;
	status: FlowRunStatus;
	// Unix milliseconds of the start, for the exact time on hover.
	startedAt: number;
	// The start as the caller's clock reads it, such as "12m ago".
	startedLabel: string;
	durationMs: number;
	// The fact to act on: the step that failed, the step that waits, or the
	// reason of a cancel.
	notice: string | null;
	// IconButtons at the right edge.
	actions?: ReactNode;
	// A collapsible run shows a caret and toggles on its name.
	expanded?: boolean;
	onToggle?: () => void;
};

// The header of one flow run: the flow name and version, the state pill,
// when the run started and how long it ran, and its actions. The notice
// under the header names what to look at.
export function FlowRunSummary({
	name,
	version,
	status,
	startedAt,
	startedLabel,
	durationMs,
	notice,
	actions,
	expanded,
	onToggle,
}: FlowRunSummaryProps) {
	const { label, tone } = statuses[status];
	const Caret = expanded ? CaretDown : CaretRight;
	const title = (
		<>
			<span className="truncate">{name}</span>
			<span className="shrink-0 font-normal text-fg-faint tabular">v{version}</span>
		</>
	);
	return (
		<div className="flex flex-col gap-1">
			<div className="flex min-h-7 items-center gap-2">
				<h4 className="flex min-w-0 items-center text-sm font-medium text-fg">
					{onToggle ? (
						<button
							type="button"
							aria-expanded={expanded}
							onClick={onToggle}
							className="-ml-1 flex min-w-0 items-center gap-2 rounded-md px-1 text-fg-muted transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
						>
							<Caret aria-hidden="true" className="size-3 shrink-0 text-fg-faint" />
							{title}
						</button>
					) : (
						<span className="flex min-w-0 items-center gap-2">{title}</span>
					)}
				</h4>
				<Badge tone={tone}>{label}</Badge>
				<span className="shrink-0 text-xs text-fg-faint tabular">
					<time dateTime={new Date(startedAt).toISOString()} title={new Date(startedAt).toLocaleString()}>
						{startedLabel}
					</time>
					{" · "}
					{formatClock(durationMs)}
				</span>
				{actions !== undefined && <span className="ml-auto flex shrink-0 items-center gap-1">{actions}</span>}
			</div>
			{notice !== null && <p className={cx("text-sm", noticeTones[status])}>{notice}</p>}
		</div>
	);
}
