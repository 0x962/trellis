import type { NetworkInterfaceInfo } from "node:os";

// A host in this set binds every address of the machine.
const WILDCARDS = new Set(["0.0.0.0", "::"]);

// An IPv6 address holds colons, so a URL puts it in brackets.
const urlOf = (address: string, port: number) =>
	address.includes(":") ? `http://[${address}]:${port}` : `http://${address}:${port}`;

// Every URL a client can use to reach a server that binds `host` on `port`.
// A wildcard host answers on each IPv4 address in `interfaces`, the value of
// `os.networkInterfaces()`. The network addresses come first, because a phone
// can use only those.
export const listenAddresses = (
	host: string,
	port: number,
	interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string[] => {
	if (!WILDCARDS.has(host)) return [urlOf(host, port)];
	const ipv4 = Object.values(interfaces).flatMap((entries) =>
		(entries ?? []).filter((entry) => entry.family === "IPv4"),
	);
	return [...ipv4.filter((entry) => !entry.internal), ...ipv4.filter((entry) => entry.internal)].map((entry) =>
		urlOf(entry.address, port),
	);
};
