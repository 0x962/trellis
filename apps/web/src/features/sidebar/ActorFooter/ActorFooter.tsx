import { GearSix } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ActorHeaderSchema } from "@trellis/api";
import { Avatar, Button, IconButton, Input, Popover, Tooltip, toast } from "@trellis/ui";
import { type FormEvent, useId, useState } from "react";
import { useActor } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";
import { ghCopy } from "../../../lib/ghCopy";
import { saveActorName } from "../../../lib/identity";
import { opensSheet } from "../../../lib/opensSheet";
import { pageSheetActions } from "../../../stores/pageSheetStore";

// The bottom of the sidebar: who you are and the settings. The actor chip
// opens a rename popover; Enter stores the new name on the server and in
// this browser. The gear opens the settings sheet over the page the person
// is on, and its href is the settings URL, so a click with a modifier key
// still opens the settings in a tab of its own.
//
// PR states and checks need gh. While gh does not answer as a signed-in
// user, the Settings link carries a warning dot, and its description says
// why in the words of ghCopy.
export function ActorFooter({ collapsed = false }: { collapsed?: boolean }) {
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
		<div data-sidebar-actor-footer="" className="flex shrink-0 items-center gap-1 pt-2">
			<Popover
				open={open}
				onOpenChange={onOpenChange}
				side="top"
				trigger={
					<button
						type="button"
						className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors duration-hover ease-out hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
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
			{!collapsed && (
				<span className="relative">
					<Tooltip content="Settings">
						<IconButton
							label="Settings"
							role="link"
							icon={<GearSix data-icon="gear-six" />}
							nativeButton={false}
							aria-describedby={ghWarning ? warningId : undefined}
							render={
								<a
									href="/settings"
									onClick={(event) => {
										if (!opensSheet(event)) return;
										event.preventDefault();
										pageSheetActions.openSettings("account");
									}}
								/>
							}
						/>
					</Tooltip>
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
				</span>
			)}
		</div>
	);
}
