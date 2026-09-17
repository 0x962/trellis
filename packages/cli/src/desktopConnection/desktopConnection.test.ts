import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CliFailure } from "../errors.ts";
import { desktopConnection } from "./desktopConnection.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true });
});
const fixture = async () => {
	const home = await mkdtemp(join(process.env.TRELLIS_TEST_ROOT!, "trellis-cli-token-"));
	homes.push(home);
	await writeFile(join(home, "trellis.lock"), JSON.stringify({ role: "server", port: 4521 }));
	await writeFile(join(home, "desktop-token"), "local-secret\n");
	return home;
};

// Every failure the CLI raises around a request is a CliFailure, so the run
// prints one line and returns the exit code. A plain Error crashes the
// process with a stack trace.
const failureOf = (home: string) => {
	try {
		desktopConnection(home);
	} catch (error) {
		expect(error).toBeInstanceOf(CliFailure);
		return error as CliFailure;
	}
	throw new Error("desktopConnection answered a connection");
};

test("the selected desktop data home supplies its local port and token", async () => {
	const home = await fixture();
	expect(desktopConnection(home)).toEqual({ url: "http://127.0.0.1:4521", token: "local-secret" });
	expect(desktopConnection(undefined)).toBeUndefined();
});

test("an import owner cannot supply a desktop server connection", async () => {
	const home = await fixture();
	await writeFile(join(home, "trellis.lock"), JSON.stringify({ role: "import", port: null }));
	const failure = failureOf(home);
	expect(failure.message).toContain("no background server port");
	expect([failure.code, failure.exitCode]).toEqual(["UNREACHABLE", 5]);
});

test("a data home without a lock names the directory and the two ways out", async () => {
	const home = await fixture();
	await rm(join(home, "trellis.lock"));
	const failure = failureOf(home);
	expect([failure.code, failure.exitCode]).toEqual(["UNREACHABLE", 5]);
	expect(failure.message).toBe(
		`The desktop data directory ${home} has no running Trellis host (no trellis.lock). Open Trellis, or pass --url.`,
	);
});

test("a lock that is not JSON names the directory", async () => {
	const home = await fixture();
	await writeFile(join(home, "trellis.lock"), '{"role": "server", "port": 4');
	const failure = failureOf(home);
	expect([failure.code, failure.exitCode]).toEqual(["UNREACHABLE", 5]);
	expect(failure.message).toBe(
		`The desktop data directory ${home} holds a trellis.lock that is not JSON. Open Trellis, or pass --url.`,
	);
});

test("a data home without a token names the directory and the two ways out", async () => {
	const home = await fixture();
	await rm(join(home, "desktop-token"));
	const failure = failureOf(home);
	expect([failure.code, failure.exitCode]).toEqual(["UNREACHABLE", 5]);
	expect(failure.message).toBe(
		`The desktop data directory ${home} has no desktop-token. Open Trellis once, or pass --url and TRELLIS_AUTH_TOKEN.`,
	);
});
