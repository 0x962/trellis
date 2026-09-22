import { DotsThree, FolderSimple, Trash, UserSwitch } from "@phosphor-icons/react";
import type { AgentRun, Session } from "@trellis/api";
import { IconButton, Menu, type MenuItem } from "@trellis/ui";
import { useState } from "react";
import { DeleteSessionDialog } from "../DeleteSessionDialog";
import { MoveSessionProjectDialog } from "../MoveSessionProjectDialog";
import { SwitchAccountDialog } from "../SwitchAccountDialog";

export type SessionActionsMenuProps = {
	session?: Session;
	run?: AgentRun;
	size?: "xs" | "sm" | "md";
	deleteDisabled?: boolean;
	onDeleted?: () => void;
};

export function SessionActionsMenu({
	session,
	run,
	size = "sm",
	deleteDisabled = false,
	onDeleted,
}: SessionActionsMenuProps) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const [accountOpen, setAccountOpen] = useState(false);
	const name = session?.name ?? run!.name;
	const items: MenuItem[] = [
		...(run
			? [
					{
						label: "Switch account",
						icon: <UserSwitch />,
						disabled: deleteDisabled || run.runtime !== "native" || !run.terminalId || run.state === "starting",
						onSelect: () => setAccountOpen(true),
					},
				]
			: []),
		...(session
			? [
					{ label: "Move to project…", icon: <FolderSimple />, onSelect: () => setMoveOpen(true) },
					{
						label: "Delete…",
						icon: <Trash />,
						danger: true,
						disabled: deleteDisabled,
						onSelect: () => setDeleteOpen(true),
					},
				]
			: []),
	];
	return (
		<>
			<Menu
				label={`Actions for ${name}`}
				items={items}
				trigger={<IconButton size={size} label={`Actions for ${name}`} icon={<DotsThree />} />}
			/>
			{session && <MoveSessionProjectDialog session={session} open={moveOpen} onOpenChange={setMoveOpen} />}
			{session && (
				<DeleteSessionDialog session={session} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={onDeleted} />
			)}
			{accountOpen && run && <SwitchAccountDialog run={run} onClose={() => setAccountOpen(false)} />}
		</>
	);
}
