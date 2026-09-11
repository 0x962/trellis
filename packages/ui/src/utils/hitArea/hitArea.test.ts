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

// The entries whose control draws its own 44 px box on a coarse pointer.
// A drawn box beats an invisible layer, which a neighbour that paints later
// covers, so every control that sits in a row of controls is on this list.
const drawsCoarseBox: HitAreaKey[] = ["box24Bordered", "box28Bordered", "box32Bordered"];

// The layer's shape: how far it reaches past the padding box on each axis,
// and the smallest size it keeps on each axis, in px. A centered layer with
// a minimum size covers a control narrower than that size.
type Layer = { x: number; y: number; minWidth: number; minHeight: number };

// The border box the control paints, in px.
type Drawn = { width: number; height: number };

// Tailwind writes a spacing value as `calc(var(--spacing) * n)`, so the
// multiplier resolves against the spacing token.
const pxOf = (value: string, spacing: number) => {
	const multiplier = value.match(/calc\(var\(--spacing\) \* (-?[\d.]+)\)/);
	if (multiplier) return Number(multiplier[1]) * spacing;
	return Number(value.replace("px", ""));
};

// Reads what a ::before rule sets on the layer's shape. An inset is a reach
// past the padding box: `inset: -6px` reaches 6 px.
const readLayer = (declarations: Record<string, string>, spacing: number, current: Layer): Layer => {
	const px = (value: string) => pxOf(value, spacing);
	const next = { ...current };
	if (declarations.inset) next.x = next.y = -px(declarations.inset);
	if (declarations["inset-inline"]) next.x = -px(declarations["inset-inline"]);
	if (declarations["inset-block"]) next.y = -px(declarations["inset-block"]);
	if (declarations["min-width"]) next.minWidth = px(declarations["min-width"]);
	if (declarations["min-height"]) next.minHeight = px(declarations["min-height"]);
	return next;
};

// Reads what a rule on the element itself sets on the drawn box. `height`
// replaces the box; `min-width` raises it. Box sizing is border-box, so
// each value is the border box.
const readDrawn = (declarations: Record<string, string>, spacing: number, current: Drawn): Drawn => {
	const px = (value: string) => pxOf(value, spacing);
	const next = { ...current };
	if (declarations.width) next.width = px(declarations.width);
	if (declarations.height) next.height = px(declarations.height);
	if (declarations["min-width"]) next.width = Math.max(next.width, px(declarations["min-width"]));
	if (declarations["min-height"]) next.height = Math.max(next.height, px(declarations["min-height"]));
	return next;
};

// The selector Tailwind writes for a class name, as a regular expression.
// `pseudo` picks the layer rule or the element's own rule.
const selector = (name: string, pseudo: "::before" | "") => {
	const escaped = `.${name.replace(/[.:/]/g, "\\$&")}${pseudo}`;
	return new RegExp(`${escaped.replace(/[\\.:*+?^${}()|[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
};

// Every rule an entry writes, split by the pointer it applies to and by
// whether it shapes the layer or the drawn box.
const measure = (entry: string, css: string, spacing: number, drawn: Drawn, coarseDrawn: Drawn) => {
	let fine: Layer = { x: 0, y: 0, minWidth: 0, minHeight: 0 };
	let coarse: Layer = fine;
	let fineBox = drawn;
	let coarseBox = coarseDrawn;
	for (const name of entry.split(" ")) {
		const coarseOnly = name.startsWith("pointer-coarse:");
		const layerRule = css.match(selector(name, "::before"));
		if (layerRule) {
			const declarations = parseCss(`a{${layerRule[1]}}`)[0]!.declarations;
			if (!coarseOnly) fine = readLayer(declarations, spacing, fine);
			coarse = readLayer(declarations, spacing, coarse);
			continue;
		}
		const ownRule = css.match(selector(name, ""));
		if (!ownRule) continue;
		const declarations = parseCss(`a{${ownRule[1]}}`)[0]!.declarations;
		if (!coarseOnly) fineBox = readDrawn(declarations, spacing, fineBox);
		coarseBox = readDrawn(declarations, spacing, coarseBox);
	}
	return { fine, coarse, fineBox, coarseBox };
};

// The tokens compiled with the utilities the entries name.
const compileEntries = async () => {
	const source = await readSource("tokens.css");
	const theme = Object.assign(
		{},
		...blocks(parseCss(source))
			.filter((piece) => piece.prelude.startsWith("@theme"))
			.map((piece) => piece.declarations),
	) as Record<string, string>;
	const spacing = Number(theme["--spacing"]!.replace("px", ""));
	const compiler = await compile(`@tailwind utilities;\n${source}`, {
		base: join(packageRoot, "src"),
		loadStylesheet: async (id, base) => {
			const path = id.startsWith(".") ? join(base, id) : fileURLToPath(import.meta.resolve(id));
			return { path, base: join(path, ".."), content: await Bun.file(path).text() };
		},
	});
	const classes = Object.values(hitArea).flatMap((entry) => entry.split(" "));
	return { spacing, css: compiler.build(classes) };
};

describe("hitArea", () => {
	// happy-dom lays nothing out, so the probe reads the compiled rules and
	// sizes the layer the way a browser does. The layer is positioned against
	// the padding box, so the border sits between the drawn edge and the
	// layer's edge. The layer is the padding box plus its reach, and at least
	// its minimum size. The hit box is the larger of the drawn box and the
	// layer.
	test("every entry reaches 28 px on a fine pointer and 44 px on a coarse pointer in both axes", async () => {
		const { spacing, css } = await compileEntries();
		expect(spacing).toBe(4);
		const measured: Record<string, { fine: string; coarse: string }> = {};
		for (const [key, entry] of Object.entries(hitArea) as [HitAreaKey, string][]) {
			const { width, height, borderX, borderY, coarseWidth = width } = geometry[key];
			const { fine, coarse, fineBox, coarseBox } = measure(
				entry,
				css,
				spacing,
				{ width, height },
				{ width: coarseWidth, height },
			);
			const box = (layer: Layer, control: Drawn) => ({
				width: Math.max(control.width, layer.minWidth, control.width - borderX + 2 * layer.x),
				height: Math.max(control.height, layer.minHeight, control.height - borderY + 2 * layer.y),
			});
			const fineHit = box(fine, fineBox);
			const coarseHit = box(coarse, coarseBox);
			measured[key] = {
				fine: `${fineHit.width}x${fineHit.height}`,
				coarse: `${coarseHit.width}x${coarseHit.height}`,
			};
			expect(`${key} fine ${measured[key].fine}`).toMatch(/ (2[89]|[3-9]\d|\d{3,})x(2[89]|[3-9]\d|\d{3,})$/);
			expect(`${key} coarse ${measured[key].coarse}`).toMatch(/ (4[4-9]|[5-9]\d|\d{3,})x(4[4-9]|[5-9]\d|\d{3,})$/);
		}
		expect(css).toContain("@media (pointer: coarse)");
	});

	// A layer that reaches past the drawn box covers the neighbour beside it,
	// and the neighbour then loses its own hit test at that point. An entry
	// that draws a 44 px box on a coarse pointer therefore keeps its layer
	// inside that box.
	test("an entry that draws its coarse box keeps the layer inside it", async () => {
		const { spacing, css } = await compileEntries();
		for (const key of drawsCoarseBox) {
			const entry = hitArea[key];
			const { width, height, coarseWidth = width } = geometry[key];
			const { coarse, coarseBox } = measure(entry, css, spacing, { width, height }, { width: coarseWidth, height });
			expect(`${key} coarse box ${coarseBox.width}x${coarseBox.height}`).toBe(`${key} coarse box 44x44`);
			expect(`${key} coarse layer reach ${coarse.x}x${coarse.y}`).toBe(`${key} coarse layer reach 0x0`);
		}
	});
});
