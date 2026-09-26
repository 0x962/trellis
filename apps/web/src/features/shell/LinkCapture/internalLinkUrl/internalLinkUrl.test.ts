import { expect, test } from "bun:test";
import { internalLinkUrl } from "./internalLinkUrl";

const id = "01M3D3SJM6ZCR31JSN793PR52J";

test("takes a valid internal link without a new-tab target", () => {
	expect(internalLinkUrl({ href: `trellis://page/${id}`, target: "" })).toBe(`trellis://page/${id}`);
});

test.each([null, { href: `trellis://other/${id}`, target: "" }, { href: "trellis://page/no", target: "" }])(
	"refuses an invalid internal link",
	(link) => {
		expect(internalLinkUrl(link)).toBeNull();
	},
);
