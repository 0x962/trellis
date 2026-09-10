import { createFakeServer } from "./index";

// `bun run dev:fake`: the fake server on 4522. `bun run dev` proxies to
// it when TRELLIS_API_URL=http://127.0.0.1:4522, and Playwright starts it.
export const port = 4522;

const server = createFakeServer();

// The e2e suite drives the gh banner from the environment: with
// TRELLIS_FAKE_GH=unauthenticated the server reports a signed-out gh.
if (process.env.TRELLIS_FAKE_GH === "unauthenticated") {
	server.state.gh = {
		ok: false,
		user: null,
		reason: "unauthenticated",
		message: null,
		checkedAt: new Date().toISOString(),
	};
}

Bun.serve({ port, hostname: "127.0.0.1", fetch: server.app.fetch, idleTimeout: 0 });

console.log(`fake trellis server on http://127.0.0.1:${port}`);
