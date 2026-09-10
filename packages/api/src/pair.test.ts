import { describe, expect, test } from "bun:test";
import { lanAddress, pairLink, parsePairLink } from "./pair.ts";

// The web settings page draws a QR code of the pair link, and the phone reads
// the server URL back out of it. Both sides use these three functions.

const server = "http://192.168.1.20:4521";
const link = "trellis://pair?url=http%3A%2F%2F192.168.1.20%3A4521";

describe("pairLink", () => {
	test("the link carries the server URL as one encoded query value", () => {
		expect(pairLink(server)).toBe(link);
	});
});

describe("parsePairLink", () => {
	test("reads the server URL back out of a pair link", () => {
		expect(parsePairLink(link)).toBe(server);
		expect(parsePairLink(pairLink("https://trellis.lan:8443"))).toBe("https://trellis.lan:8443");
	});

	test("reads the url parameter among other parameters", () => {
		expect(parsePairLink(`trellis://pair?v=1&url=${encodeURIComponent(server)}`)).toBe(server);
	});

	test("refuses a link of another scheme or another path", () => {
		expect(parsePairLink(server)).toBeNull();
		expect(parsePairLink(`https://pair?url=${encodeURIComponent(server)}`)).toBeNull();
		expect(parsePairLink(`otherapp://pair?url=${encodeURIComponent(server)}`)).toBeNull();
		expect(parsePairLink(`trellis://ticket?url=${encodeURIComponent(server)}`)).toBeNull();
	});

	test("refuses a link without a url or with a server URL that is not http", () => {
		expect(parsePairLink("trellis://pair")).toBeNull();
		expect(parsePairLink("trellis://pair?url=")).toBeNull();
		expect(parsePairLink(`trellis://pair?url=${encodeURIComponent("javascript:alert(1)")}`)).toBeNull();
		expect(parsePairLink(`trellis://pair?url=${encodeURIComponent("ftp://192.168.1.20")}`)).toBeNull();
		expect(parsePairLink("trellis://pair?url=%E0%A4%A")).toBeNull();
	});
});

describe("lanAddress", () => {
	test("picks the first address a phone can reach", () => {
		expect(lanAddress(["http://127.0.0.1:4521", server, "http://10.0.0.9:4521"])).toBe(server);
	});

	test("finds none when every address is loopback", () => {
		expect(lanAddress(["http://127.0.0.1:4521"])).toBeUndefined();
		expect(lanAddress(["http://[::1]:4521", "http://localhost:4521", "http://127.0.0.2:4521"])).toBeUndefined();
	});
});
