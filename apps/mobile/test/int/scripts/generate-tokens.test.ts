import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { originDir } from "../../../../../test/originDir.ts";

const root = join(originDir(import.meta.dir), "..");

const colorKeys = [
	"accent",
	"accentSoft",
	"agent",
	"agentSoft",
	"bg",
	"border",
	"borderStrong",
	"control",
	"controlActive",
	"controlHover",
	"danger",
	"dangerSoft",
	"elevated",
	"fg",
	"fgFaint",
	"fgMuted",
	"onAccent",
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

	test("tokens.ts carries both palettes with equal key sets and the token values", async () => {
		const { tokens } = await import("../../../src/theme/tokens");
		expect(Object.keys(tokens.light).sort()).toEqual(colorKeys);
		expect(Object.keys(tokens.dark).sort()).toEqual(colorKeys);
		expect(tokens.light.bg).toBe("#FFFFFF");
		expect(tokens.dark.bg).toBe("#070707");
		expect(tokens.light.accent).toBe("#6E6E73");
		expect(tokens.dark.accent).toBe("#C4C4C4");
		expect(tokens.radius).toEqual({ hairline: 3, sm: 6, md: 8, lg: 12, xl: 16, round: 999 });
		expect(tokens.hairline).toBe(1);
		expect(Object.values(tokens.text)).toEqual([11, 12, 13, 14, 16, 20, 24]);
		expect(typeof tokens.font.sans).toBe("string");
		expect(typeof tokens.font.mono).toBe("string");
	});

	// app/_layout.tsx passes tokens.font.mono to useFonts as the name of the
	// JetBrains Mono file. React Native draws a family it holds no file for
	// in the system font, so a name the app cannot load is a silent wrong
	// face. BerkeleyMono leads the CSS mono stack and ships no file. The app
	// bundles no sans file and sets no fontFamily for prose, so every screen
	// draws its prose in the system font.
	test("the font tokens name the family the app bundles", async () => {
		const { tokens } = await import("../../../src/theme/tokens");
		expect(tokens.font.mono).toBe("JetBrains Mono");
		expect(tokens.font.sans).toBe("Inter");
	});
});
