import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const colorKeys = [
	"accent",
	"accentSoft",
	"agent",
	"agentSoft",
	"bg",
	"border",
	"borderStrong",
	"danger",
	"dangerSoft",
	"elevated",
	"fg",
	"fgFaint",
	"fgMuted",
	"scrim",
	"success",
	"successSoft",
	"surface",
	"warning",
	"warningSoft",
];

describe("generate-tokens", () => {
	// The script reads packages/ui/src/tokens.css and writes the TypeScript
	// module. The checked-in module is the script's own output.
	test("generate-tokens writes a file equal to the checked-in src/theme/tokens.ts", async () => {
		const out = join(mkdtempSync(join(tmpdir(), "trellis-tokens-")), "tokens.ts");
		const result = Bun.spawnSync(["bun", "scripts/generate-tokens.ts", out], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.stderr.toString()).toBe("");
		expect(result.exitCode).toBe(0);
		expect(await Bun.file(out).text()).toBe(await Bun.file(join(root, "src/theme/tokens.ts")).text());
	});

	test("tokens.ts carries both palettes with equal key sets and the mockup values", async () => {
		const { tokens } = await import("../src/theme/tokens");
		expect(Object.keys(tokens.light).sort()).toEqual(colorKeys);
		expect(Object.keys(tokens.dark).sort()).toEqual(colorKeys);
		expect(tokens.light.bg).toBe("#FFFFFF");
		expect(tokens.dark.bg).toBe("#070707");
		expect(tokens.light.accent).toBe("#009FFF");
		expect(tokens.dark.accent).toBe("#009FFF");
		expect(Object.values(tokens.radius)).toEqual([4, 6, 8, 12]);
		expect(Object.values(tokens.text)).toEqual([11, 12, 13, 14, 16, 20, 24]);
		expect(typeof tokens.font.sans).toBe("string");
		expect(typeof tokens.font.mono).toBe("string");
	});

	// app/_layout.tsx passes tokens.font.mono to useFonts as the name of the
	// JetBrains Mono file. React Native draws a family it holds no file for
	// in the system font, so a name the app cannot load is a silent wrong
	// face. BerkeleyMono leads the CSS stacks and ships no file.
	test("the font tokens name the family the app bundles", async () => {
		const { tokens } = await import("../src/theme/tokens");
		expect(tokens.font.mono).toBe("JetBrains Mono");
		expect(tokens.font.sans).toBe("JetBrains Mono");
	});
});
