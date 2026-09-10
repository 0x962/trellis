import { type AgentSession, blockedAction, blockedLine } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

export type BlockedNoticeProps = {
	session: AgentSession;
};

// Why one agent does nothing, and the one action that clears it. The
// action trusts the folder the session named, stops the agent that waits,
// and starts another. A block with no folder starts the agent again, so a
// person who fixed the cause needs no second screen.
export function BlockedNotice({ session }: BlockedNoticeProps) {
	const { client, queryClient } = useApp();
	const [working, setWorking] = useState(false);
	if (session.blocked === null) return null;
	const { blocked } = session;

	const unblock = async () => {
		setWorking(true);
		try {
			await client.agents.unblock({ id: session.id });
			await queryClient.invalidateQueries();
		} catch (error) {
			toast.error("Couldn't start the agent again", { description: (error as Error).message });
		} finally {
			setWorking(false);
		}
	};

	const label = blocked.path === null ? "Start again" : "Trust and start again";

	return (
		<div role="alert" className="flex min-w-0 flex-col items-start gap-1 text-sm">
			<span className="text-danger">{blockedLine(session.title, blocked)}</span>
			<span className="text-fg-muted">{blockedAction(blocked)}</span>
			<Button size="sm" className="cursor-pointer" disabled={working} onClick={() => void unblock()}>
				{label}
			</Button>
		</div>
	);
}
