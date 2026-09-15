import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopConnection } from "./desktopConnection.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true });
});
const fixture = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-cli-token-"));
	homes.push(home);
	await writeFile(join(home, "trellis.lock"), JSON.stringify({ role: "server", port: 4521 }));
	await writeFile(join(home, "desktop-token"), "local-secret\n");
	return home;
};
test("the selected desktop data home supplies its local port and token", async () => {
	const home = await fixture();
	expect(desktopConnection(home)).toEqual({ url: "http://127.0.0.1:4521", token: "local-secret" });
	expect(desktopConnection(undefined)).toBeUndefined();
});

test("an import owner cannot supply a desktop server connection", async () => {
	const home = await fixture();
	await writeFile(join(home, "trellis.lock"), JSON.stringify({ role: "import", port: null }));
	expect(() => desktopConnection(home)).toThrow("no background server port");
});
