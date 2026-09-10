import { isIP } from "node:net";

// DNS rebinding: a web page points its own hostname at 127.0.0.1 and then
// calls the server as a same-origin page, so the CORS allowlist never
// applies. The browser still sends the page's hostname in the Host header,
// so the server serves only the hostnames an attacker cannot point at it:
// - an IP address, which names no DNS record,
// - `localhost` and every `*.localhost` name, which a browser always
//   resolves to the loopback address (RFC 6761), such as margin's
//   `trellis.localhost`,
// - the hostname TRELLIS_HOST names.
// The port does not matter for this check, because the attacker controls
// the hostname, not the port.
export const isAllowedHost = (host: string, configHost: string) => {
	if (!URL.canParse(`http://${host}`)) return false;
	const name = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
	return isIP(name) !== 0 || name === "localhost" || name.endsWith(".localhost") || name === configHost.toLowerCase();
};
