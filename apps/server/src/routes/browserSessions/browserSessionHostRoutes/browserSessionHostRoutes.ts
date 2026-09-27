import { type Context, Hono } from "hono";
import { hostAuth } from "../../../auth/auth.ts";
import type { Logger } from "../../../log.ts";
import type { BrowserSessionStore } from "../../../services/browserSessions/index.ts";
import { noStore } from "../response/index.ts";

export type BrowserSessionHostRoutesOptions = {
	hostToken: string;
	sessions: BrowserSessionStore;
	log: Logger;
};

export const browserSessionHostRoutes = (options: BrowserSessionHostRoutesOptions) => {
	if (options.hostToken.trim() === "") throw new Error("Browser sessions require a host token.");
	const app = new Hono();
	const securityEvent = (c: Context, sessionId: string | null, action: string, result: string) =>
		options.log.info("browser session security", {
			hostId: options.sessions.hostId,
			reqId: c.get("requestId") ?? null,
			sessionId,
			action,
			result,
		});
	app.post("/api/browser-session-codes", hostAuth(options.hostToken), (c) => {
		const issued = options.sessions.issueCode();
		securityEvent(c, null, "code.issue", "issued");
		const response = c.json(
			{ id: issued.id, code: issued.code, expiresAt: new Date(issued.expiresAt).toISOString() },
			201,
		);
		response.headers.set("location", `/api/browser-session-codes/${issued.id}`);
		return noStore(response);
	});
	app.delete("/api/browser-sessions/:sessionId", hostAuth(options.hostToken), (c) => {
		const sessionId = c.req.param("sessionId");
		const revoked = options.sessions.revoke(sessionId);
		securityEvent(c, sessionId, "session.revoke", revoked ? "revoked" : "not-found");
		return noStore(c.body(null, 204));
	});
	return app;
};
