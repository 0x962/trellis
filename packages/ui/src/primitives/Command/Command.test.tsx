import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Command } from "./Command";

test("flat and grouped command options share coarse-pointer target sizes", () => {
	const html = renderToStaticMarkup(
		<Command
			items={[{ id: "first", label: "First option" }]}
			groups={[{ heading: "Group", items: [{ id: "second", label: "Second option" }] }]}
			onSelect={() => {}}
		/>,
	);

	expect(html.match(/pointer-coarse:min-h-11/g)).toHaveLength(2);
	expect(html.match(/flex h-8 /g)).toHaveLength(2);
});
