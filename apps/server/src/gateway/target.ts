import { reviewHref } from "@trellis/api";

// Reads the hostname of a request and says where the gateway sends it.
// `null` means no entry of `routes` carries that hostname. A person writes
// the routes file by hand, so an entry can hold a value that is no TCP
// port. That entry gets the `invalid` kind, and the caller answers with
// `message`.
export function gatewayTarget(input: string, routes: Record<string, number>) {
	const url = new URL(input);
	const name = url.hostname.replace(/\.localhost$/, "");
	if (name === "margin") {
		const path = url.pathname === "/" ? "/reviews" : reviewHref(url.pathname.slice(1));
		return { kind: "redirect" as const, url: `http://trellis.localhost${path}${url.hash}` };
	}
	const port = routes[name];
	if (port === undefined) return null;
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		return { kind: "invalid" as const, message: `Invalid gateway port for ${name}.` };
	url.protocol = "http:";
	url.hostname = "127.0.0.1";
	url.port = String(port);
	return { kind: "proxy" as const, url: url.href };
}
