import type { Session } from "@trellis/api";
import { SessionActionsMenu } from "../../sessions/SessionActionsMenu";

export type SessionRowActionsProps = {
	session: Session;
	onRename?: () => void;
};

export function SessionRowActions({ session, onRename }: SessionRowActionsProps) {
	return <SessionActionsMenu session={session} size="xs" onRename={onRename} />;
}
