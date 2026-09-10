import { Link } from "@tanstack/react-router";
import { ActorHeaderSchema } from "@trellis/api";
import { Avatar, Button, IconButton, Input, Popover } from "@trellis/ui";
import { CircleHelp, Settings } from "lucide-react";
import { type FormEvent, useState } from "react";
import { setActorName, useActor } from "../../../lib/actor";
import { openShortcutHelp } from "../../command/ShortcutHelp";

const iconLinkClass =
	"inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition duration-hover hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// The bottom of the sidebar: who you are, the settings, and the keyboard
// help. The actor chip opens a rename popover; Enter stores the new name.
export function ActorFooter() {
	const actor = useActor()!;
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(actor.name);
	const valid = ActorHeaderSchema.safeParse(`human:${draft.trim()}`).success;

	const onOpenChange = (next: boolean) => {
		if (next) setDraft(actor.name);
		setOpen(next);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setActorName(draft.trim());
		setOpen(false);
	};

	return (
		<div className="mt-auto flex items-center gap-0.5 border-t border-border pt-2">
			<Popover
				open={open}
				onOpenChange={onOpenChange}
				side="top"
				trigger={
					<button
						type="button"
						className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
					>
						<Avatar kind="human" name={actor.name} />
						<span className="truncate font-medium text-fg">{actor.name}</span>
						<span className="text-sm text-fg-muted">human</span>
					</button>
				}
			>
				<form onSubmit={submit} className="flex w-56 flex-col gap-2">
					<Input label="Name" value={draft} invalid={!valid} onChange={(event) => setDraft(event.target.value)} />
					<p className="text-xs text-fg-faint">Every ticket you touch is attributed to this name.</p>
					<Button type="submit" size="sm" variant="primary" disabled={!valid} className="self-end">
						Rename
					</Button>
				</form>
			</Popover>
			<Link to="/settings" aria-label="Settings" className={iconLinkClass}>
				<span aria-hidden="true" className="inline-flex size-3.5 *:size-full">
					<Settings />
				</span>
			</Link>
			<IconButton label="Keyboard shortcuts" icon={<CircleHelp />} onClick={openShortcutHelp} />
		</div>
	);
}
