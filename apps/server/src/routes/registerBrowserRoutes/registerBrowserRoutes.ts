import type { Hono } from "hono";
import { browserSessionAuth } from "../../auth/index.ts";
import type { Config } from "../../config.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Logger } from "../../log.ts";
import { PAGE_ARCHIVE_PREFIX, PAGE_RENDER_PREFIX } from "../../pageLeases.ts";
import type { BrowserSessionStore } from "../../services/browserSessions/index.ts";
import { browserSessionHostRoutes, browserSessionRoutes } from "../browserSessions/index.ts";
import { pageArchiveRoute } from "../pageArchive/pageArchive.ts";
import { pageContentRoute } from "../pageRender/pageContent.ts";
import { pageFrameRoute } from "../pageRender/pageRender.ts";

export type BrowserSessionAccess = {
	origin: string;
	hostToken: string;
	sessions: BrowserSessionStore;
};

export type RegisterBrowserRoutesOptions = {
	app: Hono;
	config: Config;
	transport: ServiceTransport;
	log: Logger;
	browserSessionAccess: BrowserSessionAccess | null;
};

export const registerBrowserRoutes = ({
	app,
	config,
	transport,
	log,
	browserSessionAccess,
}: RegisterBrowserRoutesOptions): void => {
	// Each lease ID or grant ID authorizes one Page version for a limited time.
	// These routes must precede browserSessionAuth.
	app.get(
		`${PAGE_RENDER_PREFIX}/:leaseId`,
		pageFrameRoute({ log, browserOrigin: browserSessionAccess?.origin ?? null }),
	);
	app.get(
		`${PAGE_RENDER_PREFIX}/:leaseId/*`,
		pageContentRoute({ config, transport, log, browserOrigin: browserSessionAccess?.origin ?? null }),
	);
	app.get(`${PAGE_ARCHIVE_PREFIX}/:grantId`, pageArchiveRoute({ config, transport, log }));

	if (browserSessionAccess !== null) {
		// browserSessionRoutes sets the browser session cookie.
		// browserSessionHostRoutes requires the host bearer token.
		app.route(
			"/",
			browserSessionRoutes({ origin: browserSessionAccess.origin, sessions: browserSessionAccess.sessions, log }),
		);
		app.route(
			"/",
			browserSessionHostRoutes({
				hostToken: browserSessionAccess.hostToken,
				sessions: browserSessionAccess.sessions,
				log,
			}),
		);
	}
	app.use(
		browserSessionAuth(
			config.authToken,
			browserSessionAccess === null
				? null
				: { origin: browserSessionAccess.origin, sessions: browserSessionAccess.sessions, log },
		),
	);
};
