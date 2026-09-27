import { Hono } from "hono";
import { hostAuth } from "../../../auth/auth.ts";
import type { Logger } from "../../../log.ts";
import {
	type BrowserSessionStore,
	issueBrowserSessionCode,
	revokeBrowserSession,
} from "../../../services/browserSessions/index.ts";
import { noStore } from "../response/index.ts";

export type BrowserSessionHostRoutesOptions = {
	hostToken: string;
	sessions: BrowserSessionStore;
	log: Logger;
};

export const browserSessionHostRoutes = (options: BrowserSessionHostRoutesOptions) => {
	if (options.hostToken.trim() === "") throw new Error("Browser sessions require a host token.");
	const app = new Hono();
	app.post("/api/browser-session-codes", hostAuth(options.hostToken), (c) => {
		const issued = issueBrowserSessionCode({
			reqId: c.get("requestId") ?? null,
			sessions: options.sessions,
			log: options.log,
		});
		const response = c.json(
			{ id: issued.id, code: issued.code, expiresAt: new Date(issued.expiresAt).toISOString() },
			201,
		);
		response.headers.set("location", `/api/browser-session-codes/${issued.id}`);
		return noStore(response);
	});
	app.delete("/api/browser-sessions/:sessionId", hostAuth(options.hostToken), (c) => {
		const sessionId = c.req.param("sessionId");
		revokeBrowserSession({
			sessionId,
			reqId: c.get("requestId") ?? null,
			sessions: options.sessions,
			log: options.log,
		});
		return noStore(c.body(null, 204));
	});
	return app;
};
