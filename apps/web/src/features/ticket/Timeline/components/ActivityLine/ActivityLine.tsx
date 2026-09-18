import { type Activity, fullZonedDateTime } from "@trellis/api";
import { type LabelColor, LabelDot, type StatusCategory, StatusIcon } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { ActorChip } from "../../../../agents/ActorChip";
import { describeActivity } from "../../utils/describeActivity";

export type ActivityLineProps = {
	item: Activity;
	// Who reviews in the status with this name. The activity row keeps the
	// category of a status but not its reviewer.
	reviewer?: (statusName: string) => "human" | "agent";
};

// The text color of a status name. It is the color of its icon.
const categoryText: Record<StatusCategory, string> = {
	todo: "text-fg-muted",
	started: "text-warning",
	review: "text-accent",
	done: "text-success",
	canceled: "text-fg-faint",
};

function StatusName({ name, category, reviewer }: { name: string; category: StatusCategory; reviewer: string }) {
	const agent = category === "review" && reviewer === "agent";
	return (
		<span className="inline-flex items-center gap-1 whitespace-nowrap">
			<StatusIcon category={category} reviewer={agent ? "agent" : "human"} className="size-3" />
			<span className={agent ? "text-agent" : categoryText[category]}>{name}</span>
		</span>
	);
}

// A status row stores the two categories in `meta`, so the line can draw
// both icons. `describeActivity` gives the same words as plain text.
function StatusMove({ item, reviewer }: { item: Activity; reviewer: (statusName: string) => "human" | "agent" }) {
	const from = item.fromValue ?? "";
	const to = item.toValue ?? "";
	return (
		<span className="inline-flex min-w-0 items-center gap-1 truncate">
			{" "}
			moved the ticket from{" "}
			<StatusName name={from} category={item.meta.fromCategory as StatusCategory} reviewer={reviewer(from)} /> to{" "}
			<StatusName name={to} category={item.meta.toCategory as StatusCategory} reviewer={reviewer(to)} />
		</span>
	);
}

// A label row keeps the color of the label in `meta`, so the line draws the
// same dot the label pills draw. A row that swaps one label of a group for
// another holds the color of the label the ticket now carries.
function LabelChange({ item }: { item: Activity }) {
	const color = item.meta.color as LabelColor;
	const named = (name: string) => (
		<span className="inline-flex items-center gap-1 whitespace-nowrap">
			<LabelDot color={color} />
			<span className="text-fg">{name}</span>
		</span>
	);
	return (
		<span className="inline-flex min-w-0 items-center gap-1 truncate">
			{item.fromValue === null && <> added the label {named(item.toValue ?? "")}</>}
			{item.toValue === null && <> removed the label {named(item.fromValue ?? "")}</>}
			{item.fromValue !== null && item.toValue !== null && (
				<>
					{" "}
					changed the label from {item.fromValue} to {named(item.toValue)}
				</>
			)}
		</span>
	);
}

const humanReviewer = () => "human" as const;

// One 32 px line: the actor, the verb phrase, and the time. The phrase
// starts with a space, so the line reads as one sentence.
export function ActivityLine({ item, reviewer = humanReviewer }: ActivityLineProps) {
	const actor = item.actor;
	const statusMove = item.field === "status" && item.meta.fromCategory !== undefined;
	const labelChange = item.field === "labels";
	return (
		<li
			data-kind="activity"
			data-stream-entry="activity"
			className="relative flex h-8 items-center gap-2 text-sm text-fg-muted"
		>
			<ActorChip compact className="gap-2.5" actor={actor} />
			{statusMove && <StatusMove item={item} reviewer={reviewer} />}
			{labelChange && <LabelChange item={item} />}
			{!statusMove && !labelChange && <span className="min-w-0 truncate"> {describeActivity(item)}</span>}
			<time
				dateTime={item.createdAt}
				title={fullZonedDateTime(item.createdAt)}
				className="ml-auto shrink-0 text-fg-faint tabular"
			>
				{compactRelativeTime(item.createdAt)}
			</time>
		</li>
	);
}
