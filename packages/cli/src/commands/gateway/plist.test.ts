import { expect, test } from "bun:test";
import { gatewayPlist } from "./plist";

test("a gateway plist uses Trellis source and preserves the shared routes path", () => {
	const xml = gatewayPlist({
		bun: "/opt/homebrew/bin/bun",
		entry: "/work & code/apps/server/src/gateway.ts",
		routes: "/Users/me/.config/localhost-gateway/routes.json",
		port: 80,
		log: "/tmp/gateway.log",
	});
	expect(xml).toContain("com.trellis.gateway");
	expect(xml).toContain("/work &amp; code/apps/server/src/gateway.ts");
	expect(xml).toContain("/Users/me/.config/localhost-gateway/routes.json");
	expect(xml).toContain("<string>80</string>");
	expect(xml).not.toContain("com.margin");
});
