import { expect, test } from "bun:test";
import { stripPhosphorWeights } from "./vite.config";

const definition = `
  [
    "regular",
    "regular path",
  ],
  [
    "bold",
    "bold path",
  ],
  [
    "fill",
    "fill path",
  ],
`;

test("keeps the bold caret down weight for the production breadcrumb icon", () => {
	const transformed = stripPhosphorWeights(definition, "/node_modules/@phosphor-icons/react/dist/defs/CaretDown.es.js");

	expect(transformed).toContain('"regular"');
	expect(transformed).toContain('"bold"');
	expect(transformed).not.toContain('"fill"');
});

test("drops unused weights from icons without a special weight", () => {
	const transformed = stripPhosphorWeights(
		definition,
		"/node_modules/@phosphor-icons/react/dist/defs/CaretRight.es.js",
	);

	expect(transformed).toContain('"regular"');
	expect(transformed).not.toContain('"bold"');
	expect(transformed).not.toContain('"fill"');
});

test("keeps each requested fill weight", () => {
	for (const icon of ["ChatCircle", "ClockCounterClockwise", "PushPin", "WarningCircle"]) {
		const transformed = stripPhosphorWeights(definition, `/node_modules/@phosphor-icons/react/dist/defs/${icon}.es.js`);

		expect(transformed).toContain('"fill"');
	}
});

test("keeps the bold weight of the document drag handle", () => {
	const transformed = stripPhosphorWeights(
		definition,
		"/node_modules/@phosphor-icons/react/dist/defs/DotsSixVertical.es.js",
	);

	expect(transformed).toContain('"bold"');
});
