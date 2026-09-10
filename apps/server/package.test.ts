import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;

const json = (relativePath: string) => Bun.file(join(root, relativePath)).json();
const text = (relativePath: string) => Bun.file(join(root, relativePath)).text();

// Every file under a directory, depth first, as a path relative to the package.
const walk = (dir: string): string[] =>
	readdirSync(join(root, dir)).flatMap((entry) => {
		const relativePath = join(dir, entry);
		return statSync(join(root, relativePath)).isDirectory() ? walk(relativePath) : [relativePath];
	});

describe("apps/server package", () => {
	test("package.json names @trellis/server, pins every dependency, and declares the scripts", async () => {
		const pkg = await json("package.json");
		expect(pkg.name).toBe("@trellis/server");
		const dependencies: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
		for (const name of [
			"hono",
			"@orpc/server",
			"@orpc/openapi",
			"@electric-sql/pglite",
			"drizzle-orm",
			"drizzle-kit",
			"ulid",
			"zod",
		]) {
			expect(dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
		}
		expect(dependencies["@trellis/api"]).toBe("workspace:*");
		for (const [name, version] of Object.entries(dependencies)) {
			if (name.startsWith("@trellis/")) continue;
			expect(version).toMatch(/^\d+\.\d+\.\d+$/);
		}
		for (const script of ["test", "typecheck", "db:generate"]) {
			expect(pkg.scripts).toHaveProperty(script);
		}
	});

	test("bunfig preloads the root test preload and tsconfig extends the root base", async () => {
		const bunfig = Bun.TOML.parse(await text("bunfig.toml")) as { test: { preload: string[] } };
		expect(bunfig.test.preload).toEqual(["../../test/preload.ts"]);
		const tsconfig = await json("tsconfig.json");
		expect(tsconfig.extends).toBe("../../tsconfig.base.json");
	});

	test("the server package declares dev, start, typecheck and test", async () => {
		const pkg = await json("package.json");
		for (const script of ["dev", "start", "typecheck", "test"]) {
			expect(pkg.scripts, script).toHaveProperty(script);
		}
		expect(pkg.scripts.start).toContain("src/index.ts");
		expect(pkg.scripts.dev).toContain("src/index.ts");
		expect(pkg.scripts.test).toBe("bun test");
	});

	test("the server bunfig preloads the shared test setup", async () => {
		const bunfig = Bun.TOML.parse(await text("bunfig.toml")) as { test: { preload: string[] } };
		expect(bunfig.test.preload).toEqual(["../../test/preload.ts"]);
		expect(await text("../../test/preload.ts")).toContain("TRELLIS_HOME");
	});

	test("no server source file passes 300 lines", () => {
		const files = walk("src").filter((file) => file.endsWith(".ts"));
		const over = files.filter((file) => readFileSync(join(root, file), "utf8").split("\n").length > 300);
		expect(over).toEqual([]);
	});

	test("every server source file stays under 300 lines", () => {
		const files = [...walk("src"), ...walk("test"), "drizzle.config.ts"].filter((file) => file.endsWith(".ts"));
		const over = files.filter((file) => readFileSync(join(root, file), "utf8").split("\n").length > 300);
		expect(over).toEqual([]);
	});
});
