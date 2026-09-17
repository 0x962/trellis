import { expect, test } from "bun:test";
import { copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../../test/originDir.ts";
import { activateHostRelease } from "../../../../src/activateHostRelease/activateHostRelease.ts";
import { adoptHost, ensureHostToken, waitForHostExit } from "../../../../src/host/host.ts";
import { pinResources } from "../../../../src/pinnedResources/pinnedResources.ts";
import { readBundleManifest, writeBundleManifest } from "../../../../src/resourceBundle/resourceBundle.ts";
import { writeSelectedHome } from "../../../../src/selectedHome/selectedHome.ts";
import { serviceCommand } from "../../../../src/service/service.ts";

const root = resolve(originDir(import.meta.dir), "../..");
const isolatedEnvironment = ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]
	.map((key) => `<key>${key}</key><string>${process.env[key]}</string>`)
	.join("\n");

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
		<key>EnvironmentVariables</key><dict>${isolatedEnvironment}<key>TRELLIS_DESKTOP_USER_DATA</key><string>${userData}</string></dict>
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

test("SMAppService activates a relocated package after its previous runtime and agents stop", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-sm-service-"));
	const home = join(directory, "home");
	let contents = join(directory, "Trellis Probe.app/Contents");
	let helper = join(contents, "MacOS/TrellisHost");
	const label = `com.trellis.test.sm.${process.pid}.${Date.now()}`;
	const domain = `gui/${process.getuid!()}`;
	let registered = false;
	let runtime: RuntimeClient | undefined;
	try {
		await mkdir(join(contents, "MacOS"), { recursive: true });
		await mkdir(join(contents, "Resources"));
		await mkdir(join(contents, "Library/LaunchAgents"), { recursive: true });
		const swiftSource = (await readFile(join(root, "native/TrellisHost.swift"), "utf8")).replace(
			"com.trellis.desktop.host.plist",
			`${label}.plist`,
		);
		const sourcePath = join(directory, "helper.swift");
		await writeFile(sourcePath, swiftSource);
		const compile = Bun.spawn(["xcrun", "swiftc", sourcePath, "-o", helper], { stdout: "inherit", stderr: "inherit" });
		expect(await compile.exited).toBe(0);
		await copyFile(helper, join(contents, "MacOS/Trellis"));
		await copyFile(join(root, "dist/host-service.cjs"), join(contents, "Resources/host-service.cjs"));
		let source = join(contents, "Resources/host");
		await cp(join(root, "dist/host"), source, { recursive: true, verbatimSymlinks: true });
		const runtimeBuild = Bun.spawn(
			[
				process.execPath,
				"build",
				resolve(root, "../runtime/src/index.ts"),
				"--target=node",
				"--format=esm",
				"--external=node-pty",
				"--external=fs-ext",
				"--external=koffi",
				`--outfile=${join(source, "apps/runtime/dist/index.js")}`,
			],
			{ stdout: "ignore", stderr: "inherit" },
		);
		expect(await runtimeBuild.exited).toBe(0);
		const entry = join(source, "apps/server/src/index.ts");
		await writeFile(
			entry,
			`await import("./agents/native/connection.ts").then(({ensureNativeRuntime}) => ensureNativeRuntime(process.env.TRELLIS_HOME!));\n${await readFile(entry, "utf8")}`,
		);
		const original = await readBundleManifest(source);
		await writeBundleManifest(source, original.version, original.protocol);
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
		<key>EnvironmentVariables</key><dict>${isolatedEnvironment}<key>TRELLIS_DESKTOP_HOME</key><string>${home}</string></dict>
		<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>1</integer>
		<key>ProcessType</key><string>Interactive</string>
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
		runtime = new RuntimeClient(join(home, "runtime/runtime.sock"));
		const daemon = await runtime.hello();
		const terminal = await runtime.start({ id: "app-update", command: "/bin/cat", args: [], cwd: home, mode: "pty" });
		process.kill(first.pid, "SIGKILL");
		await Bun.sleep(100);
		const second = await adoptHost(home);
		expect(second.pid).not.toBe(first.pid);
		expect(second.origin).toBe(first.origin);
		await writeFile(join(source, "apps/web/dist/update-proof.txt"), "replacement host assets");
		await writeBundleManifest(source, original.version, original.protocol);
		expect((await runtime.hello()).pid).toBe(daemon.pid);
		await mkdir(join(directory, "Applications"));
		await rename(resolve(contents, ".."), join(directory, "Applications/Trellis Probe.app"));
		contents = join(directory, "Applications/Trellis Probe.app/Contents");
		helper = join(contents, "MacOS/TrellisHost");
		source = join(contents, "Resources/host");
		const release = await pinResources(source, directory);
		await expect(
			activateHostRelease(home, helper, release, {
				shutdown: async () => {
					throw new Error("Unconfirmed old runtime stop");
				},
			}),
		).rejects.toThrow("Unconfirmed old runtime stop");
		expect((await serviceCommand(helper, "status")).status).toBe("notRegistered");
		expect((await runtime.hello()).pid).toBe(daemon.pid);
		const updated = await activateHostRelease(home, helper, release);
		expect(updated.pid).not.toBe(second.pid);
		expect(updated.origin).toBe(first.origin);
		const updatedDaemon = await runtime.hello();
		expect(updatedDaemon.pid).not.toBe(daemon.pid);
		expect(JSON.parse(await readFile(join(home, "runtime/manifest.json"), "utf8")).releaseId).toBe(release.manifest.id);
		expect(() => process.kill(daemon.pid, 0)).toThrow();
		expect((await runtime.list()).find((session) => session.id === terminal.id)?.status).toBe("exited");
		const replacement = await runtime.start({
			id: "after-update",
			command: "/bin/cat",
			args: [],
			cwd: home,
			mode: "pty",
		});
		await runtime.input(replacement.id, Buffer.from("new terminal after update\n").toString("base64"));
		let output = "";
		for (let step = 0; step < 100 && !output.includes("new terminal after update"); step++) {
			await Bun.sleep(25);
			output = Buffer.from((await runtime.output(replacement.id)).data, "base64").toString();
		}
		expect(output).toContain("new terminal after update");
		expect((await activateHostRelease(home, helper, release)).pid).toBe(updated.pid);
		expect((await runtime.hello()).pid).toBe(updatedDaemon.pid);
		expect((await runtime.list()).find((session) => session.id === replacement.id)?.status).toBe("running");
		const service = Bun.spawn(["/bin/launchctl", "print", `${domain}/${label}`], { stdout: "pipe", stderr: "pipe" });
		const serviceDescription = await new Response(service.stdout).text();
		expect(await service.exited).toBe(0);
		expect((await serviceCommand(helper, "status")).bundle).toBe(join(directory, "Applications/Trellis Probe.app"));
		expect(serviceDescription).toContain("spawn type = interactive");
		expect(
			await (
				await fetch(`${updated.origin}/api/native-work`, { headers: { Authorization: `Bearer ${updated.token}` } })
			).json(),
		).toEqual({ paused: false });
		expect(
			await (
				await fetch(`${updated.origin}/update-proof.txt`, { headers: { Authorization: `Bearer ${updated.token}` } })
			).text(),
		).toBe("replacement host assets");
	} finally {
		if (runtime) await runtime.shutdown();
		if (registered) {
			await serviceCommand(helper, "unregister");
			await waitForHostExit(home);
			const remains = Bun.spawn(["/bin/launchctl", "print", `${domain}/${label}`], { stdout: "pipe", stderr: "pipe" });
			expect(await remains.exited).not.toBe(0);
		}
		await rm(directory, { recursive: true, force: true });
	}
}, 120000);
