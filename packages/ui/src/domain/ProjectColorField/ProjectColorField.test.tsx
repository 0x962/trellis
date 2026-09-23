import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { freeProjectColors, projectColors } from "../projectColors";
import { ProjectColorField } from "./ProjectColorField";

test("a color that another project holds is not free, and the own color stays free", () => {
	expect(freeProjectColors(["blue", "teal"], null)).toEqual(["orange", "pink", "azure"]);
	expect(freeProjectColors(["blue", "teal"], "blue")).toEqual(["orange", "blue", "pink", "azure"]);
	expect(freeProjectColors([], null)).toEqual([...projectColors]);
});

// A closed Select draws the chosen item and no list, so the test reads the
// trigger.
test("the field shows the color of the project on its trigger", () => {
	const html = renderToStaticMarkup(
		<ProjectColorField value="blue" taken={["blue", "orange"]} onValueChange={() => {}} />,
	);

	expect(html).toContain('data-project-color="blue"');
	expect(html).toContain(">Blue<");
	expect(html).toContain("The color fills the mark of the project");
	expect(html).not.toContain('aria-disabled="true"');
});

test("the field says the slots are gone and takes no pick", () => {
	const html = renderToStaticMarkup(<ProjectColorField value={null} taken={projectColors} onValueChange={() => {}} />);

	expect(html).toContain("Every color belongs to another project. Take one back there to give this project a color.");
	expect(html).toContain('aria-disabled="true"');
	expect(html).toContain(">No color<");
});
