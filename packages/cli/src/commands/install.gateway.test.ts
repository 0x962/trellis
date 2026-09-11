import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultEnv, lines, runCli } from "../../test/deps.ts";
import { setup, temp } from "../../test/installEnv.ts";

// The routes file of the gateway on port 80, and what install prints about
// the URL a browser can open.
describe("install and the localhost gateway", () => {
	// A gateway on port 80 reads the routes file and sends each *.localhost
	// name to its port. The launchd server listens on 4521.
	test("install creates the gateway routes file with the trellis route when the file is missing", async () => {
		const { prefix, env, routes } = setup();
		expect(existsSync(routes)).toBe(false);
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(JSON.parse(readFileSync(routes, "utf8"))).toEqual({ trellis: 4521 });
	});

	test("install keeps the other routes and replaces the trellis route", async () => {
		const { prefix, env, routes } = setup();
		mkdirSync(dirname(routes), { recursive: true });
		writeFileSync(routes, JSON.stringify({ docs: 4519, trellis: 9999, dots: 4520 }));
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(JSON.parse(readFileSync(routes, "utf8"))).toEqual({ docs: 4519, trellis: 4521, dots: 4520 });
	});

	// A gateway can read the routes file at any moment. A rename swaps in the
	// new file in one step, so a reader never sees a partial file.
	test("install replaces the routes file with a rename and leaves no temp file", async () => {
		const { prefix, env, routes } = setup();
		mkdirSync(dirname(routes), { recursive: true });
		writeFileSync(routes, JSON.stringify({ docs: 4519 }));
		const before = statSync(routes).ino;
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(statSync(routes).ino).not.toBe(before);
		expect(readdirSync(dirname(routes))).toEqual(["routes.json"]);
	});

	// A 2xx answer on port 80 to a request with the Host trellis.localhost
	// proves that a gateway sends that name to the server.
	test("install prints http://trellis.localhost when the port-80 gateway answers for trellis.localhost", async () => {
		const { prefix, env } = setup();
		const probes: Array<{ url: string; host: string | null }> = [];
		const fetch = async (request: Request) => {
			probes.push({ url: request.url, host: request.headers.get("host") });
			return new Response("{}");
		};
		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch });
		expect(result.code, result.stderr).toBe(0);
		expect(probes).toContainEqual({ url: "http://127.0.0.1/api/health", host: "trellis.localhost" });
		expect(lines(result.stdout)).toContain("trellis: http://trellis.localhost");
		expect(result.stdout).not.toContain("127.0.0.1:4521");
	});

	test("without a port-80 gateway for trellis.localhost install prints the 127.0.0.1 URL and names the routes file", async () => {
		const refused = () => {
			throw new TypeError("Unable to connect");
		};
		const noRoute = () => new Response("no route", { status: 502 });
		for (const gateway of [refused, noRoute]) {
			const { prefix, env, routes } = setup();
			const fetch = async (request: Request) => (new URL(request.url).port === "" ? gateway() : new Response("{}"));
			const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch });
			expect(result.code, result.stderr).toBe(0);
			const out = lines(result.stdout);
			expect(out).toContain("trellis: http://127.0.0.1:4521");
			expect(out).not.toContain("trellis: http://trellis.localhost");
			expect(out.filter((line) => line.includes(routes))).toHaveLength(1);
		}
	});

	test("install prints no gateway source hint", async () => {
		const { prefix, env } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(result.stdout).not.toContain("gateway.ts");
		expect(result.stdout).not.toContain("ROUTES");
	});

	// The source of a gateway belongs to another repository. The trellis
	// route lives in the routes file of the gateway.
	test("install leaves the gateway source untouched and refuses --gateway", async () => {
		const home = temp("user");
		const gateway = join(home, "projects", "gateway", "src", "gateway.ts");
		mkdirSync(dirname(gateway), { recursive: true });
		const source = "const ROUTES: Record<string, number> = {\n\tdocs: 4519,\n};\n";
		writeFileSync(gateway, source);
		const result = await runCli(["install", "--no-launchd"], {}, { env: defaultEnv, home });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(gateway, "utf8")).toBe(source);
		const refused = await runCli(["install", "--gateway", "--no-launchd"], {}, { env: defaultEnv, home });
		expect(refused.code).toBe(2);
		expect(refused.stderr).toContain("unknown flag --gateway");
		expect(readFileSync(gateway, "utf8")).toBe(source);
	});
});
