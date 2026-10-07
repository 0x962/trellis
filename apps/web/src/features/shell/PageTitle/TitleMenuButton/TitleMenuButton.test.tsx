import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleMenuButton } from "./TitleMenuButton";

describe("TitleMenuButton", () => {
	test("truncates the default label and keeps the standard height", () => {
		const html = renderToStaticMarkup(<TitleMenuButton label="A long project section name" />);
		expect(html).toContain("h-7 max-md:h-11 pointer-coarse:h-11");
		expect(html).toContain('class="min-w-0 truncate"');
		expect(html).not.toContain("overflow-wrap:anywhere");
	});

	test("wraps the label and lets the button grow above its minimum height", () => {
		const html = renderToStaticMarkup(<TitleMenuButton label="A long epic name that needs more than one line" wrap />);
		expect(html).toContain("h-auto min-h-11 justify-start");
		expect(html).toContain("break-words whitespace-normal [overflow-wrap:anywhere]");
		expect(html).not.toContain('class="min-w-0 truncate"');
	});
});
