import { DotsThree, FolderSimple, Trash } from "@phosphor-icons/react";
import type { Session } from "@trellis/api";
import { IconButton, Menu, type MenuItem } from "@trellis/ui";
import { useState } from "react";
import { DeleteSessionDialog } from "../DeleteSessionDialog";
import { MoveSessionProjectDialog } from "../MoveSessionProjectDialog";

export type SessionActionsMenuProps = {
	session: Session;
	size?: "xs" | "sm" | "md";
	deleteDisabled?: boolean;
	onDeleted?: () => void;
};

export function SessionActionsMenu({
	session,
	size = "sm",
	deleteDisabled = false,
	onDeleted,
}: SessionActionsMenuProps) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const items: MenuItem[] = [
		{ label: "Move to project…", icon: <FolderSimple />, onSelect: () => setMoveOpen(true) },
		{ label: "Delete…", icon: <Trash />, danger: true, disabled: deleteDisabled, onSelect: () => setDeleteOpen(true) },
	];
	return (
		<>
			<Menu
				label={`Actions for ${session.name}`}
				items={items}
				trigger={<IconButton size={size} label={`Actions for ${session.name}`} icon={<DotsThree />} />}
			/>
			<MoveSessionProjectDialog session={session} open={moveOpen} onOpenChange={setMoveOpen} />
			<DeleteSessionDialog session={session} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={onDeleted} />
		</>
	);
}
