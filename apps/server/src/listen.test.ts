import { describe, expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import { listenAddresses } from "./listen.ts";

// listenAddresses turns the host the server binds and its port into every
// URL a client can use. A wildcard host answers on every IPv4 address of the
// machine, so the list names each one, the network addresses first.

const v4 = (address: string, internal: boolean) =>
	({ address, family: "IPv4", internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null }) as NetworkInterfaceInfo;
const v6 = (address: string, internal: boolean) =>
	({
		address,
		family: "IPv6",
		internal,
		netmask: "ffff:ffff:ffff:ffff::",
		mac: "00:00:00:00:00:00",
		cidr: null,
		scopeid: 0,
	}) as NetworkInterfaceInfo;

const machine = {
	lo0: [v4("127.0.0.1", true), v6("::1", true)],
	en0: [v6("fe80::1c2b:3a4d:5e6f:7081", false), v4("192.168.1.20", false)],
	utun4: [v4("10.0.0.9", false)],
};

describe("listenAddresses", () => {
	test("a loopback host lists that one address", () => {
		expect(listenAddresses("127.0.0.1", 4521, machine)).toEqual(["http://127.0.0.1:4521"]);
	});

	test("an IPv6 host sits in brackets", () => {
		expect(listenAddresses("::1", 4521, machine)).toEqual(["http://[::1]:4521"]);
	});

	test("a named network address lists that one address", () => {
		expect(listenAddresses("192.168.1.20", 4600, machine)).toEqual(["http://192.168.1.20:4600"]);
	});

	test("0.0.0.0 lists every IPv4 address, network addresses before loopback", () => {
		expect(listenAddresses("0.0.0.0", 4521, machine)).toEqual([
			"http://192.168.1.20:4521",
			"http://10.0.0.9:4521",
			"http://127.0.0.1:4521",
		]);
	});

	test(":: lists the same IPv4 addresses as 0.0.0.0", () => {
		expect(listenAddresses("::", 4521, machine)).toEqual(listenAddresses("0.0.0.0", 4521, machine));
	});
});
