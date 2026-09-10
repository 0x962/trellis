import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// The routes file of the localhost gateway on port 80 maps each *.localhost
// name to a local port, as { "<name>": <port> }. Other tools own the other
// entries, so a change touches one key and keeps the rest. The gateway reads
// the file at any moment. Each write goes to a temp file in the same
// directory, and a rename replaces the routes file in one step, so a reader
// never sees a partial file.
type Routes = Record<string, number>;

const readRoutes = (path: string): Routes =>
	existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Routes) : {};

const writeRoutes = (path: string, routes: Routes) => {
	mkdirSync(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	writeFileSync(temp, `${JSON.stringify(routes, null, "\t")}\n`);
	renameSync(temp, path);
};

export const setRoute = (path: string, name: string, port: number) =>
	writeRoutes(path, { ...readRoutes(path), [name]: port });

// A missing routes file stays missing.
export const removeRoute = (path: string, name: string) => {
	if (!existsSync(path)) return;
	const kept = Object.entries(readRoutes(path)).filter(([key]) => key !== name);
	writeRoutes(path, Object.fromEntries(kept));
};
