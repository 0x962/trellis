import { describe, expect, test } from "bun:test";
import type { Logger } from "../../../log.ts";
import { BrowserSessionStore } from "../browserSessions.ts";
import { logoutBrowserSession } from "./logoutBrowserSession.ts";

const log = { info: () => {} } as unknown as Logger;

const sessionFixture = () => {
	const sessions = new BrowserSessionStore({ hostId: "host-a", log });
	const login = sessions.redeemCode(sessions.issueCode().code);
	if (login.kind !== "session") throw new Error("The browser session fixture failed.");
	return { sessions, session: login.session };
};

describe("logout browser session", () => {
	test("rejects a missing or unknown token", () => {
		const sessions = new BrowserSessionStore({ hostId: "host-a", log });
		expect(logoutBrowserSession(sessions, null)).toEqual({ kind: "unauthorized" });
		expect(logoutBrowserSession(sessions, "unknown")).toEqual({ kind: "unauthorized" });
	});

	test("revokes the authenticated session", () => {
		const { sessions, session } = sessionFixture();
		expect(logoutBrowserSession(sessions, session.token)).toEqual({
			kind: "logged-out",
			sessionId: session.id,
		});
		expect(sessions.authenticate(session.token)).toBeNull();
	});
});
