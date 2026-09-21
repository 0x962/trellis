import type { Session } from "@trellis/api";
import { SessionActionsMenu } from "../../sessions/SessionActionsMenu";

export type SessionRowActionsProps = {
	session: Session;
};

export function SessionRowActions({ session }: SessionRowActionsProps) {
	return <SessionActionsMenu session={session} size="xs" />;
}
