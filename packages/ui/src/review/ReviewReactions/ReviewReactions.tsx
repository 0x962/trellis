import { Confetti, Eye, Heart, Question, Rocket, Smiley, ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Popover } from "../../primitives/Popover";
import { Tooltip } from "../../primitives/Tooltip";

type Reaction = { reaction: string; author: string; kind: string };
const choices = [
	{ value: "+1", label: "Agree", icon: ThumbsUp },
	{ value: "-1", label: "Disagree", icon: ThumbsDown },
	{ value: "laugh", label: "Laugh", icon: Smiley },
	{ value: "hooray", label: "Celebrate", icon: Confetti },
	{ value: "confused", label: "Confused", icon: Question },
	{ value: "heart", label: "Love", icon: Heart },
	{ value: "rocket", label: "Launch", icon: Rocket },
	{ value: "eyes", label: "Seen", icon: Eye },
];
export function ReviewReactions({
	reactions,
	actor,
	busy,
	onReaction,
}: {
	reactions: Reaction[];
	actor?: string;
	busy: boolean;
	onReaction: (reaction: string, remove: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const returnFocus = useRef<string | null>(null);
	useEffect(() => {
		if (
			!busy &&
			returnFocus.current &&
			!reactions.some((r) => r.reaction === returnFocus.current && r.author === actor)
		) {
			returnFocus.current = null;
			trigger.current?.focus({ preventScroll: true });
		}
	}, [busy, reactions, actor]);
	return (
		<fieldset className="review-reactions" aria-label="Reactions">
			{choices
				.filter((c) => reactions.some((r) => r.reaction === c.value))
				.map((c) => {
					const members = reactions.filter((r) => r.reaction === c.value);
					const active = members.some((r) => r.author === actor);
					return (
						<span className="review-reaction-count" key={c.value}>
							<Tooltip content={`${c.label}: ${members.map((r) => r.author).join(", ")}`}>
								<IconButton
									label={`${c.label} (${members.length})`}
									icon={<c.icon />}
									pressed={active}
									disabled={busy}
									onClick={() => {
										returnFocus.current = active ? c.value : null;
										onReaction(c.value, active);
									}}
								/>
							</Tooltip>
							<span aria-hidden="true">{members.length}</span>
						</span>
					);
				})}
			<Popover
				triggerTooltip="Add reaction"
				label="Choose a reaction"
				open={open}
				onOpenChange={setOpen}
				trigger={<IconButton ref={trigger} label="Add reaction" icon={<Smiley />} disabled={busy} />}
			>
				<div className="review-reaction-picker">
					{choices.map((c) => (
						<Tooltip key={c.value} content={c.label}>
							<IconButton
								label={c.label}
								icon={<c.icon />}
								pressed={reactions.some((r) => r.reaction === c.value && r.author === actor)}
								disabled={busy}
								onClick={() => {
									onReaction(
										c.value,
										reactions.some((r) => r.reaction === c.value && r.author === actor),
									);
									setOpen(false);
								}}
							/>
						</Tooltip>
					))}
				</div>
			</Popover>
		</fieldset>
	);
}
