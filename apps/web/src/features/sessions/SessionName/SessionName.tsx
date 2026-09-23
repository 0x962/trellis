import type { Session } from "@trellis/api";
import { InlineEdit } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";

export type SessionNameProps = {
	session: Session;
	// True while the name is a text field. The screen owns it, because the
	// Rename action that starts the edit sits in a row menu.
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
	// The avatar of the session. It stands beside the text field, so the row
	// does not move sideways when the field opens.
	leading?: ReactNode;
	className?: string;
	fieldClassName?: string;
	inputClassName?: string;
	// The name at rest: the row, the heading or the plain text that the field
	// covers while the edit runs.
	children?: ReactNode;
};

// The session name in the four places that show it: the sidebar row, the
// sessions page group, the session conversation and the session page. It binds
// the rename call to `InlineEdit`, which holds every rule of the edit.
export function SessionName({
	session,
	editing,
	onEditingChange,
	leading,
	className,
	fieldClassName,
	inputClassName,
	children,
}: SessionNameProps) {
	const { client, orpc, queryClient } = useApp();
	const rename = async (name: string) => {
		await client.sessions.rename({ id: session.id, name });
		// The field closes as soon as the rename call answers. The session
		// lists and the agent run lists then refetch in the background; waiting
		// for all of them held the field open for about five seconds.
		void queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
	};
	return (
		<InlineEdit
			label="Session name"
			value={session.name}
			editing={editing}
			onEditingChange={onEditingChange}
			onCommit={rename}
			errorTitle="The session name did not change."
			leading={leading}
			className={className}
			fieldClassName={fieldClassName}
			inputClassName={inputClassName}
		>
			{children}
		</InlineEdit>
	);
}
