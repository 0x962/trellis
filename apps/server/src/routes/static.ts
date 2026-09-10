import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Context } from "hono";
import type { Config } from "../config.ts";

const VITE_URL = "http://localhost:5173";

// One paragraph for a server without a built web app.
const missingDist = (webDist: string) =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>trellis</title></head><body><p>The web app is not built: ${webDist} holds no index.html. Run <code>bun run build</code> in the repo and start the server again, or open the Vite dev server at <a href="${VITE_URL}">${VITE_URL}</a>.</p></body></html>`;

const IMMUTABLE = "public, max-age=31536000, immutable";

// The path is user input. A malformed percent escape names no file, so the
// path gets the app shell: null here.
const decodedPath = (url: string) => {
	try {
		return decodeURIComponent(new URL(url).pathname);
	} catch (error) {
		if (error instanceof URIError) return null;
		throw error;
	}
};

// Serves the web dist. A file under `/assets/` carries a content hash in
// its name, so it never changes and caches for a year. Every other path
// is the app shell, which caches nothing so a new build shows at once.
export const staticRoute = (config: Config) => async (c: Context) => {
	const index = join(config.webDist, "index.html");
	if (!existsSync(index)) return c.html(missingDist(config.webDist));
	const pathname = decodedPath(c.req.url);
	if (pathname !== null && pathname !== "/") {
		const target = resolve(config.webDist, `.${pathname}`);
		const file = Bun.file(target);
		if (target.startsWith(config.webDist + sep) && (await file.exists())) {
			const cache = pathname.startsWith("/assets/") ? IMMUTABLE : "no-cache";
			return new Response(file, { headers: { "content-type": file.type, "cache-control": cache } });
		}
	}
	return new Response(Bun.file(index), {
		headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
	});
};
