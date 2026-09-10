import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// The router plugin writes src/routeTree.gen.ts from the files under
// src/routes. The file is committed, so a test reads it without a build.
// A route id is the file path under src/routes, so the ids name the plan
// routes whatever URL escape a file name carries.
const read = () => Bun.file(join(import.meta.dir, "routeTree.gen.ts")).text();

const planRoutes = ["/", "/setup", "/settings", "/search", "/_gallery", "/needs-you", "/all", "/p/$", "/t/$identifier"];

describe("routeTree.gen.ts", () => {
	// WS-12. A `*.test.tsx` beside a route must never become a route, so the
	// generated tree names no test file.
	test("the router tree includes every plan route and no test file", async () => {
		const source = await read();
		const start = source.indexOf("interface FileRoutesById");
		expect(start).toBeGreaterThan(0);
		const end = source.indexOf("}", start);
		const block = source.slice(start, end);
		const ids = [...block.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]!).filter((id) => id !== "__root__");
		expect(ids.sort()).toEqual([...planRoutes].sort());
		expect(source).not.toMatch(/\.test\.tsx?/);
	});
});
