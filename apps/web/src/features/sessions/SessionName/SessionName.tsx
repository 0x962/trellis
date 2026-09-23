import type { Session } from "@trellis/api";
import { InlineEdit } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";

// `InlineEditProps` in `packages/ui` states what each field below means.
export type SessionNameProps = {
	session: Session;
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
	leading?: ReactNode;
	className?: string;
	fieldClassName?: string;
	inputClassName?: string;
	children?: ReactNode;
};

// Binds the session rename call to `InlineEdit`, which holds every rule of
// the edit.
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
			onSave={rename}
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
