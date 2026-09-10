import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { blocks, packageRoot, parseCss, readSource } from "../../../test/css";
import { type HitAreaKey, hitArea } from "./hitArea";

// The drawn box each entry serves: the smallest border box in px. `borderX`
// and `borderY` are the border widths the layer's insets cross, added up
// per axis. A control with text declares the smallest width its own
// min-width class allows; `coarseWidth` is that width on a coarse pointer.
// A tab has no min-width of its own, so a 3 px label stands for the
// smallest tab. The resize handle fills the sheet, which fills the
// viewport, so 320 px stands for the shortest viewport.
type Geometry = { width: number; height: number; borderX: number; borderY: number; coarseWidth?: number };
const geometry: Record<HitAreaKey, Geometry> = {
	box16: { width: 16, height: 16, borderX: 0, borderY: 0 },
	box16Bordered: { width: 16, height: 16, borderX: 2, borderY: 2 },
	box24Bordered: { width: 28, height: 24, borderX: 2, borderY: 2 },
	box28Bordered: { width: 28, height: 28, borderX: 2, borderY: 2 },
	box32Bordered: { width: 28, height: 32, borderX: 2, borderY: 2 },
	segment28: { width: 28, height: 28, borderX: 2, borderY: 2, coarseWidth: 44 },
	tab32: { width: 3, height: 32, borderX: 0, borderY: 2 },
	handle4: { width: 4, height: 320, borderX: 0, borderY: 0 },
};

// The layer's shape: how far it reaches past the padding box on each axis,
// and the smallest size it keeps on each axis, in px. A centered layer with
// a minimum size covers a control narrower than that size.
type Layer = { x: number; y: number; minWidth: number; minHeight: number };

// Reads what a ::before rule sets on the layer's shape. An inset is a reach
// past the padding box: `inset: -6px` reaches 6 px. Tailwind writes a
// spacing value as `calc(var(--spacing) * n)`, so the multiplier is
// resolved against the spacing token.
const readLayer = (declarations: Record<string, string>, spacing: number, current: Layer): Layer => {
	const px = (value: string) => {
		const multiplier = value.match(/calc\(var\(--spacing\) \* (-?[\d.]+)\)/);
		if (multiplier) return Number(multiplier[1]) * spacing;
		return Number(value.replace("px", ""));
	};
	const next = { ...current };
	if (declarations.inset) next.x = next.y = -px(declarations.inset);
	if (declarations["inset-inline"]) next.x = -px(declarations["inset-inline"]);
	if (declarations["inset-block"]) next.y = -px(declarations["inset-block"]);
	if (declarations["min-width"]) next.minWidth = px(declarations["min-width"]);
	if (declarations["min-height"]) next.minHeight = px(declarations["min-height"]);
	return next;
};

// The selector Tailwind writes for a class name, as a regular expression.
const selector = (name: string) => {
	const escaped = `.${name.replace(/[.:/]/g, "\\$&")}::before`;
	return new RegExp(`${escaped.replace(/[\\.:*+?^${}()|[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
};

describe("hitArea", () => {
	// happy-dom lays nothing out, so the probe reads the compiled rules and
	// sizes the layer the way a browser does. The layer is positioned against
	// the padding box, so the border sits between the drawn edge and the
	// layer's edge. The layer is the padding box plus its reach, and at least
	// its minimum size. The hit box is the larger of the drawn box and the
	// layer.
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
			const { width, height, borderX, borderY, coarseWidth = width } = geometry[key];
			let fine: Layer = { x: 0, y: 0, minWidth: 0, minHeight: 0 };
			let coarse: Layer = fine;
			for (const name of entry.split(" ")) {
				const match = css.match(selector(name));
				if (!match) continue;
				const declarations = parseCss(`a{${match[1]}}`)[0]!.declarations;
				const coarseOnly = name.startsWith("pointer-coarse:");
				if (coarseOnly) {
					coarse = readLayer(declarations, spacing, coarse);
				} else {
					fine = readLayer(declarations, spacing, fine);
					coarse = readLayer(declarations, spacing, coarse);
				}
			}
			const box = (layer: Layer, drawnWidth: number) => ({
				width: Math.max(drawnWidth, layer.minWidth, drawnWidth - borderX + 2 * layer.x),
				height: Math.max(height, layer.minHeight, height - borderY + 2 * layer.y),
			});
			const fineBox = box(fine, width);
			const coarseBox = box(coarse, coarseWidth);
			measured[key] = {
				fine: `${fineBox.width}x${fineBox.height}`,
				coarse: `${coarseBox.width}x${coarseBox.height}`,
			};
			expect(`${key} fine ${measured[key].fine}`).toMatch(/ (2[89]|[3-9]\d|\d{3,})x(2[89]|[3-9]\d|\d{3,})$/);
			expect(`${key} coarse ${measured[key].coarse}`).toMatch(/ (4[4-9]|[5-9]\d|\d{3,})x(4[4-9]|[5-9]\d|\d{3,})$/);
		}
		expect(css).toContain("@media (pointer: coarse)");
	});
});
