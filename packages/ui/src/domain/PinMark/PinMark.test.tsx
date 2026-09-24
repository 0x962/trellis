import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PinMark } from "./PinMark";

test("the pin mark has a visible shape and an accessible state", () => {
	const html = renderToStaticMarkup(<PinMark tooltip={false} />);
	expect(html).toContain('data-pin-mark=""');
	expect(html).toContain('aria-label="Pinned"');
	expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
	expect(html).toContain('<path d="');
});
