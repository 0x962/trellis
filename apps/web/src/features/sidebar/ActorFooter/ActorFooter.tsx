import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ActorHeaderSchema } from "@trellis/api";
import { Avatar, Button, IconButton, Input, Popover, toast } from "@trellis/ui";
import { CircleHelp, Settings } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useActor } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";
import { ghCopy } from "../../../lib/ghCopy";
import { saveActorName } from "../../../lib/identity";
import { openShortcutHelp } from "../../command/ShortcutHelp";

// 28 px on a mouse and 44 px on a touch screen, the two hit area minimums.
const iconLinkClass =
	"relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition duration-hover ease-out hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:size-11";

// The bottom of the sidebar: who you are, the settings, the agents, and the
// keyboard help. The actor chip opens a rename popover; Enter stores the new name on
// the server and in this browser.
//
// PR states and checks need gh. While gh does not answer as a signed-in
// user, the Settings link carries a warning dot, and its description says
// why in the words of ghCopy.
export function ActorFooter() {
	const app = useApp();
	const actor = useActor()!;
	const gh = useQuery(app.orpc.system.gh.queryOptions({})).data;
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(actor.name);
	const valid = ActorHeaderSchema.safeParse(`human:${draft.trim()}`).success;
	const ghWarning = gh !== undefined && !gh.ok;
	const warningId = useId();

	const onOpenChange = (next: boolean) => {
		if (next) setDraft(actor.name);
		setOpen(next);
	};

	const save = (name: string) => {
		saveActorName(app, name).catch((error: Error) =>
			toast.error("The name did not change.", {
				description: error.message,
				action: { label: "Retry", onClick: () => save(name) },
			}),
		);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		save(draft.trim());
		setOpen(false);
	};

	return (
		<div className="flex shrink-0 items-center gap-0.5 pt-1">
			<Popover
				open={open}
				onOpenChange={onOpenChange}
				side="top"
				trigger={
					<button
						type="button"
						className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors duration-hover ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
					>
						<Avatar kind="human" name={actor.name} className="size-6 shrink-0 text-xs" />
						<span title={actor.name} className="min-w-0 truncate text-sm font-medium text-fg">
							{actor.name}
						</span>
					</button>
				}
			>
				<form onSubmit={submit} className="flex w-56 flex-col gap-2">
					<Input label="Name" value={draft} invalid={!valid} onChange={(event) => setDraft(event.target.value)} />
					<p className="text-xs text-fg-faint">trellis records this name as the actor of each change you make.</p>
					<Button type="submit" variant="primary" disabled={!valid} className="self-end">
						Rename
					</Button>
				</form>
			</Popover>
			<Link
				to="/settings"
				aria-label="Settings"
				aria-describedby={ghWarning ? warningId : undefined}
				className={iconLinkClass}
			>
				<span aria-hidden="true" className="inline-flex size-3.5 *:size-full">
					<Settings />
				</span>
				{ghWarning && (
					<>
						<span
							data-gh-warning=""
							aria-hidden="true"
							className="absolute top-1 right-1 size-1.5 rounded-sm bg-warning"
						/>
						<span id={warningId} className="sr-only">
							{ghCopy[gh.reason ?? "error"].line}
						</span>
					</>
				)}
			</Link>
			<IconButton
				label="Keyboard shortcuts"
				className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
				icon={<CircleHelp />}
				onClick={openShortcutHelp}
			/>
		</div>
	);
}
