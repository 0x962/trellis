import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useSlashMenuStore } from "./SlashMenu";
import { SlashMenuList } from "./SlashMenuList";

test("renders the slash menu with shared command options", () => {
	useSlashMenuStore.setState({
		open: true,
		items: [
			{ id: "text", label: "Text", hint: "", run: () => {} },
			{ id: "h1", label: "Heading 1", hint: "#", run: () => {} },
		],
		highlighted: 1,
		left: 20,
		top: 40,
		pick: () => {},
	});

	const html = renderToStaticMarkup(<SlashMenuList />);
	expect(html.match(/role="option"/g)).toHaveLength(2);
	expect(html).toContain("Heading 1");
	expect(html).toContain("#");
	expect(html).not.toContain("<button");
});
