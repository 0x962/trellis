import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { type CommandCall, defaultEnv } from "./deps.ts";
import { repoRoot } from "./process.ts";

export const temp = (name: string) => mkdtempSync(join(process.env.TRELLIS_HOME!, `${name}-`));

// One run's data home and install root. Both sit under the TRELLIS_HOME of
// the test process, so no path in a test plist reaches ~/.trellis.
export const setup = () => {
	const dataHome = temp("data");
	const prefix = temp("prefix");
	return {
		dataHome,
		prefix,
		env: { ...defaultEnv, TRELLIS_HOME: dataHome },
		plist: join(prefix, "Library", "LaunchAgents", "com.trellis.server.plist"),
		shim: join(prefix, ".local", "bin", "trellis"),
		routes: join(prefix, ".config", "localhost-gateway", "routes.json"),
	};
};

export const launchctlCalls = (commands: CommandCall[]) =>
	commands.map((call) => call.args).filter((args) => args[0] === "launchctl");

// A health answer from the server of `checkout`, by default the checkout of
// this test run. null gives the answer of a server of an earlier release,
// which names no checkout.
export const healthFrom = (checkout: string | null = repoRoot) =>
	new Response(JSON.stringify(checkout === null ? { ok: true } : { ok: true, source: { checkout, commit: null } }));
