import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { blocks, findBlock, mockupStyle, packageRoot, paletteBlocks, parseCss, readSource } from "../test/css";

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

describe("tokens.css", () => {
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

	test("palette and shadow values match the mockup verbatim in light and dark", async () => {
		const ours = paletteBlocks(await tokens());
		const theirs = paletteBlocks(await mockupStyle());
		for (const block of ["light", "darkMedia", "darkStamp"] as const) {
			for (const name of themedTokens) {
				expect(`${block} ${name}: ${ours[block].declarations[name]}`).toBe(
					`${block} ${name}: ${theirs[block].declarations[name]}`,
				);
			}
		}
		expect(ours.light.declarations["--bg"]).toBe("#FFFFFF");
		expect(ours.light.declarations["--danger-soft"]).toBe("#FFE6E8");
		expect(ours.darkStamp.declarations["--bg"]).toBe("#070707");
		expect(ours.darkStamp.declarations["--danger-soft"]).toBe("#3A1517");
		expect(ours.darkStamp.declarations["--shadow-sm"]).toBe("0 0 0 1px var(--border-strong)");
		// The mockup names BerkeleyMono and JetBrains Mono, and tokens.css
		// inserts the metric-matched "JetBrains Mono Fallback" between the
		// second entry and the generic tail (see fonts.test.ts).
		for (const name of fontTokens) {
			const tail = (stack: string, from: number) => stack.split(",").slice(from).join(",").trim();
			expect(tail(ours.light.declarations[name]!, 3)).toBe(tail(theirs.light.declarations[name]!, 2));
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
		const source = await readSource("tokens.css");
		const compiler = await compile(`@tailwind utilities;\n${source}`, {
			base: join(packageRoot, "src"),
			loadStylesheet: async (id, base) => {
				const path = id.startsWith(".")
					? join(base, id)
					: fileURLToPath(import.meta.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id));
				return { path, base: join(path, ".."), content: await Bun.file(path).text() };
			},
		});
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

	test("type scale, spacing base, and radii tokens carry the plan values", async () => {
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
		expect(map["--radius-sm"]).toBe("4px");
		expect(map["--radius-md"]).toBe("6px");
		expect(map["--radius-lg"]).toBe("8px");
		expect(map["--radius-xl"]).toBe("12px");
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
