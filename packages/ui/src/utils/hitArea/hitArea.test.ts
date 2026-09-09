import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { blocks, packageRoot, parseCss, readSource } from "../../../test/css";
import { type HitAreaKey, hitArea } from "./hitArea";

// The drawn box each entry serves: the smallest border box in px, and the
// border width that the layer's insets have to cross. A control with text
// declares the smallest width its own min-width class allows.
const geometry: Record<HitAreaKey, { width: number; height: number; border: number }> = {
	box16: { width: 16, height: 16, border: 0 },
	box16Bordered: { width: 16, height: 16, border: 1 },
	box24Bordered: { width: 28, height: 24, border: 1 },
	box28Bordered: { width: 28, height: 28, border: 1 },
	segment28: { width: 28, height: 28, border: 1 },
};

// The drawn width a segment reaches on a coarse pointer through its own
// min-width class; the layer grows its height only.
const segmentCoarseWidth = 44;

// How far the layer reaches past the padding box on each axis, in px.
type Insets = { x: number; y: number };

// Reads the ::before insets that a rule sets, as a reach past the padding
// box: `inset: -6px` reaches 6 px. Tailwind writes a spacing value as
// `calc(var(--spacing) * n)`, so the multiplier is resolved against the
// spacing token.
const readInsets = (declarations: Record<string, string>, spacing: number, current: Insets): Insets => {
	const px = (value: string) => {
		const multiplier = value.match(/calc\(var\(--spacing\) \* (-?[\d.]+)\)/);
		if (multiplier) return -Number(multiplier[1]) * spacing;
		return -Number(value.replace("px", ""));
	};
	const next = { ...current };
	if (declarations.inset) next.x = next.y = px(declarations.inset);
	if (declarations["inset-inline"]) next.x = px(declarations["inset-inline"]);
	if (declarations["inset-block"]) next.y = px(declarations["inset-block"]);
	return next;
};

// The selector Tailwind writes for a class name, as a regular expression.
const selector = (name: string) => {
	const escaped = `.${name.replace(/[.:]/g, "\\$&")}::before`;
	return new RegExp(`${escaped.replace(/[\\.:*+?^${}()|[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
};

describe("hitArea", () => {
	// happy-dom lays nothing out, so the probe reads the compiled rules and
	// adds the insets to the drawn box the way a browser does: the layer is
	// positioned against the padding box, so the border sits between the
	// drawn edge and the layer's edge. The hit box is the larger of the drawn
	// box and the layer.
	test("every entry reaches 28 px on a fine pointer and 44 px on a coarse pointer in both axes", async () => {
		const source = await readSource("tokens.css");
		const theme = Object.assign(
			{},
			...blocks(parseCss(source))
				.filter((piece) => piece.prelude.startsWith("@theme"))
				.map((piece) => piece.declarations),
		) as Record<string, string>;
		const spacing = Number(theme["--spacing"]!.replace("px", ""));
		expect(spacing).toBe(4);
		const compiler = await compile(`@tailwind utilities;\n${source}`, {
			base: join(packageRoot, "src"),
			loadStylesheet: async (id, base) => {
				const path = id.startsWith(".") ? join(base, id) : fileURLToPath(import.meta.resolve(id));
				return { path, base: join(path, ".."), content: await Bun.file(path).text() };
			},
		});
		const classes = Object.values(hitArea).flatMap((entry) => entry.split(" "));
		const css = compiler.build(classes);
		const measured: Record<string, { fine: string; coarse: string }> = {};
		for (const [key, entry] of Object.entries(hitArea) as [HitAreaKey, string][]) {
			const { width, height, border } = geometry[key];
			let fine: Insets = { x: 0, y: 0 };
			let coarse: Insets = fine;
			for (const name of entry.split(" ")) {
				const match = css.match(selector(name));
				if (!match) continue;
				const declarations = parseCss(`a{${match[1]}}`)[0]!.declarations;
				const coarseOnly = name.startsWith("pointer-coarse:");
				if (coarseOnly) {
					coarse = readInsets(declarations, spacing, coarse);
				} else {
					fine = readInsets(declarations, spacing, fine);
					coarse = readInsets(declarations, spacing, coarse);
				}
			}
			const box = (insets: Insets, drawnWidth: number) => ({
				width: Math.max(drawnWidth, drawnWidth - 2 * border + 2 * insets.x),
				height: Math.max(height, height - 2 * border + 2 * insets.y),
			});
			const fineBox = box(fine, width);
			const coarseBox = box(coarse, key === "segment28" ? segmentCoarseWidth : width);
			measured[key] = {
				fine: `${fineBox.width}x${fineBox.height}`,
				coarse: `${coarseBox.width}x${coarseBox.height}`,
			};
			expect(`${key} fine ${measured[key].fine}`).toMatch(/ (2[89]|[3-9]\d)x(2[89]|[3-9]\d)$/);
			expect(`${key} coarse ${measured[key].coarse}`).toMatch(/ (4[4-9]|[5-9]\d)x(4[4-9]|[5-9]\d)$/);
		}
		expect(css).toContain("@media (pointer: coarse)");
	});
});
