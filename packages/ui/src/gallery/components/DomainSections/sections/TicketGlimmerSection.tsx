import { Paperclip } from "@phosphor-icons/react";
import { useState } from "react";
import { PriorityIcon } from "../../../../domain/PriorityIcon";
import { StatusIcon } from "../../../../domain/StatusIcon";
import { TicketGlimmer } from "../../../../domain/TicketGlimmer";
import { Avatar } from "../../../../primitives/Avatar";
import { Switch } from "../../../../primitives/Switch";
import { Section } from "../../Section";

export function TicketGlimmerSection() {
	const [glimmerActive, setGlimmerActive] = useState(true);
	return (
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
					<Avatar kind="agent" name="Codex agent" className="ml-auto" />
				</div>
			</div>
		</Section>
	);
}
