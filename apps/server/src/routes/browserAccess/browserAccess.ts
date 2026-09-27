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

export type BrowserAccess = {
	origin: string;
	hostToken: string;
	sessions: BrowserSessionStore;
};

export type BrowserAccessOptions = {
	app: Hono;
	config: Config;
	transport: ServiceTransport;
	log: Logger;
	browserAccess: BrowserAccess | null;
};

export const registerBrowserAccess = ({
	app,
	config,
	transport,
	log,
	browserAccess,
}: BrowserAccessOptions): void => {
	// A browser sends no ambient credential on a frame file or archive download.
	// Each Page address carries a short-lived lease or grant that authorizes one version.
	app.get(`${PAGE_RENDER_PREFIX}/:leaseId`, pageFrameRoute({ log, browserOrigin: browserAccess?.origin ?? null }));
	app.get(
		`${PAGE_RENDER_PREFIX}/:leaseId/*`,
		pageContentRoute({ config, transport, log, browserOrigin: browserAccess?.origin ?? null }),
	);
	app.get(`${PAGE_ARCHIVE_PREFIX}/:grantId`, pageArchiveRoute({ config, transport, log }));

	if (browserAccess !== null) {
		// The login route creates the ambient credential. The host route checks its own bearer credential.
		app.route(
			"/",
			browserSessionRoutes({ origin: browserAccess.origin, sessions: browserAccess.sessions, log }),
		);
		app.route(
			"/",
			browserSessionHostRoutes({ hostToken: browserAccess.hostToken, sessions: browserAccess.sessions, log }),
		);
	}
	app.use(
		browserSessionAuth(
			config.authToken,
			browserAccess === null
				? null
				: { origin: browserAccess.origin, sessions: browserAccess.sessions, log },
		),
	);
};
