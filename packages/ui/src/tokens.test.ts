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
	"--control",
	"--control-hover",
	"--control-active",
	"--scrim",
	"--on-accent",
];

const shadowTokens = ["--shadow-sm", "--shadow-md", "--shadow-lg"];

const fontTokens = ["--sans", "--mono"];

// Inter carries the prose and the mono stack carries the ticket
// identifiers and the code blocks. BerkeleyMono leads the mono
// stack. A machine without it falls back to the bundled JetBrains Mono. Each
// "Fallback" entry is the metric-matched face that holds the layout until
// the web font loads (see fonts.test.ts).
const fontStacks: Record<string, string> = {
	"--sans":
		'"Inter Variable", "Inter Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
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
	"--fg-faint": "#6F6F74",
	"--accent": "#6E6E73",
	"--accent-soft": "#EDEDEF",
	"--agent": "#693ACF",
	"--agent-soft": "#EFE8FB",
	"--success": "#097F34",
	"--success-soft": "#E3F8EA",
	"--warning": "#866A0A",
	"--warning-soft": "#FBF4DA",
	"--danger": "#C92432",
	"--danger-soft": "#FFE6E8",
	"--control": "#FFFFFF",
	"--control-hover": "#F4F4F5",
	"--control-active": "#EBEBED",
	"--scrim": "rgba(0,0,0,.4)",
	"--on-accent": "#FFFFFF",
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
	"--accent": "#C4C4C4",
	"--accent-soft": "#2A2A2C",
	"--agent": "#9D6AFB",
	"--agent-soft": "#24183F",
	"--success": "#5ECC71",
	"--success-soft": "#10301A",
	"--warning": "#FFD452",
	"--warning-soft": "#332B0C",
	"--danger": "#FF6762",
	"--danger-soft": "#3A1517",
	"--control": "#1C1C1E",
	"--control-hover": "#252527",
	"--control-active": "#2E2E30",
	"--scrim": "rgba(0,0,0,.6)",
	"--on-accent": "#0A0A0A",
	"--shadow-sm": "0 0 0 1px var(--border-strong)",
	"--shadow-md": "0 0 0 1px var(--border-strong), 0 4px 12px rgba(0,0,0,.4)",
	"--shadow-lg": "0 0 0 1px var(--border-strong), 0 12px 32px rgba(0,0,0,.5)",
};

// The dark blocks redefine the colors and shadows only. The font stacks and
// `color-scheme` do not change with the theme.
const themedTokens = [...colorTokens, ...shadowTokens];

// The WCAG 2.1 relative luminance of an sRGB hex color.
const luminance = (hex: string) => {
	const channel = (offset: number) => {
		const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

// The WCAG 2.1 contrast ratio of two opaque hex colors, lighter over darker.
const contrastRatio = (a: string, b: string) => {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
};

// Every pair of a text token and a ground the app paints it on. `--fg`,
// `--fg-muted`, and `--fg-faint` carry the body text on the three page
// grounds. `--success`, `--warning`, `--danger`, and `--agent` carry a chip
// label on their own soft ground and a line of status text on the page.
// `--fg` and `--danger` carry a button label on each control step.
const textPairs: Array<[string, string]> = [
	["--fg", "--control"],
	["--fg", "--control-hover"],
	["--fg", "--control-active"],
	["--danger", "--control"],
	["--fg", "--bg"],
	["--fg", "--surface"],
	["--fg", "--elevated"],
	["--fg-muted", "--bg"],
	["--fg-muted", "--surface"],
	["--fg-muted", "--elevated"],
	["--fg-faint", "--bg"],
	["--fg-faint", "--surface"],
	["--fg-faint", "--elevated"],
	["--success", "--bg"],
	["--success", "--surface"],
	["--success", "--success-soft"],
	["--warning", "--bg"],
	["--warning", "--surface"],
	["--warning", "--warning-soft"],
	["--danger", "--bg"],
	["--danger", "--surface"],
	["--danger", "--danger-soft"],
	["--accent", "--bg"],
	["--accent", "--surface"],
	["--agent", "--bg"],
	["--agent", "--surface"],
	["--agent", "--agent-soft"],
];

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
	test("a theme switch turns every transition off through data-theme-switch on html", async () => {
		const rule = findBlock(await tokens(), "[data-theme-switch] *");
		expect(rule.declarations["transition-duration"]).toBe("0ms");
	});

	// The pulse-in-place utility keeps skeleton lines at a fixed size.
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
	 * itself in dark. The light ground is far brighter, so light --fg-faint
	 * takes the seed mixed with black at 0.78 and clears 4.5:1 on it. A step
	 * name keeps the same position in the ramp in light and in dark, so
	 * --surface sits one step off the page ground in both.
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
			"--fg-faint": ["#6F6F74", "#8E8E95"],
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
		expect(map["--radius-hairline"]).toBe("3px");
		expect(map["--radius-sm"]).toBe("6px");
		expect(map["--radius-md"]).toBe("8px");
		expect(map["--radius-lg"]).toBe("12px");
		expect(map["--radius-xl"]).toBe("16px");
		expect(map["--radius-round"]).toBe("999px");
	});

	// A corner comes from the scale, never from a literal. Every radius
	// utility the components use, including the directional ones, has to
	// resolve to one step of the scale.
	test("every supported radius utility resolves to a step of the scale", async () => {
		const compiler = await compileTokens();
		const candidates = [
			"rounded-sm",
			"rounded-md",
			"rounded-lg",
			"rounded-xl",
			"rounded-hairline",
			"rounded-round",
			"rounded-r-sm",
			"rounded-t-xl",
		];
		const pieces = parseCss(compiler.build(candidates));
		const map = theme(await tokens());
		const scale = ["3px", "6px", "8px", "12px", "16px", "999px"];
		for (const candidate of candidates) {
			const rule = findBlock(pieces, `.${candidate}`);
			expect(rule, candidate).toBeDefined();
			const radii = Object.entries(rule.declarations).filter(([property]) => /^border-.*radius$/.test(property));
			expect(radii.length, candidate).toBeGreaterThan(0);
			for (const [property, value] of radii) {
				const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => map[name]);
				expect(scale, `${candidate} ${property}`).toContain(resolved);
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

	/*
	 * TRL-32. Body text needs 4.5:1 against the color behind it, in both
	 * themes. The ratios below come from the token values alone, so a change
	 * to a palette value that drops a pair under the threshold fails here,
	 * before a screenshot shows it.
	 */
	test("every text token clears 4.5:1 on every ground it sits on, in both themes", async () => {
		const ours = paletteBlocks(await tokens());
		const worst: string[] = [];
		for (const [themeName, block] of [
			["light", ours.light],
			["dark", ours.darkStamp],
		] as const) {
			for (const [text, ground] of textPairs) {
				const measured = contrastRatio(block.declarations[text]!, block.declarations[ground]!);
				if (measured < 4.5) worst.push(`${themeName} ${text} on ${ground}: ${measured.toFixed(2)}:1`);
			}
		}
		expect(worst).toEqual([]);
	});

	// The pairs above read the data-theme block. The media block carries the
	// same dark values, so it clears the same thresholds.
	test("the media dark block carries the same values as the data-theme block", async () => {
		const ours = paletteBlocks(await tokens());
		for (const [text, ground] of textPairs) {
			for (const name of [text, ground]) {
				expect(`${name} ${ours.darkMedia.declarations[name]}`).toBe(`${name} ${ours.darkStamp.declarations[name]}`);
			}
		}
	});
});
