import { Paperclip } from "@phosphor-icons/react";
import { useState } from "react";
import { type Priority, PriorityIcon } from "../../../../domain/PriorityIcon";
import { StatusIcon } from "../../../../domain/StatusIcon";
import { TicketGlimmer } from "../../../../domain/TicketGlimmer";
import { ticketCardFrame } from "../../../../domain/ticketCardFrame";
import { Avatar } from "../../../../primitives/Avatar";
import { Switch } from "../../../../primitives/Switch";
import { cx } from "../../../../utils/cx";
import { Section } from "../../Section";

type Sample = {
	id: string;
	priority: Priority;
	title: string;
	// The share of sub-tickets that are done, or null when the ticket has no
	// sub-tickets.
	progress: number | null;
	done: number;
	total: number;
	attachments: number;
	actor: { kind: "human" | "agent"; name: string };
};

const samples: Sample[] = [
	{
		id: "TRL-139",
		priority: "high",
		title: "We need to improve the working glimmer animation",
		progress: 0.5,
		done: 1,
		total: 2,
		attachments: 2,
		actor: { kind: "human", name: "Navid Khan" },
	},
	{
		id: "TRL-24 → TRL-86",
		priority: "medium",
		title: "Keep working tickets visible at the top of each column",
		progress: 0.75,
		done: 3,
		total: 4,
		attachments: 1,
		actor: { kind: "agent", name: "claude-code" },
	},
	{
		id: "TRL-140",
		priority: "low",
		title: "Review the board card details",
		progress: null,
		done: 0,
		total: 0,
		attachments: 0,
		actor: { kind: "agent", name: "Codex agent" },
	},
];

export function TicketGlimmerSection() {
	const [glimmerActive, setGlimmerActive] = useState(true);
	return (
		<Section name="TicketGlimmer" note="active work; moving soap-film layers">
			<Switch label="Agent working" checked={glimmerActive} onCheckedChange={setGlimmerActive} />
			{samples.map((sample) => (
				<div
					key={sample.id}
					className={cx(ticketCardFrame, "min-h-28 w-75 gap-1.5 border-border bg-surface text-base")}
				>
					<TicketGlimmer active={glimmerActive} />
					<div className="flex h-4 items-center justify-between gap-1.5">
						<span className="font-mono text-xs text-fg-faint tabular">{sample.id}</span>
						<PriorityIcon priority={sample.priority} />
					</div>
					<p className="line-clamp-3 font-medium text-fg">{sample.title}</p>
					<div className="mt-auto flex min-h-4 items-center gap-1.5 text-xs text-fg-faint tabular">
						{sample.progress !== null && (
							<span className="inline-flex items-center gap-1">
								<StatusIcon category="started" progress={sample.progress} label="Sub-ticket progress" />
								{sample.done}/{sample.total}
							</span>
						)}
						{sample.attachments > 0 && (
							<span className="inline-flex items-center gap-1">
								<Paperclip aria-hidden="true" className="size-3" />
								{sample.attachments}
							</span>
						)}
						<Avatar kind={sample.actor.kind} name={sample.actor.name} className="ml-auto" />
					</div>
				</div>
			))}
		</Section>
	);
}
