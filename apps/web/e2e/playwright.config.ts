import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// The web workspace: where `bun run dev` and `bun run dev:fake` run.
const web = fileURLToPath(new URL("..", import.meta.url));

const fakeApiUrl = "http://127.0.0.1:4522";
const webUrl = "http://127.0.0.1:5173";

// The e2e suite runs the web app over the fake server. One process serves
// the API on 4522; vite proxies /api and /rpc to it. Every spec gets a
// fresh browser context, so the first-run flow is what a spec sees first.
export default defineConfig({
	testDir: ".",
	testMatch: /.*\.spec\.ts$/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: webUrl,
		trace: "retain-on-failure",
	},
	webServer: [
		{
			command: "bun run dev:fake",
			url: `${fakeApiUrl}/api/health`,
			cwd: web,
			reuseExistingServer: false,
		},
		{
			command: "bun run dev",
			url: webUrl,
			cwd: web,
			env: { TRELLIS_API_URL: fakeApiUrl },
			reuseExistingServer: false,
		},
	],
});
