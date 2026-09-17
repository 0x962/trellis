import { Paperclip } from "@phosphor-icons/react";
import { useState } from "react";
import { ActorChip } from "../../../domain/ActorChip";
import { type Check, CheckRibbon } from "../../../domain/CheckRibbon";
import { type Priority, PriorityIcon } from "../../../domain/PriorityIcon";
import { type PullRequestReviewStatus, ReviewStatusSummary } from "../../../domain/ReviewStatusSummary";
import { StatusIcon } from "../../../domain/StatusIcon";
import { TicketGlimmer } from "../../../domain/TicketGlimmer";
import { TicketId } from "../../../domain/TicketId";
import { TrellisMark } from "../../../domain/TrellisMark";
import { Avatar } from "../../../primitives/Avatar";
import { Switch } from "../../../primitives/Switch";
import { Section } from "../Section";

const priorities: Priority[] = ["none", "low", "medium", "high", "urgent"];

const ribbon = (buckets: Check["bucket"][]) => buckets.map((bucket, index) => ({ name: `check ${index + 1}`, bucket }));

const passing = ribbon(["pass", "pass", "pass", "pass", "pass", "pass"]);
const mixed = ribbon(["pass", "fail", "pass", "pending", "pending"]);
const queued = ribbon(["pending", "pending", "pending", "pending"]);
const skipped = ribbon(["pass", "pass", "skipping", "pass"]);
// 40 checks with one failure: the gaps close and every segment stays visible.
const crowded = ribbon(Array.from({ length: 40 }, (_, index) => (index === 19 ? "fail" : "pass")));
// 80 checks with one failure: more checks than px, so the ribbon draws runs.
const packed = ribbon(Array.from({ length: 80 }, (_, index) => (index === 39 ? "fail" : "pass")));

const reviews: PullRequestReviewStatus[] = (
	[
		{ reviewState: "none", isDraft: false },
		{ reviewState: "review_required", isDraft: false },
		{ reviewState: "changes_requested", isDraft: false },
		{ reviewState: "approved", isDraft: false },
		{ reviewState: "approved", isDraft: false },
		{ reviewState: "approved", isDraft: false },
		{ reviewState: "review_required", isDraft: false },
		{ reviewState: "changes_requested", isDraft: false },
		{ reviewState: "none", isDraft: true },
		{ reviewState: "approved", isDraft: false },
	] as const
).map((review, index) => ({ ...review, owner: "0x962", repo: "trellis", number: 100 + index }));

// The trellis-specific marks in every variant.
export function DomainSections() {
	const [glimmerActive, setGlimmerActive] = useState(true);
	return (
		<>
			<Section name="StatusIcon" note="by category; review by reviewer; started by progress">
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="todo" /> Todo
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="started" /> In Progress
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="started" progress={0.25} /> 1/4 done
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="started" progress={0.6} /> 3/5 done
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="started" progress={1} /> 5/5 done
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="review" reviewer="agent" /> Agent Review
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="review" reviewer="human" /> Human Review
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="done" /> Done
				</span>
				<span className="inline-flex items-center gap-2 text-sm">
					<StatusIcon category="canceled" /> <s className="text-fg-muted">Canceled</s>
				</span>
			</Section>
			<Section name="PriorityIcon" note="none, low, medium, high, urgent">
				{priorities.map((priority) => (
					<span key={priority} className="inline-flex items-center gap-2 text-sm">
						<PriorityIcon priority={priority} /> {priority}
					</span>
				))}
			</Section>
			<Section name="ReviewStatusSummary" note="five approval icons; five more behind a hover card">
				<ReviewStatusSummary reviews={reviews.slice(0, 5)} />
				<ReviewStatusSummary reviews={reviews} />
			</Section>
			<Section name="CheckRibbon" note="full and mini; passed, failed, pending, skipped; 40 and 80 checks">
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon checks={passing} /> 6 passed
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon checks={mixed} /> 1 failed, 2 pending
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon checks={queued} /> queued
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon checks={skipped} /> 1 skipped
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon size="mini" checks={passing} /> mini
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon size="mini" checks={mixed} /> mini
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon checks={crowded} /> 40 checks, 1 failed
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon size="mini" checks={crowded} /> mini, 40 checks
				</span>
				<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
					<CheckRibbon checks={packed} /> 80 checks, 1 failed
				</span>
			</Section>
			<Section name="ActorChip" note="human; agent; agent live; compact">
				<ActorChip name="dana" kind="human" />
				<ActorChip name="codex" kind="agent" />
				<ActorChip name="claude-code" kind="agent" />
				<ActorChip name="claude-code" kind="agent" compact />
			</Section>
			<Section name="TicketId" note="md in a row; sm on a card">
				<TicketId id="CDE-43" />
				<TicketId id="TRL-9" size="sm" />
			</Section>
			<Section name="TicketGlimmer" note="active work; moving soap-film layers">
				<Switch label="Agent working" checked={glimmerActive} onCheckedChange={setGlimmerActive} />
				<div className="relative flex min-h-28 w-75 flex-col gap-1.5 rounded-md border-x border-b border-border bg-surface p-3 text-base">
					<TicketGlimmer active={glimmerActive} />
					<div className="flex h-4 items-center justify-between gap-1.5">
						<span className="font-mono text-xs text-fg-faint tabular">TRL-139</span>
						<PriorityIcon priority="high" />
					</div>
					<p className="line-clamp-3 font-medium text-fg">We need to improve the working glimmer animation</p>
					<div className="mt-auto flex min-h-4 items-center gap-1.5 text-xs text-fg-faint tabular">
						<span className="inline-flex items-center gap-1">
							<StatusIcon category="started" progress={0.5} label="Sub-ticket progress" />
							1/2
						</span>
						<span className="inline-flex items-center gap-1">
							<Paperclip aria-hidden="true" className="size-3" />2
						</span>
						<Avatar kind="human" name="Navid Khan" className="ml-auto" />
					</div>
				</div>
				<div className="relative flex min-h-28 w-75 flex-col gap-1.5 rounded-md border-x border-b border-border bg-surface p-3 text-base">
					<TicketGlimmer active={glimmerActive} />
					<div className="flex h-4 items-center justify-between gap-1.5">
						<span className="font-mono text-xs text-fg-faint tabular">TRL-24 → TRL-86</span>
						<PriorityIcon priority="medium" />
					</div>
					<p className="line-clamp-3 font-medium text-fg">Keep working tickets visible at the top of each column</p>
					<div className="mt-auto flex min-h-4 items-center gap-1.5 text-xs text-fg-faint tabular">
						<span className="inline-flex items-center gap-1">
							<StatusIcon category="started" progress={0.75} label="Sub-ticket progress" />
							3/4
						</span>
						<span className="inline-flex items-center gap-1">
							<Paperclip aria-hidden="true" className="size-3" />1
						</span>
						<Avatar kind="agent" name="claude-code" className="ml-auto" />
					</div>
				</div>
				<div className="relative flex min-h-28 w-75 flex-col gap-1.5 rounded-md border-x border-b border-border bg-surface p-3 text-base">
					<TicketGlimmer active={glimmerActive} />
					<div className="flex h-4 items-center justify-between gap-1.5">
						<span className="font-mono text-xs text-fg-faint tabular">TRL-140</span>
						<PriorityIcon priority="low" />
					</div>
					<p className="line-clamp-3 font-medium text-fg">Review the board card details</p>
					<div className="mt-auto flex min-h-4 items-center gap-1.5 text-xs text-fg-faint tabular">
						<Avatar kind="agent" name="codex" className="ml-auto" />
					</div>
				</div>
			</Section>
			<Section name="TrellisMark" note="16 px in the sidebar; 32 px on the setup card; the favicon drawing">
				<TrellisMark />
				<TrellisMark className="size-8" label="trellis" />
			</Section>
		</>
	);
}
