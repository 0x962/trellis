import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gatewayHost, isLocalAddress } from "./gateway/listener";
import { gatewayTarget } from "./gateway/target";

const path = process.env.GATEWAY_ROUTES_FILE ?? join(homedir(), ".config/localhost-gateway/routes.json");
const defaults = { trellis: Number(process.env.TRELLIS_PORT ?? 4521), dots: Number(process.env.DOTS_PORT ?? 4517) };
const port = Number(process.env.GATEWAY_PORT ?? 80);
const server = Bun.serve({
	hostname: gatewayHost(process.platform, port),
	port,
	idleTimeout: 120,
	async fetch(request, server) {
		if (!isLocalAddress(server.requestIP(request)?.address)) return new Response("Local access only.", { status: 403 });
		const routes = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, number>) : {};
		const target = gatewayTarget(request.url, { ...defaults, ...routes });
		if (!target) return new Response("No local route matches this hostname.", { status: 404 });
		// A person writes the routes file. A value in it that is no TCP port
		// leaves the gateway with no upstream to call, so the answer is 502
		// and its text names the entry that holds the bad value.
		if (target.kind === "invalid") return new Response(target.message, { status: 502 });
		if (target.kind === "redirect") return Response.redirect(target.url, 302);
		return fetch(target.url, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			redirect: "manual",
		});
	},
});
console.log(`Trellis gateway listens on 127.0.0.1:${server.port}. Routes: ${path}`);
