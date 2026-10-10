import type { TicketSummary } from "@trellis/api";
import { useContext, useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { summaryOf } from "../../ticket/utils/summaryOf";
import { CreateTicketDialog } from "../CreateTicketDialog/CreateTicketDialog";
import { ComposerScope } from "../composerScope";

export function CreateRelatedTicketDialog({
	scope,
	open = true,
	project,
	initialTitle,
	onCreated,
	onClose,
}: {
	scope: string;
	open?: boolean;
	project?: string;
	initialTitle: string;
	onCreated: (ticket: TicketSummary) => void;
	onClose: (completed?: boolean) => void;
}) {
	const { client } = useApp();
	const parentScope = useContext(ComposerScope);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const storagePrefix = `${parentScope}:related:${encodeURIComponent(scope)}`;
	const currentOpen = useRef(open);
	currentOpen.current = open;
	const currentScope = useRef(storagePrefix);
	currentScope.current = storagePrefix;
	return (
		<ComposerScope value={storagePrefix}>
			<CreateTicketDialog
				key={storagePrefix}
				open={open}
				instance={{
					storagePrefix,
					options: { project },
					initialTitle,
					onClose,
					onCreated: async (identifier) => {
						const ticket = await client.tickets.get({ ticket: identifier });
						if (!active.current || !currentOpen.current || currentScope.current !== storagePrefix) return false;
						onCreated(summaryOf(ticket));
						return true;
					},
				}}
			/>
		</ComposerScope>
	);
}
