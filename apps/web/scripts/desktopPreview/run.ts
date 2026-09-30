import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer, loadConfigFromFile } from "vite";
import { defaultDesktopUserData, readSelectedHome } from "../../../desktop/src/selectedHome/selectedHome.ts";
import { previewConfig } from "./previewConfig/previewConfig.ts";

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: { port: { type: "string", default: "5173" }, stop: { type: "boolean", default: false } },
	strict: true,
});
if (process.platform !== "darwin") throw new Error("Desktop UI preview requires the macOS app.");
const executable = join(homedir(), "Applications/Trellis.app/Contents/MacOS/Trellis");
const launch = async (value: string) => {
	const child = spawn(executable, [`--ui-preview=${value}`], { stdio: "ignore", detached: true });
	await new Promise<void>((resolve, reject) => {
		child.once("spawn", resolve);
		child.once("error", reject);
	});
	child.unref();
};

if (values.stop) {
	await launch("off");
} else {
	const port = Number(values.port);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Choose a port from 1 through 65535.");
	const home = readSelectedHome(defaultDesktopUserData());
	const owner = JSON.parse(await readFile(join(home, "trellis.lock"), "utf8"));
	if (owner.role !== "server" || !Number.isInteger(owner.port) || owner.port < 1 || owner.port > 65535)
		throw new Error("Open the installed Trellis app before you start UI preview.");
	if (port === owner.port) throw new Error("UI preview must use a separate server port.");
	const hostOrigin = `http://127.0.0.1:${owner.port}`;
	const loaded = await loadConfigFromFile(
		{ command: "serve", mode: "development" },
		fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
	);
	const config = previewConfig(loaded!.config, hostOrigin, port);
	config.root = fileURLToPath(new URL("../../", import.meta.url));
	const server = await createServer(config);
	try {
		await server.listen();
		await launch(`http://127.0.0.1:${port}`);
		console.log("UI preview uses this workspace and live Trellis data.");
		console.log("To finish, choose Help > Stop UI preview in Trellis, then press Control-C here.");
		await new Promise<void>((resolve) => {
			process.once("SIGINT", resolve);
			process.once("SIGTERM", resolve);
		});
	} finally {
		await server.close();
	}
}
