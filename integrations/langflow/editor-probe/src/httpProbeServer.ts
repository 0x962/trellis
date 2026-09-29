import { writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, relative, resolve } from "node:path";
import { createGatewayProtocol, probeSessionCookie } from "./gatewayProtocol.ts";

// This standalone probe runs outside Turbo and reads its private asset directory from the process owner.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: The probe does not run through a cached Turbo task.
const assetRoot = resolve(process.env.TRL_EDITOR_ASSETS!);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: The probe does not run through a cached Turbo task.
const evidencePath = resolve(process.env.TRL_EDITOR_EVIDENCE!);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: The probe does not run through a cached Turbo task.
const expiresAt = process.env.TRL_EDITOR_DEADLINE!;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: The probe does not run through a cached Turbo task.
const port = Number(process.env.TRL_EDITOR_PORT!);
const host = "127.0.0.1";
const origin = `http://${host}:${port}`;
const protocol = createGatewayProtocol({ expiresAt });

const mimeTypes: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

const securityHeaders = {
	"content-security-policy":
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
	"cross-origin-opener-policy": "same-origin",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
};

const readBody = async (request: IncomingMessage) => {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
};

const requestHeaders = (request: IncomingMessage) =>
	Object.fromEntries(
		Object.entries(request.headers).map(([name, value]) => [
			name,
			Array.isArray(value) ? value.join(", ") : (value ?? ""),
		]),
	);

const writeEvidence = () => {
	writeFileSync(evidencePath, `${JSON.stringify(protocol.snapshot(), null, 2)}\n`, { mode: 0o600 });
};

const sendJson = (response: ServerResponse, status: number, body: unknown) => {
	response.writeHead(status, { ...securityHeaders, "content-type": "application/json; charset=utf-8" });
	response.end(`${JSON.stringify(body)}\n`);
};

const apiPath = (path: string) => path.startsWith("/api/") || path.startsWith("/__probe/");

const serveApi = async (request: IncomingMessage, response: ServerResponse, path: string) => {
	const result = protocol.dispatch({
		method: request.method ?? "GET",
		path,
		headers: requestHeaders(request),
		bodyText: await readBody(request),
		now: new Date().toISOString(),
	});
	writeEvidence();
	if (result.disconnect) {
		// A partial response makes the client observe a lost receipt after the gateway accepts the save.
		// An empty disconnect can trigger a transparent transport retry of the PUT request.
		response.writeHead(result.status, {
			...securityHeaders,
			"content-type": "application/json; charset=utf-8",
			"content-length": Buffer.byteLength(`${JSON.stringify(result.body)}\n`),
		});
		response.flushHeaders();
		response.write("{", () => response.destroy());
		return;
	}
	sendJson(response, result.status, result.body);
};

const safeAssetPath = (path: string) => {
	const requestedPath = path === "/" || path.startsWith("/flow/") ? "/index.html" : path;
	const candidate = resolve(assetRoot, `.${decodeURIComponent(requestedPath)}`);
	if (relative(assetRoot, candidate).startsWith("..")) return null;
	return candidate;
};

const serveAsset = async (response: ServerResponse, path: string) => {
	const candidate = safeAssetPath(path);
	if (candidate === null) {
		sendJson(response, 403, { error: "asset_path_denied" });
		return;
	}
	const file = await stat(candidate).then((value) => (value.isFile() ? candidate : resolve(assetRoot, "index.html")));
	const body = await readFile(file);
	const headers: Record<string, string> = {
		...securityHeaders,
		"content-type": mimeTypes[extname(file)] ?? "application/octet-stream",
	};
	if (file.endsWith("index.html")) {
		headers["set-cookie"] = `${probeSessionCookie}; HttpOnly; SameSite=Strict; Path=/`;
	}
	response.writeHead(200, headers);
	response.end(body);
};

const server = createServer(async (request, response) => {
	const path = new URL(request.url ?? "/", origin).pathname;
	if (apiPath(path)) {
		await serveApi(request, response, path);
		return;
	}
	await serveAsset(response, path);
});

server.listen(port, host, () => {
	writeEvidence();
	process.stdout.write(
		`${JSON.stringify({ origin, pid: process.pid, flowPath: `/flow/${protocol.snapshot().flowId}/` })}\n`,
	);
});
