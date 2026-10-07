import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTitle } from "./PageTitle";
import { TitleMenuButton } from "./TitleMenuButton";

describe("PageTitle", () => {
	test("lets the parent and heading share a narrow top bar", () => {
		const html = renderToStaticMarkup(
			<PageTitle
				parent="A project name that needs part of the available width"
				title="A page heading that needs the rest"
			/>,
		);

		expect(html).toContain("min-w-0 truncate text-lg text-fg-muted");
		expect(html).toContain("min-w-0 text-lg font-semibold text-fg truncate");
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
