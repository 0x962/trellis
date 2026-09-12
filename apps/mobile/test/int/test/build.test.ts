import { originDir } from "../../../../../test/originDir.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(originDir(import.meta.dir), "..");

// Runs one command in the workspace. CI=1 keeps jest and expo out of
// interactive mode.
const run = (command: string[]) => {
	const result = Bun.spawnSync(command, {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CI: "1" },
	});
	const output = result.stdout.toString() + result.stderr.toString();
	if (result.exitCode !== 0) console.log(output);
	return { exitCode: result.exitCode, output };
};

// The component suite takes seconds, so it runs once and two tests read the
// same result.
let suite: ReturnType<typeof run> | undefined;
const componentSuite = () => {
	suite ??= run(["bun", "run", "test:native"]);
	return suite;
};

const componentTests = (dir: string) =>
	readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
		.filter((entry) => entry.endsWith(".test.tsx"))
		.map((entry) => join(dir, entry));

// The iOS export takes a minute, so it runs once and two tests read it.
// `--dump-assetmap` writes assetmap.json, which names every bundled asset.
let exported: { exitCode: number; out: string } | undefined;
const iosExport = () => {
	if (exported === undefined) {
		const out = mkdtempSync(join(tmpdir(), "trellis-export-"));
		const command = ["bunx", "expo", "export", "--platform", "ios", "--output-dir", out, "--dump-assetmap"];
		exported = { exitCode: run(command).exitCode, out };
	}
	return exported;
};

// The font files of @expo/vector-icons, one per icon set.
const iconFontDir = join(
	require.resolve("@expo/vector-icons/package.json"),
	"..",
	"build/vendor/react-native-vector-icons/Fonts",
);

describe("build", () => {
	test("typecheck exits 0", () => {
		expect(run(["bun", "run", "typecheck"]).exitCode).toBe(0);
	}, 600_000);

	test("expo export for ios exits 0", () => {
		const { exitCode, out } = iosExport();
		expect(exitCode).toBe(0);
		const metadata = JSON.parse(readFileSync(join(out, "metadata.json"), "utf8")) as {
			fileMetadata: { ios: { bundle: string } };
		};
		expect(existsSync(join(out, metadata.fileMetadata.ios.bundle))).toBe(true);
	}, 600_000);

	// One import of the @expo/vector-icons barrel bundles the font of every
	// icon set. The app draws Ionicons only.
	test("expo export for ios bundles Ionicons as its only icon font", () => {
		const iconFonts = new Set(readdirSync(iconFontDir).map((file) => file.replace(/\.ttf$/, "")));
		const assets = Object.values(
			JSON.parse(readFileSync(join(iosExport().out, "assetmap.json"), "utf8")) as Record<
				string,
				{ name: string; type: string }
			>,
		);
		const bundled = assets.filter((asset) => asset.type === "ttf" && iconFonts.has(asset.name));
		expect(bundled.map((asset) => asset.name)).toEqual(["Ionicons"]);
	}, 600_000);

	test("the jest-expo component suite exits 0", () => {
		const { exitCode, output } = componentSuite();
		expect(exitCode).toBe(0);
		const files = [...componentTests("app"), ...componentTests("src")];
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) expect(output).toContain(`PASS ${file}`);
	}, 600_000);

	// Jest prints this line when it has to kill a worker that still holds a
	// timer or a socket after its last test.
	test("the jest-expo component suite leaves no handle open", () => {
		expect(componentSuite().output).not.toContain("failed to exit gracefully");
	}, 600_000);
});
