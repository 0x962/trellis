import type { BrowserSessionStore } from "../browserSessions.ts";

export type BrowserSessionLogoutResult =
	| { kind: "logged-out"; sessionId: string }
	| { kind: "unauthorized" };

export const logoutBrowserSession = (
	sessions: BrowserSessionStore,
	token: string | null,
): BrowserSessionLogoutResult => {
	if (token === null) return { kind: "unauthorized" };
	const session = sessions.authenticate(token);
	if (session === null) return { kind: "unauthorized" };
	sessions.revoke(session.id);
	return { kind: "logged-out", sessionId: session.id };
};
