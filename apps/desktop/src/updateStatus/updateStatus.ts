import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { readBundleManifest } from "../resourceBundle/resourceBundle.ts";

export type UpdateStatus = {
	state: "current" | "restart-required" | "blocked";
	available: PinnedRelease;
	active: PinnedRelease | null;
	runtimeProtocol: number | null;
	detail: string;
};
const activeFile = "desktop-active-release.json";

export const recordActiveRelease = async (home: string, release: PinnedRelease) => {
	const pending = join(home, `${activeFile}.${process.pid}`);
	await writeFile(pending, JSON.stringify({ id: release.manifest.id }), { mode: 0o600 });
	await rename(pending, join(home, activeFile));
};

const readActiveRelease = async (home: string, releases: string): Promise<PinnedRelease | null> => {
	if (!existsSync(join(home, activeFile))) return null;
	const { id } = JSON.parse(await readFile(join(home, activeFile), "utf8"));
	if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("The active release identifier is invalid.");
	const root = join(releases, id);
	if (!existsSync(join(root, "release.json"))) return null;
	return { root, manifest: await readBundleManifest(root) };
};

const runtimeProtocol = async (home: string): Promise<number | null> => {
	const path = join(home, "runtime/manifest.json");
	if (!existsSync(path)) {
		if (existsSync(join(home, "runtime/runtime.sock"))) throw new Error("The execution service has no owner record.");
		return null;
	}
	const { pid, version } = JSON.parse(await readFile(path, "utf8"));
	if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(version) || version <= 0)
		throw new Error("The execution service owner record is invalid.");
	try {
		process.kill(pid, 0);
		return version;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return null;
		throw error;
	}
};

export const readUpdateStatus = async (home: string, available: PinnedRelease): Promise<UpdateStatus> => {
	const active = await readActiveRelease(home, dirname(available.root));
	let protocol: number | null;
	try {
		protocol = await runtimeProtocol(home);
	} catch (error) {
		return {
			state: "blocked",
			available,
			active,
			runtimeProtocol: null,
			detail: `The execution service state is unknown. ${(error as Error).message} Use Stop local work and background service before you activate this package.`,
		};
	}
	if (protocol !== null && protocol !== available.manifest.protocol)
		return {
			state: "blocked",
			available,
			active,
			runtimeProtocol: protocol,
			detail: `The active execution service uses protocol ${protocol}. This package requires protocol ${available.manifest.protocol}. Trellis retains the previous host. Use Stop local work and background service, then reopen Trellis to activate this package.`,
		};
	const current = active === null || active.manifest.id === available.manifest.id;
	return {
		state: current ? "current" : "restart-required",
		available,
		active,
		runtimeProtocol: protocol,
		detail: current
			? "The host uses this package. To replace the app manually, stop local work and the background service, replace Trellis.app, then reopen it. Saved files stay in the selected data directory. Prior runtime versions stay in the application data directory."
			: "The previous host still runs. Use Stop local work and background service, then reopen Trellis to activate this package. Saved files stay in the selected data directory. Prior runtime versions stay in the application data directory.",
	};
};

export const chooseHostRelease = async (home: string, available: PinnedRelease): Promise<PinnedRelease> => {
	const status = await readUpdateStatus(home, available);
	if (status.state !== "blocked") return available;
	if (status.active && (status.runtimeProtocol === null || status.active.manifest.protocol === status.runtimeProtocol))
		return status.active;
	throw new Error(`${status.detail} Restore the previous app if the previous host is unavailable.`);
};
