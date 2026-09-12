import { expect, test } from "bun:test";
import { gatewayHost, isLocalAddress } from "./listener";

test("macOS binds low ports on the wildcard address", () => {
	expect(gatewayHost("darwin", 80)).toBe("0.0.0.0");
	expect(gatewayHost("darwin", 8080)).toBe("127.0.0.1");
	expect(gatewayHost("linux", 80)).toBe("127.0.0.1");
});

test("the gateway accepts only local clients", () => {
	for (const address of ["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"]) {
		expect(isLocalAddress(address)).toBe(true);
	}
	for (const address of ["192.168.1.2", "100.64.0.1", "::ffff:192.168.1.2", undefined]) {
		expect(isLocalAddress(address)).toBe(false);
	}
});
