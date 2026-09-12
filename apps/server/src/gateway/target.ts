import { reviewHref } from "@trellis/api";
export function gatewayTarget(input: string, routes: Record<string, number>) {
	const url = new URL(input);
	const name = url.hostname.replace(/\.localhost$/, "");
	if (name === "margin") {
		const path = url.pathname === "/" ? "/reviews" : reviewHref(url.pathname.slice(1));
		return { kind: "redirect" as const, url: `http://trellis.localhost${path}${url.hash}` };
	}
	const port = routes[name];
	if (port === undefined) return null;
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid gateway port for ${name}.`);
	url.protocol = "http:";
	url.hostname = "127.0.0.1";
	url.port = String(port);
	return { kind: "proxy" as const, url: url.href };
}
