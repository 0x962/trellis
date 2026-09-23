import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { freeProjectColors, type ProjectColor, projectColors } from "../projectColors";
import { ProjectColorField } from "./ProjectColorField";

const field = (value: ProjectColor | null, taken: readonly ProjectColor[]) =>
	renderToStaticMarkup(<ProjectColorField value={value} taken={taken} onValueChange={() => {}} />);

// The names in the order the grid draws them.
const drawnOrder = (html: string) => [...html.matchAll(/data-project-color="([a-z]+)"/g)].map((match) => match[1]);

// The opening tag of the cell that carries `mark`.
const tagAt = (html: string, mark: string) => {
	const start = html.indexOf(mark);
	return html.slice(html.lastIndexOf("<span", start), html.indexOf(">", start) + 1);
};

const cellOf = (html: string, color: ProjectColor) => tagAt(html, `data-project-color="${color}"`);

test("a color that another project holds is not free, and the own color stays free", () => {
	const free = freeProjectColors(["blue", "teal"], "blue");

	expect(free).toContain("blue");
	expect(free).not.toContain("teal");
	// The free list keeps the order of the whole list, so a color never moves
	// under the cursor of the person who is picking one.
	expect(free).toEqual(projectColors.filter((color) => color !== "teal"));
	expect(freeProjectColors([], null)).toEqual([...projectColors]);
});

// Two projects never hold one color, so the 25 names are 25 slots.
test("the names run out after 25 projects", () => {
	expect(freeProjectColors(projectColors, null)).toEqual([]);
	expect(freeProjectColors(projectColors, "pine")).toEqual(["pine"]);
});

test("the grid draws all 25 names in palette order whatever the taken set is", () => {
	expect(drawnOrder(field("blue", ["blue"]))).toEqual([...projectColors]);
	expect(drawnOrder(field("blue", ["blue", "red", "teal", "rose"]))).toEqual([...projectColors]);
	expect(drawnOrder(field(null, projectColors))).toEqual([...projectColors]);
});

test("a color another project holds cannot be chosen", () => {
	const html = field("blue", ["blue", "teal"]);

	expect(cellOf(html, "teal")).toContain('aria-disabled="true"');
	expect(cellOf(html, "teal")).toContain("Teal, another project holds it");
	expect(cellOf(html, "blue")).not.toContain("aria-disabled");
	expect(cellOf(html, "red")).not.toContain("aria-disabled");
});

test("the color of the project is the one that reads as current", () => {
	const html = field("blue", ["blue", "teal"]);

	expect(cellOf(html, "blue")).toContain('aria-checked="true"');
	expect(cellOf(html, "red")).toContain('aria-checked="false"');
	expect(html).toContain('aria-label="Blue"');
});

test("no color stays reachable when every name is gone", () => {
	const html = field(null, projectColors);

	expect(html).toContain("Every color belongs to another project. Take one back there to give this project a color.");
	expect(html).toContain('aria-label="No color"');
	expect(tagAt(html, 'aria-label="No color"')).toContain('aria-checked="true"');
	expect(tagAt(html, 'aria-label="No color"')).not.toContain("aria-disabled");
});
