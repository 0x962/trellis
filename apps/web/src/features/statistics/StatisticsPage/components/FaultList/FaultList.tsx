import { ChatCenteredDots, ChatCenteredSlash, CheckCircle, FlowArrow, Plugs, Stop } from "@phosphor-icons/react";
import type { StatisticsFault, StatisticsFaultKind } from "@trellis/api";
import { cx } from "@trellis/ui";
import type { ReactElement } from "react";
import { compactRelativeTime } from "../../../../../lib/format";
import { SourceMark } from "../SourceMark";
import { TicketCell } from "../TicketCell";
import { type FaultTone, faultWords } from "./faultWords";

// One glyph per fault, and no two faults share one.
const glyphs: Record<StatisticsFaultKind, ReactElement> = {
	agentRunDead: <Plugs />,
	reviewMessageFailed: <ChatCenteredSlash />,
	reviewMessageHeld: <ChatCenteredDots />,
	flowRunWaiting: <Stop />,
	flowRunRunning: <FlowArrow />,
};

const tones: Record<FaultTone, string> = {
	danger: "text-danger",
	warning: "text-warning",
	muted: "text-fg-faint",
};

// The count of the cases that the row does not name.
const rest = (count: number) => (count === 1 ? "This is the only one." : `${count - 1} more of this fault.`);

export function FaultList({ faults }: { faults: readonly StatisticsFault[] }) {
	if (faults.length === 0)
		return (
			<div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg-muted">
				<CheckCircle aria-hidden="true" className="size-4 shrink-0 text-success" />
				Nothing is broken. Every agent run holds a live process, every review message reached its agent, and every flow
				run moved.
			</div>
		);
	return (
		<ul className="overflow-hidden rounded-lg border border-border bg-surface">
			{faults.map((fault) => {
				const words = faultWords[fault.kind];
				return (
					<li
						key={fault.kind}
						className="flex min-h-10 items-center gap-3 border-border border-t px-3 py-2 first:border-t-0 max-md:gap-2 max-md:px-2"
					>
						<span aria-hidden="true" className={cx("flex size-4 shrink-0 items-center *:size-full", tones[words.tone])}>
							{glyphs[fault.kind]}
						</span>
						<span className="w-18 shrink-0">
							<TicketCell identifier={fault.oldest.identifier} title={fault.oldest.title} />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-fg text-sm max-md:overflow-visible max-md:whitespace-normal">
								{words.name}
							</span>
							<span className="block truncate text-fg-faint text-xs max-md:overflow-visible max-md:whitespace-normal">
								{rest(fault.count)} {words.repair}
							</span>
						</span>
						<time
							dateTime={fault.oldest.since}
							title={words.ageOf}
							className="w-14 shrink-0 text-right text-fg-muted text-sm tabular"
						>
							{compactRelativeTime(fault.oldest.since)}
						</time>
						<SourceMark source={words.source} />
					</li>
				);
			})}
		</ul>
	);
}
