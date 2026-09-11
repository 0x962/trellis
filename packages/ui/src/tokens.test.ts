import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { blocks, findBlock, packageRoot, paletteBlocks, parseCss, readSource } from "../test/css";

const colorTokens = [
	"--bg",
	"--surface",
	"--elevated",
	"--border",
	"--border-strong",
	"--fg",
	"--fg-muted",
	"--fg-faint",
	"--accent",
	"--accent-soft",
	"--agent",
	"--agent-soft",
	"--success",
	"--success-soft",
	"--warning",
	"--warning-soft",
	"--danger",
	"--danger-soft",
	"--scrim",
];

const shadowTokens = ["--shadow-sm", "--shadow-md", "--shadow-lg"];

const fontTokens = ["--sans", "--mono"];

// BerkeleyMono leads both stacks. A machine without it falls back to the
// bundled JetBrains Mono, and "JetBrains Mono Fallback" is the
// metric-matched face that holds the layout until the web font loads (see
// fonts.test.ts).
const fontStacks: Record<string, string> = {
	"--sans":
		'"BerkeleyMono", "JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
	"--mono":
		'"BerkeleyMono", "JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

// The approved palette, one value per themed token. tokens.css is the only
// place these values exist, so this table is what pins them.
const lightPalette: Record<string, string> = {
	"--bg": "#FFFFFF",
	"--surface": "#F7F7F8",
	"--elevated": "#F5F5F5",
	"--border": "#E8E8EA",
	"--border-strong": "#DDDDDF",
	"--fg": "#070707",
	"--fg-muted": "#646468",
	"--fg-faint": "#8E8E95",
	"--accent": "#009FFF",
	"--accent-soft": "#DFEBFF",
	"--agent": "#693ACF",
	"--agent-soft": "#EFE8FB",
	"--success": "#0DBE4E",
	"--success-soft": "#E3F8EA",
	"--warning": "#D5A910",
	"--warning-soft": "#FBF4DA",
	"--danger": "#FF2E3F",
	"--danger-soft": "#FFE6E8",
	"--scrim": "rgba(0,0,0,.4)",
	"--shadow-sm": "0 1px 2px rgba(0,0,0,.06)",
	"--shadow-md": "0 4px 12px rgba(0,0,0,.10)",
	"--shadow-lg": "0 12px 32px rgba(0,0,0,.16)",
};

// Dark has no visible shadow, so each shadow starts with a strong-border ring.
const darkPalette: Record<string, string> = {
	"--bg": "#070707",
	"--surface": "#151516",
	"--elevated": "#1C1C1E",
	"--border": "#242425",
	"--border-strong": "#323234",
	"--fg": "#E8E8EA",
	"--fg-muted": "#BBBBBF",
	"--fg-faint": "#8E8E95",
	"--accent": "#009FFF",
	"--accent-soft": "#19283C",
	"--agent": "#9D6AFB",
	"--agent-soft": "#24183F",
	"--success": "#5ECC71",
	"--success-soft": "#10301A",
	"--warning": "#FFD452",
	"--warning-soft": "#332B0C",
	"--danger": "#FF6762",
	"--danger-soft": "#3A1517",
	"--scrim": "rgba(0,0,0,.6)",
	"--shadow-sm": "0 0 0 1px var(--border-strong)",
	"--shadow-md": "0 0 0 1px var(--border-strong), 0 4px 12px rgba(0,0,0,.4)",
	"--shadow-lg": "0 0 0 1px var(--border-strong), 0 12px 32px rgba(0,0,0,.5)",
};

// The dark blocks redefine the colors and shadows only. The font stacks and
// `color-scheme` do not change with the theme.
const themedTokens = [...colorTokens, ...shadowTokens];

const tokens = async () => parseCss(await readSource("tokens.css"));

// Every `@theme` block merged into one map. Tailwind reads them all.
const theme = (pieces: ReturnType<typeof parseCss>) =>
	Object.assign(
		{},
		...blocks(pieces)
			.filter((piece) => piece.prelude.startsWith("@theme"))
			.map((piece) => piece.declarations),
	);

// The `@theme` block that holds the motion tokens and the keyframes.
const keyframes = (pieces: ReturnType<typeof parseCss>, name: string) =>
	blocks(pieces)
		.filter((piece) => piece.prelude.startsWith("@theme"))
		.flatMap((piece) => piece.children)
		.find((piece) => piece.prelude === `@keyframes ${name}`)!;

const compileTokens = async () => {
	const source = await readSource("tokens.css");
	return compile(`@tailwind utilities;\n${source}`, {
		base: join(packageRoot, "src"),
		loadStylesheet: async (id, base) => {
			const path = id.startsWith(".")
				? join(base, id)
				: fileURLToPath(import.meta.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id));
			return { path, base: join(path, ".."), content: await Bun.file(path).text() };
		},
	});
};

describe("tokens.css", () => {
	test("the peek minimum width uses 60 percent of the viewport", async () => {
		const rule = findBlock(await tokens(), "@utility min-w-peek");
		expect(rule.declarations["min-width"]).toBe("60vw");
	});

	test("a theme switch turns every transition off through data-theme-switch on html", async () => {
		const rule = findBlock(await tokens(), "[data-theme-switch] *");
		expect(rule.declarations["transition-duration"]).toBe("0ms");
	});

	// The live dot on an agent avatar shrinks and dims. A skeleton line shares
	// the animation but must keep its size, so the shrink reads a custom
	// property that the pulse-in-place utility pins to 1.
	test("pulse-live shrinks through --pulse-scale and pulse-in-place pins it to 1", async () => {
		const pieces = await tokens();
		const pulse = keyframes(pieces, "pulse-live");
		const half = pulse.children.find((piece) => piece.prelude === "50%")!;
		expect(half.declarations.transform).toBe("scale(var(--pulse-scale, 0.75))");
		expect(half.declarations.opacity).toBe("0.6");
		const still = findBlock(pieces, "@utility pulse-in-place");
		expect(still.declarations["--pulse-scale"]).toBe("1");
	});

	test("bare :root declares every token before any media or data-theme block", async () => {
		const pieces = await tokens();
		const first = blocks(pieces)[0]!;
		expect(first.prelude).toBe(":root");
		const missing = [...themedTokens, ...fontTokens].filter((name) => !(name in first.declarations));
		expect(missing).toEqual([]);
	});

	test("both dark blocks redefine exactly the light color and shadow set with identical values", async () => {
		const { darkMedia, darkStamp } = paletteBlocks(await tokens());
		const redefined = (declarations: Record<string, string>) =>
			Object.keys(declarations)
				.filter((name) => name.startsWith("--"))
				.sort();
		expect(redefined(darkMedia.declarations)).toEqual([...themedTokens].sort());
		expect(redefined(darkStamp.declarations)).toEqual([...themedTokens].sort());
		for (const name of themedTokens) {
			expect(darkMedia.declarations[name]).toBe(darkStamp.declarations[name]!);
		}
	});

	test("palette and shadow values are the approved ones in light and dark", async () => {
		const ours = paletteBlocks(await tokens());
		for (const [name, value] of Object.entries(lightPalette)) {
			expect(`light ${name}: ${ours.light.declarations[name]}`).toBe(`light ${name}: ${value}`);
		}
		for (const block of ["darkMedia", "darkStamp"] as const) {
			for (const [name, value] of Object.entries(darkPalette)) {
				expect(`${block} ${name}: ${ours[block].declarations[name]}`).toBe(`${block} ${name}: ${value}`);
			}
		}
		expect(ours.light.declarations["--bg"]).toBe("#FFFFFF");
		expect(ours.light.declarations["--danger-soft"]).toBe("#FFE6E8");
		expect(ours.darkStamp.declarations["--bg"]).toBe("#070707");
		expect(ours.darkStamp.declarations["--danger-soft"]).toBe("#3A1517");
		expect(ours.darkStamp.declarations["--shadow-sm"]).toBe("0 0 0 1px var(--border-strong)");
		for (const [name, stack] of Object.entries(fontStacks)) {
			expect(`${name}: ${ours.light.declarations[name]}`).toBe(`${name}: ${stack}`);
		}
	});

	/*
	 * Every neutral comes from one seed grey mixed with black or white in
	 * sRGB, the way code.storage builds its own ramp. The seed is
	 * lab(59.312% 1.0058 -3.62585), which is #8E8E95, and it is --fg-faint
	 * itself in both themes. A step name keeps the same position in the ramp
	 * in light and in dark, so --surface sits one step off the page ground in
	 * both.
	 */
	test("the neutral ramp carries the code.storage greys", async () => {
		const ours = paletteBlocks(await tokens());
		const ramp: Record<string, [string, string]> = {
			"--bg": ["#FFFFFF", "#070707"],
			"--surface": ["#F7F7F8", "#151516"],
			"--elevated": ["#F5F5F5", "#1C1C1E"],
			"--border": ["#E8E8EA", "#242425"],
			"--border-strong": ["#DDDDDF", "#323234"],
			"--fg": ["#070707", "#E8E8EA"],
			"--fg-muted": ["#646468", "#BBBBBF"],
			"--fg-faint": ["#8E8E95", "#8E8E95"],
		};
		for (const [name, [light, dark]] of Object.entries(ramp)) {
			expect(`${name} light ${ours.light.declarations[name]}`).toBe(`${name} light ${light}`);
			expect(`${name} dark ${ours.darkStamp.declarations[name]}`).toBe(`${name} dark ${dark}`);
			expect(`${name} media ${ours.darkMedia.declarations[name]}`).toBe(`${name} media ${dark}`);
		}
	});

	test("@theme exposes every color, shadow, and font token to Tailwind", async () => {
		const map = theme(await tokens());
		for (const name of colorTokens) {
			expect(map[`--color-${name.slice(2)}`]).toBe(`var(${name})`);
		}
		for (const name of shadowTokens) {
			expect(map[name]).toBe(`var(${name})`);
		}
		expect(map["--font-sans"]).toBe("var(--sans)");
		expect(map["--font-mono"]).toBe("var(--mono)");
	});

	test("Tailwind generates token utilities from @theme", async () => {
		const compiler = await compileTokens();
		const expected: Record<string, string[]> = {
			"bg-surface": ["var(--color-surface)", "var(--surface)"],
			"text-fg-muted": ["var(--color-fg-muted)", "var(--fg-muted)"],
			"border-border": ["var(--color-border)", "var(--border)"],
			"text-accent": ["var(--color-accent)", "var(--accent)"],
			"text-agent": ["var(--color-agent)", "var(--agent)"],
			"bg-accent-soft": ["var(--color-accent-soft)", "var(--accent-soft)"],
			"shadow-md": ["var(--shadow-md)"],
			"rounded-md": ["var(--radius-md)"],
			"font-mono": ["var(--font-mono)", "var(--mono)"],
		};
		const css = compiler.build(Object.keys(expected));
		for (const [candidate, references] of Object.entries(expected)) {
			const rule = css.match(new RegExp(`\\.${candidate}\\s*\\{([^}]*)\\}`));
			expect(`${candidate}: ${rule?.[1] ?? "no rule"}`).toMatch(
				new RegExp(references.map((reference) => reference.replace(/[()]/g, "\\$&")).join("|")),
			);
		}
	});

	test("type scale and spacing keep their values with square corners", async () => {
		const map = theme(await tokens());
		const scale: Record<string, [string, string]> = {
			xs: ["11px", "16px"],
			sm: ["12px", "16px"],
			base: ["13px", "20px"],
			md: ["14px", "22px"],
			lg: ["16px", "24px"],
			xl: ["20px", "28px"],
			"2xl": ["24px", "32px"],
			kbd: ["10px", "14px"],
			initials: ["9px", "12px"],
		};
		for (const [step, [size, lineHeight]] of Object.entries(scale)) {
			expect(`${step} ${map[`--text-${step}`]}/${map[`--text-${step}--line-height`]}`).toBe(
				`${step} ${size}/${lineHeight}`,
			);
		}
		expect(map["--spacing"]).toBe("4px");
		expect(map["--radius-sm"]).toBe("0px");
		expect(map["--radius-md"]).toBe("0px");
		expect(map["--radius-lg"]).toBe("0px");
		expect(map["--radius-xl"]).toBe("0px");
	});

	test("every supported radius utility produces square corners, including directional utilities", async () => {
		const compiler = await compileTokens();
		const candidates = [
			"rounded-sm",
			"rounded-md",
			"rounded-lg",
			"rounded-xl",
			"rounded-hairline",
			"rounded-r-sm",
			"rounded-t-xl",
		];
		const pieces = parseCss(compiler.build(candidates));
		const map = theme(await tokens());
		for (const candidate of candidates) {
			const rule = findBlock(pieces, `.${candidate}`);
			expect(rule, candidate).toBeDefined();
			const radii = Object.entries(rule.declarations).filter(([property]) => /^border-.*radius$/.test(property));
			expect(radii.length, candidate).toBeGreaterThan(0);
			for (const [property, value] of radii) {
				const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => map[name]);
				expect(resolved, `${candidate} ${property}`).toMatch(/^0(?:px)?$/);
			}
		}
	});

	test("motion duration and easing tokens carry the plan values", async () => {
		const map = theme(await tokens());
		expect(map["--duration-hover"]).toBe("120ms");
		expect(map["--duration-popover"]).toBe("160ms");
		expect(map["--duration-peek"]).toBe("240ms");
		expect(map["--duration-row"]).toBe("160ms");
		expect(map["--duration-sweep"]).toBe("200ms");
		expect(map["--ease-out"]).toBeString();
		expect(map["--ease-out"]).not.toBeEmpty();
		expect(map["--ease-in-out"]).toBeString();
		expect(map["--ease-in-out"]).not.toBeEmpty();
	});
});
