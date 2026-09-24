import { Archive, BoxArrowUp, DotsThree, FolderSimple, PencilSimple, Trash, UserSwitch } from "@phosphor-icons/react";
import type { AgentRun, Session } from "@trellis/api";
import { type ButtonVariant, IconButton, Menu, type MenuItem } from "@trellis/ui";
import { useState } from "react";
import { DeleteSessionDialog } from "../DeleteSessionDialog";
import { MoveSessionProjectDialog } from "../MoveSessionProjectDialog";
import { SwitchAccountDialog } from "../SwitchAccountDialog";
import { useSessionArchive } from "../useSessionArchive";

export type SessionActionsMenuProps = {
	session?: Session;
	run?: AgentRun;
	size?: "xs" | "sm" | "md";
	// The look of the trigger. A bar passes "default", so the trigger draws
	// the same disk as the other controls of that bar. A row leaves it at
	// "quiet", so the trigger stays flat until the pointer reaches it.
	variant?: ButtonVariant;
	// The name of this control inside its bar, written onto the trigger as
	// `data-bar-slot`, which `barSlots` reads.
	barSlot?: string;
	deleteDisabled?: boolean;
	onDeleted?: () => void;
	onRename?: () => void;
};

export function SessionActionsMenu({
	session,
	run,
	size = "sm",
	variant = "quiet",
	barSlot,
	deleteDisabled = false,
	onDeleted,
	onRename,
}: SessionActionsMenuProps) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const [accountOpen, setAccountOpen] = useState(false);
	const { setArchived } = useSessionArchive();
	const name = session?.name ?? run!.name;
	// A session of a project lives on the sessions page of that project, and
	// the server archives no session that holds a project. The archive item
	// belongs to a session that holds none.
	const archived = session?.archivedAt != null;
	const archivable = session !== undefined && session.projectId === null;
	const items: MenuItem[] = [];
	if (run) {
		items.push({
			label: "Switch account",
			icon: <UserSwitch />,
			disabled: deleteDisabled || run.runtime !== "native" || !run.terminalId || run.state === "starting",
			onSelect: () => setAccountOpen(true),
		});
	}
	if (session && onRename) {
		items.push({
			label: "Rename",
			icon: <PencilSimple />,
			disabled: deleteDisabled,
			onSelect: onRename,
		});
	}
	if (archivable)
		items.push(
			archived
				? { label: "Unarchive", icon: <BoxArrowUp />, onSelect: () => void setArchived(session, false) }
				: { label: "Archive", icon: <Archive />, onSelect: () => void setArchived(session, true) },
		);
	if (session) {
		items.push(
			{ label: "Move to project…", icon: <FolderSimple />, disabled: archived, onSelect: () => setMoveOpen(true) },
			{
				label: "Delete…",
				icon: <Trash />,
				danger: true,
				disabled: deleteDisabled,
				onSelect: () => setDeleteOpen(true),
			},
		);
	}
	return (
		<>
			<Menu
				label={`Actions for ${name}`}
				items={items}
				trigger={
					<IconButton
						data-bar-slot={barSlot}
						size={size}
						variant={variant}
						label={`Actions for ${name}`}
						icon={<DotsThree />}
					/>
				}
			/>
			{session && <MoveSessionProjectDialog session={session} open={moveOpen} onOpenChange={setMoveOpen} />}
			{session && (
				<DeleteSessionDialog session={session} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={onDeleted} />
			)}
			{accountOpen && run && <SwitchAccountDialog run={run} onClose={() => setAccountOpen(false)} />}
		</>
	);
}
