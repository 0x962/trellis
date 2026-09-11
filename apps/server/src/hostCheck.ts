import { isIP } from "node:net";
import type { Config } from "./config.ts";

// DNS rebinding: a web page points its own hostname at 127.0.0.1 and then
// calls the server as a same-origin page, so the CORS allowlist never
// applies. The browser still sends the page's hostname in the Host header,
// so the server serves only the hostnames that an attacker cannot point at
// it, and the hostnames that the owner lists:
// - an IP address, which names no DNS record,
// - `localhost` and every `*.localhost` name, which a browser always
//   resolves to the loopback address (RFC 6761), such as the gateway's
//   `trellis.localhost`,
// - the hostname TRELLIS_HOST names,
// - each hostname TRELLIS_ALLOWED_HOSTS names. A proxy such as Tailscale
//   Serve keeps its own hostname in the Host header when it forwards a
//   request to 127.0.0.1. The owner lists only a name whose DNS records the
//   owner controls, so an attacker cannot point that name at the server.
// The port does not matter for this check, because the attacker controls
// the hostname, not the port.
export const isAllowedHost = (host: string, config: Pick<Config, "host" | "allowedHosts">) => {
	if (!URL.canParse(`http://${host}`)) return false;
	const name = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
	return (
		isIP(name) !== 0 ||
		name === "localhost" ||
		name.endsWith(".localhost") ||
		name === config.host.toLowerCase() ||
		config.allowedHosts.includes(name)
	);
};
