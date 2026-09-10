import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const json = (relativePath: string) => Bun.file(join(root, relativePath)).json();
const text = (relativePath: string) => Bun.file(join(root, relativePath)).text();

const exactPin = /^\d+\.\d+\.\d+$/;

// The folders directly under one directory, as paths from the workspace root.
const moduleDirs = (dir: string) =>
	readdirSync(join(root, dir))
		.filter((entry) => statSync(join(root, dir, entry)).isDirectory())
		.map((entry) => join(dir, entry));

// Every component folder under a `components/` directory, or a feature
// folder such as src/needs-you/NeedsYou, holds `Name.tsx` and `index.ts`.
const componentDirs = (dir: string): string[] =>
	readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory()) return [];
		const path = join(dir, entry.name);
		const own = /^[A-Z]/.test(entry.name) ? [path] : [];
		return [...own, ...componentDirs(path)];
	});

// Every .ts and .tsx file under the four source directories.
const sourceFiles = () =>
	["app", "src", "scripts", "test"].flatMap((dir) =>
		readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
			.filter((entry) => /\.tsx?$/.test(entry))
			.map((entry) => join(dir, entry)),
	);

describe("scaffold", () => {
	// iOS stops an app that opens the camera without a usage description, and
	// the expo-camera plugin writes that description from `cameraPermission`.
	test("app.json configures expo-camera with a camera usage description and pins it", async () => {
		const { expo } = await json("app.json");
		const camera = (expo.plugins as unknown[]).find(
			(plugin): plugin is [string, { cameraPermission: string }] =>
				Array.isArray(plugin) && plugin[0] === "expo-camera",
		);
		expect(camera?.[1].cameraPermission).toMatch(/\S{3,}/);
		const { dependencies } = (await json("package.json")) as { dependencies: Record<string, string> };
		expect(dependencies["expo-camera"]).toMatch(exactPin);
		expect(expo.scheme).toBe("trellis");
	});

	// `userInterfaceStyle` fixes the appearance iOS reports to the app.
	// `automatic` lets `Appearance.getColorScheme()` follow the device, which
	// the System option in Settings needs. The app paints dark on a fresh
	// install through `useTheme`, not through this value.
	test("app.json and package.json carry the bundle id, portrait device appearance, and exact pins", async () => {
		const { expo } = await json("app.json");
		expect(expo.ios.bundleIdentifier).toBe("co.nvdk.trellis");
		expect(expo.userInterfaceStyle).toBe("automatic");
		expect(expo.orientation).toBe("portrait");

		const pkg = await json("package.json");
		expect(pkg.name).toBe("@trellis/mobile");
		const versions = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
		const loose = Object.entries(versions).filter(
			([name, version]) => !exactPin.test(version) && !(name.startsWith("@trellis/") && version === "workspace:*"),
		);
		expect(loose).toEqual([]);
		expect(versions.expo).toStartWith("57.");
		expect(versions["react-native"]).toStartWith("0.87.");
		expect(versions.nativewind).toStartWith("4.");
		expect(versions["@shopify/flash-list"]).toStartWith("2.");
		for (const name of ["react-native-mmkv", "react-native-sse", "expo-image", "expo-haptics"]) {
			expect(versions).toHaveProperty(name);
		}
	});

	// O57. The maintained fork of react-native-markdown-display renders the
	// description and the comment bodies; 9.0.3 is the current release.
	test("the markdown renderer is pinned to one exact version", async () => {
		const { dependencies } = (await json("package.json")) as { dependencies: Record<string, string> };
		expect(dependencies).toHaveProperty("@ronradtke/react-native-markdown-display");
		expect(dependencies["@ronradtke/react-native-markdown-display"]).toMatch(exactPin);
	});

	test("babel, metro, bunfig, and scripts are wired for NativeWind and the two test runners", async () => {
		const babel = require(join(root, "babel.config.js")) as (api: { cache: (flag: boolean) => void }) => {
			presets: unknown[];
		};
		const { presets } = babel({ cache: () => {} });
		expect(presets).toContainEqual(["babel-preset-expo", { jsxImportSource: "nativewind" }]);
		expect(presets).toContain("nativewind/babel");

		const metro = await text("metro.config.js");
		expect(metro).toContain("withNativeWind");
		expect(metro).toContain("global.css");

		const bunfig = Bun.TOML.parse(await text("bunfig.toml")) as { test: { preload: string[] } };
		expect(bunfig.test.preload).toContain("../../test/preload.ts");

		const { scripts } = await json("package.json");
		for (const name of ["test", "test:native", "typecheck", "export:check"]) {
			expect(scripts).toHaveProperty(name);
		}
	});

	test("every file stays under 300 lines and every component has its folder", async () => {
		const long: string[] = [];
		for (const file of sourceFiles()) {
			const lines = (await text(file)).split("\n").length;
			if (lines >= 300) long.push(`${file}: ${lines}`);
		}
		expect(long).toEqual([]);

		const modules = [
			...moduleDirs("src/components"),
			...readdirSync(join(root, "src/features")).flatMap((area) => moduleDirs(join("src/features", area))),
		];
		expect(modules.length).toBeGreaterThan(0);
		// A PascalCase folder holds a component; a camelCase folder holds a
		// module. Either way the folder is named after its one file, and
		// index.ts is what the rest of the app imports.
		const incompleteModules = modules.filter((dir) => {
			const name = dir.split("/").pop()!;
			const entry = existsSync(join(root, dir, `${name}.tsx`)) || existsSync(join(root, dir, `${name}.ts`));
			return !entry || !existsSync(join(root, dir, "index.ts"));
		});
		expect(incompleteModules).toEqual([]);

		const components = componentDirs("src");
		expect(components.length).toBeGreaterThan(0);
		expect(components).toContain("src/needs-you/NeedsYou");
		expect(components).toContain("src/needs-you/NeedsYou/components/InboxRow");
		const incompleteComponents = components.filter(
			(path) =>
				!existsSync(join(root, path, `${path.split("/").pop()}.tsx`)) || !existsSync(join(root, path, "index.ts")),
		);
		expect(incompleteComponents).toEqual([]);
		// O58. A folder under src/components or src/ticket holds a file of its
		// own name (.tsx for a component, .ts for a module) and an index.ts.
		const folders = ["src/components", "src/ticket"].flatMap((dir) =>
			readdirSync(join(root, dir))
				.filter((entry) => statSync(join(root, dir, entry)).isDirectory())
				.map((entry) => join(dir, entry)),
		);
		expect(folders.length).toBeGreaterThan(0);
		const incomplete = folders.filter((folder) => {
			const name = folder.split("/").at(-1)!;
			const own = existsSync(join(root, folder, `${name}.tsx`)) || existsSync(join(root, folder, `${name}.ts`));
			return !own || !existsSync(join(root, folder, "index.ts"));
		});
		expect(incomplete).toEqual([]);
	});
});
