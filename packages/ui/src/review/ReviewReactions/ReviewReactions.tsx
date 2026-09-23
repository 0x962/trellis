import { Smiley } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Popover } from "../../primitives/Popover";
import { Tooltip } from "../../primitives/Tooltip";

type Reaction = { reaction: string; author: string; kind: string };

// GitHub stores a reaction under a name such as "+1" or "hooray". The emoji is
// the picture GitHub draws for that name. The name is the value trellis sends
// back to GitHub, so it never changes when the picture does.
const choices = [
	{ value: "+1", label: "Agree", emoji: "\u{1F44D}" },
	{ value: "-1", label: "Disagree", emoji: "\u{1F44E}" },
	{ value: "laugh", label: "Laugh", emoji: "\u{1F604}" },
	{ value: "hooray", label: "Celebrate", emoji: "\u{1F389}" },
	{ value: "confused", label: "Confused", emoji: "\u{1F615}" },
	{ value: "heart", label: "Love", emoji: "\u{2764}\u{FE0F}" },
	{ value: "rocket", label: "Launch", emoji: "\u{1F680}" },
	{ value: "eyes", label: "Seen", emoji: "\u{1F440}" },
];

// IconButton draws whatever it is given inside a 14 px square and hides it from
// a screen reader, so the reader says the button label instead of the name of
// the emoji. The font is the one the operating system keeps for emoji, and the
// character is in the file, so the app draws it with no network request.
function ReactionEmoji({ emoji }: { emoji: string }) {
	return <span className="review-reaction-emoji">{emoji}</span>;
}
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
									icon={<ReactionEmoji emoji={c.emoji} />}
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
								icon={<ReactionEmoji emoji={c.emoji} />}
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
