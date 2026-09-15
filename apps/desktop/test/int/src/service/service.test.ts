import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";
import { adoptHost, ensureHostToken, waitForHostExit } from "../../../../src/host/host.ts";
import { writeSelectedHome } from "../../../../src/selectedHome/selectedHome.ts";
import { serviceCommand } from "../../../../src/service/service.ts";

const root = resolve(originDir(import.meta.dir), "../..");

const launchctl = async (...args: string[]) => {
	const command = Bun.spawn(["/bin/launchctl", ...args], { stdout: "pipe", stderr: "pipe" });
	const [code, stderr] = await Promise.all([command.exited, new Response(command.stderr).text()]);
	if (code) throw new Error(`launchctl ${args[0]} failed: ${stderr}`);
};

test("an isolated launchd service uses the selected home and restarts without a desktop process", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-launchd-"));
	const home = join(directory, "home");
	const userData = join(directory, "desktop");
	const contents = join(directory, "Trellis.app/Contents");
	const helper = join(contents, "MacOS/TrellisHost");
	const label = `com.trellis.test.${process.pid}.${Date.now()}`;
	const domain = `gui/${process.getuid!()}`;
	const plist = join(directory, `${label}.plist`);
	let loaded = false;
	try {
		await mkdir(join(contents, "MacOS"), { recursive: true });
		await mkdir(join(contents, "Resources"));
		await copyFile(join(root, "dist/TrellisHost"), helper);
		await copyFile(join(root, "dist/host-service.cjs"), join(contents, "Resources/host-service.cjs"));
		await symlink(join(root, "dist/host"), join(contents, "Resources/host"));
		ensureHostToken(home);
		await writeSelectedHome(userData, home);
		await writeFile(
			plist,
			`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
		<key>Label</key><string>${label}</string>
		<key>ProgramArguments</key><array><string>${helper}</string><string>serve</string></array>
		<key>EnvironmentVariables</key><dict><key>TRELLIS_DESKTOP_USER_DATA</key><string>${userData}</string></dict>
		<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>1</integer>
		</dict></plist>`,
		);
		await launchctl("bootstrap", domain, plist);
		loaded = true;
		const first = await adoptHost(home);
		expect(first.pid).toBe(Number(await readFile(join(home, "desktop-service.pid"), "utf8")));
		expect(await readFile(join(userData, "selected-home.json"), "utf8")).toContain(home);
		expect(
			await Bun.file(
				join(
					userData,
					"releases",
					JSON.parse(await readFile(join(home, "desktop-active-release.json"), "utf8")).id,
					"release.json",
				),
			).exists(),
		).toBe(true);
		process.kill(first.pid, "SIGKILL");
		let second = first;
		for (let step = 0; step < 100 && second.pid === first.pid; step++) {
			await Bun.sleep(100);
			second = await adoptHost(home);
		}
		expect(second.pid).not.toBe(first.pid);
		expect(second.origin).toBe(first.origin);
		expect(
			(await fetch(`${second.origin}/api/health`, { headers: { Authorization: `Bearer ${second.token}` } })).status,
		).toBe(200);
	} finally {
		if (loaded) await launchctl("bootout", `${domain}/${label}`);
		await rm(directory, { recursive: true, force: true });
	}
}, 120000);

test("SMAppService registers an isolated app and supervises its relocated host", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-sm-service-"));
	const home = join(directory, "home");
	const contents = join(directory, "Trellis Probe.app/Contents");
	const helper = join(contents, "MacOS/TrellisHost");
	const label = `com.trellis.test.sm.${process.pid}.${Date.now()}`;
	const domain = `gui/${process.getuid!()}`;
	let registered = false;
	try {
		await mkdir(join(contents, "MacOS"), { recursive: true });
		await mkdir(join(contents, "Resources"));
		await mkdir(join(contents, "Library/LaunchAgents"), { recursive: true });
		const source = (await readFile(join(root, "native/TrellisHost.swift"), "utf8")).replace(
			"com.trellis.desktop.host.plist",
			`${label}.plist`,
		);
		const sourcePath = join(directory, "helper.swift");
		await writeFile(sourcePath, source);
		const compile = Bun.spawn(["xcrun", "swiftc", sourcePath, "-o", helper], { stdout: "inherit", stderr: "inherit" });
		expect(await compile.exited).toBe(0);
		await copyFile(helper, join(contents, "MacOS/Trellis"));
		await copyFile(join(root, "dist/host-service.cjs"), join(contents, "Resources/host-service.cjs"));
		await symlink(join(root, "dist/host"), join(contents, "Resources/host"));
		await writeFile(
			join(contents, "Info.plist"),
			`<?xml version="1.0"?><plist version="1.0"><dict>
		<key>CFBundleIdentifier</key><string>${label}</string><key>CFBundleExecutable</key><string>Trellis</string>
		<key>CFBundleName</key><string>Trellis Probe</string><key>CFBundleVersion</key><string>1</string><key>CFBundlePackageType</key><string>APPL</string>
		</dict></plist>`,
		);
		await writeFile(
			join(contents, `Library/LaunchAgents/${label}.plist`),
			`<?xml version="1.0"?><plist version="1.0"><dict>
		<key>Label</key><string>${label}</string><key>BundleProgram</key><string>Contents/MacOS/TrellisHost</string>
		<key>ProgramArguments</key><array><string>TrellisHost</string><string>serve</string></array>
		<key>EnvironmentVariables</key><dict><key>TRELLIS_DESKTOP_HOME</key><string>${home}</string></dict>
		<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>1</integer>
		</dict></plist>`,
		);
		const sign = Bun.spawn(["/usr/bin/codesign", "--force", "--sign", "-", resolve(contents, "..")], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await sign.exited).toBe(0);
		ensureHostToken(home);
		registered = true;
		expect((await serviceCommand(helper, "register")).status).toBe("enabled");
		const first = await adoptHost(home);
		process.kill(first.pid, "SIGKILL");
		await Bun.sleep(100);
		const second = await adoptHost(home);
		expect(second.pid).not.toBe(first.pid);
		expect(second.origin).toBe(first.origin);
	} finally {
		if (registered) {
			await serviceCommand(helper, "unregister");
			await waitForHostExit(home);
			const remains = Bun.spawn(["/bin/launchctl", "print", `${domain}/${label}`], { stdout: "pipe", stderr: "pipe" });
			expect(await remains.exited).not.toBe(0);
		}
		await rm(directory, { recursive: true, force: true });
	}
}, 120000);
