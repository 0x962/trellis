import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTitle } from "./PageTitle";
import { TitleMenuButton } from "./TitleMenuButton";

describe("PageTitle", () => {
	test("keeps the parent focus edge visible and reserves the remaining phone width for the current title", () => {
		const html = renderToStaticMarkup(
			<PageTitle
				parent={<a href="/project">A project name that needs part of the available width</a>}
				title="A page heading that needs the rest"
			/>,
		);

		expect(html).toContain("max-w-1/2 min-w-0 text-lg text-fg-muted *:max-w-full");
		expect(html).toContain("max-md:w-11 max-md:shrink-0");
		expect(html).toContain("min-w-0 flex-1 text-lg font-semibold text-fg");
		expect(html).toContain("truncate");
		expect(html).toContain("A project name that needs part of the available width");
		expect(html).toContain("A page heading that needs the rest");
	});

	test("keeps a title menu accessible and at least 44 pixels square on a phone or coarse pointer", () => {
		const html = renderToStaticMarkup(<TitleMenuButton label="A long epic name" />);

		expect(html).toContain("max-md:h-11 max-md:min-w-11");
		expect(html).toContain("pointer-coarse:h-11 pointer-coarse:min-w-11");
		expect(html).toContain(">A long epic name</span>");
	});
});
