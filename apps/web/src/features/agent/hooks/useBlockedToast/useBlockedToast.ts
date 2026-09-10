import { useQuery } from "@tanstack/react-query";
import { blockedAction, blockedLine } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../../lib/appContext";

// Tells the person on the board that an agent stopped working. An
// agents.session event refetches agents.sessions, so a block that happens
// while the board is open reaches the screen without a reload.
//
// One toast per session: `told` holds the sessions this mount already
// showed, so a refetch that changes nothing shows nothing.
export const useBlockedToast = (project: string | undefined) => {
	const { orpc } = useApp();
	const told = useRef(new Set<string>());
	const options = orpc.agents.sessions.queryOptions({ input: { project: project ?? "" } });
	const sessions = useQuery({ ...options, enabled: project !== undefined }).data?.sessions;

	useEffect(() => {
		for (const session of sessions ?? []) {
			if (session.blocked === null || session.state === "stopped") {
				told.current.delete(session.id);
				continue;
			}
			if (told.current.has(session.id)) continue;
			told.current.add(session.id);
			toast.error(blockedLine(session.title, session.blocked), { description: blockedAction(session.blocked) });
		}
	}, [sessions]);
};
