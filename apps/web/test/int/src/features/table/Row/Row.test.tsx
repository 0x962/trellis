import { describe, expect, test } from "bun:test";
import { rowHeights } from "../../../../../../src/features/table/Row/Row";
import { mountRow, summary } from "../../../../../row";

const longTitle =
	"A much longer title that would wrap onto a second line if the cell let it, which it never does in the table";

describe("features/table/Row", () => {
	// Outcome 17
	test("renders a comfortable row at a fixed 36 px height", () => {
		const { row } = mountRow(summary());
		expect(row().style.height).toBe("36px");
		expect(rowHeights.comfortable).toBe(36);
	});

	// Outcome 18
	test("renders a compact row at a fixed 32 px height", () => {
		const { row } = mountRow(summary(), "compact");
		expect(row().style.height).toBe("32px");
		expect(rowHeights.compact).toBe(32);
	});

	// Outcome 19. A title never wraps, so the rows below never move.
	test("keeps the fixed height and truncates a long title", () => {
		const { row, cell } = mountRow(summary({ title: longTitle }));
		expect(row().style.height).toBe("36px");
		const title = cell("title");
		expect(title.textContent).toContain("A much longer title");
		const truncated = [title, ...title.querySelectorAll("*")].some((element) =>
			/\btruncate\b|\bwhitespace-nowrap\b/.test(element.className),
		);
		expect(truncated).toBe(true);
	});
});
