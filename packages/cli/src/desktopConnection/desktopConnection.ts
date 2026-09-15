import { readFileSync } from "node:fs";
import { join } from "node:path";

export const desktopConnection = (home: string | undefined): { url: string; token: string } | undefined => {
	if (home === undefined) return;
	const owner = JSON.parse(readFileSync(join(home, "trellis.lock"), "utf8"));
	if (owner.role !== "server" || !Number.isInteger(owner.port) || owner.port < 1 || owner.port > 65535)
		throw new Error("The selected Trellis data directory has no background server port.");
	return {
		url: `http://127.0.0.1:${owner.port}`,
		token: readFileSync(join(home, "desktop-token"), "utf8").trim(),
	};
};
