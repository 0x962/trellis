import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import uiPkg from "../../packages/ui/package.json";
import bunfig from "./bunfig.toml";
import pkg from "./package.json";

// The packages the web-shell scope names. Each one is pinned to the exact
// npm release, so two installs never resolve two versions of a package.
const scoped = [
	"react",
	"react-dom",
	"@tanstack/react-router",
	"@tanstack/router-plugin",
	"@tanstack/react-query",
	"@orpc/client",
	"@orpc/tanstack-query",
	"@trellis/api",
	"@trellis/ui",
	"tailwindcss",
	"@tailwindcss/vite",
	"vite",
	"zustand",
	"hono",
	"happy-dom",
	"@testing-library/react",
	"@playwright/test",
];

const exact = /^\d+\.\d+\.\d+$/;

const declared = (): Record<string, string> => ({ ...pkg.dependencies, ...pkg.devDependencies });

describe("apps/web package", () => {
	// WS-01
	test("package.json pins every dependency exactly and declares the plan scripts", () => {
		expect(pkg.name).toBe("@trellis/web");
		expect(pkg.private).toBe(true);
		const versions = declared();
		for (const name of scoped) {
			expect(versions, name).toHaveProperty(name);
		}
		for (const [name, version] of Object.entries(versions)) {
			if (name.startsWith("@trellis/")) {
				expect(version, name).toBe("workspace:*");
				continue;
			}
			expect(version, name).toMatch(exact);
		}
		expect(versions.react).toBe(uiPkg.peerDependencies.react);
		expect(versions["react-dom"]).toBe(uiPkg.peerDependencies["react-dom"]);
		for (const script of ["dev", "dev:fake", "build", "test", "typecheck", "lint", "e2e", "size-budget"]) {
			expect(pkg.scripts, script).toHaveProperty(script);
		}
	});

	// WS-02. Bun reads bunfig.toml from the current directory only, so the web
	// workspace lists the root preload itself. happy-dom registers before the
	// cleanup file, because Testing Library reads `document` on import.
	test("bunfig.toml preloads the root TRELLIS_HOME preload, happy-dom, and cleanup", () => {
		expect(bunfig.test.preload).toEqual(["../../test/preload.ts", "./test/dom.ts", "./test/cleanup.ts"]);
		expect(join(import.meta.dir, "test/dom.ts")).toBeString();
		const dom = Bun.file(join(import.meta.dir, "test/dom.ts"));
		const cleanup = Bun.file(join(import.meta.dir, "test/cleanup.ts"));
		expect(dom.size).toBeGreaterThan(0);
		expect(cleanup.size).toBeGreaterThan(0);
	});
});
