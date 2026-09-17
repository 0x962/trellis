import { DotsThree, Trash } from "@phosphor-icons/react";
import type { Session } from "@trellis/api";
import { IconButton, Menu, type MenuItem } from "@trellis/ui";
import { useState } from "react";
import { DeleteSessionDialog } from "../../sessions/DeleteSessionDialog";

export type SessionRowActionsProps = {
	session: Session;
};

// The row menu of a session in the sidebar: a 24 px button that fits the
// row's trailing slot. Start and stop live on the session page, so the
// menu offers the delete alone.
export function SessionRowActions({ session }: SessionRowActionsProps) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const items: MenuItem[] = [{ label: "Delete…", icon: <Trash />, danger: true, onSelect: () => setDeleteOpen(true) }];
	return (
		<>
			<Menu
				label={`Actions for ${session.name}`}
				items={items}
				trigger={<IconButton size="xs" label={`Actions for ${session.name}`} icon={<DotsThree />} />}
			/>
			<DeleteSessionDialog session={session} open={deleteOpen} onOpenChange={setDeleteOpen} />
		</>
	);
}
