import { ActorChip } from "../../../domain/ActorChip";
import { type Check, CheckRibbon } from "../../../domain/CheckRibbon";
import { type Priority, PriorityIcon } from "../../../domain/PriorityIcon";
import { StatusIcon } from "../../../domain/StatusIcon";
import { TicketId } from "../../../domain/TicketId";
import { TrellisMark } from "../../../domain/TrellisMark";
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

// The trellis-specific marks in every variant.
export function DomainSections() {
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
			<Section name="TrellisMark" note="16 px in the sidebar; 32 px on the setup card; the favicon drawing">
				<TrellisMark />
				<TrellisMark className="size-8" label="trellis" />
			</Section>
		</>
	);
}
