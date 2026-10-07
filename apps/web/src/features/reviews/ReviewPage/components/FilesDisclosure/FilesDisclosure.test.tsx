import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesDisclosure } from "./FilesDisclosure";

const render = (phone: boolean, open: boolean) =>
	renderToStaticMarkup(
		<FilesDisclosure phone={phone} open={open} onOpenChange={() => {}} count={2}>
			<p>Selected code</p>
		</FilesDisclosure>,
	);

test("the phone disclosure follows the selected finding state", () => {
	expect(render(true, false)).toContain('hidden=""');
	const html = render(true, true);
	expect(html).toContain('aria-expanded="true"');
	expect(html).not.toContain('hidden=""');
	expect(html).toContain("Selected code");
});

test("the closed phone disclosure retains its code", () => {
	expect(render(true, false)).toContain("Selected code");
});

test("desktop code remains visible regardless of the phone disclosure", () => {
	for (const open of [false, true]) {
		expect(render(false, open)).not.toContain('hidden=""');
		expect(render(false, open)).not.toContain("aria-expanded");
	}
});
