import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CliFailure, fileUnreadable } from "../errors.ts";

// The Trellis desktop app writes `trellis.lock` and `desktop-token` into its
// data directory while its background server runs. A directory without them
// belongs to an app that nobody opened, so the CLI has no host to call and
// the person reads one line that names the directory and the way out.
const noHost = (message: string) => new CliFailure("UNREACHABLE", 5, message);

const readText = (path: string, absent: string) => {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") throw noHost(absent);
		throw fileUnreadable(path, code ?? (error as Error).message);
	}
};

// A lock the app writes while it starts, and a file another program left
// under that name, both parse into something the CLI cannot read.
const parseLock = (text: string, home: string) => {
	try {
		return JSON.parse(text);
	} catch {
		throw noHost(
			`The desktop data directory ${home} holds a trellis.lock that is not JSON. Open Trellis, or pass --url.`,
		);
	}
};

export const desktopConnection = (home: string | undefined): { url: string; token: string } | undefined => {
	if (home === undefined) return;
	const owner = parseLock(
		readText(
			join(home, "trellis.lock"),
			`The desktop data directory ${home} has no running Trellis host (no trellis.lock). Open Trellis, or pass --url.`,
		),
		home,
	);
	if (owner?.role !== "server" || !Number.isInteger(owner.port) || owner.port < 1 || owner.port > 65535)
		throw noHost("The selected Trellis data directory has no background server port.");
	return {
		url: `http://127.0.0.1:${owner.port}`,
		token: readText(
			join(home, "desktop-token"),
			`The desktop data directory ${home} has no desktop-token. Open Trellis once, or pass --url and TRELLIS_AUTH_TOKEN.`,
		).trim(),
	};
};
