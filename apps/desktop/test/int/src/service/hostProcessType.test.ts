import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

const root = resolve(originDir(import.meta.dir), "../..");

const launchctl = async (...args: string[]) => {
	const child = Bun.spawn(["/bin/launchctl", ...args], { stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (code !== 0) throw new Error(`launchctl ${args[0]} failed: ${stderr}`);
	return stdout;
};

test("the host plist requests interactive scheduling from launchd", async () => {
	const source = await readFile(join(root, "native/com.trellis.desktop.host.plist"), "utf8");
	expect(source).toMatch(/<key>ProcessType<\/key>\s*<string>Interactive<\/string>/);
	const directory = await mkdtemp(join(tmpdir(), "trellis-process-type-"));
	const label = `com.trellis.test.process-type.${process.pid}.${Date.now()}`;
	const domain = `gui/${process.getuid!()}`;
	const plist = join(directory, `${label}.plist`);
	let loaded = false;
	try {
		await writeFile(
			plist,
			source
				.replace("com.trellis.desktop.host", label)
				.replace(
					"<key>BundleProgram</key><string>Contents/MacOS/TrellisHost</string>",
					"<key>Program</key><string>/bin/sleep</string>",
				)
				.replace(
					"<string>TrellisHost</string><string>serve</string>",
					"<string>/bin/sleep</string><string>60</string>",
				),
		);
		await launchctl("bootstrap", domain, plist);
		loaded = true;
		expect(await launchctl("print", `${domain}/${label}`)).toContain("spawn type = interactive");
	} finally {
		if (loaded) await launchctl("bootout", `${domain}/${label}`);
		await rm(directory, { recursive: true, force: true });
	}
});
