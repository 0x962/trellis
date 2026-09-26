import { describe, expect, test } from "bun:test";
import { InternalLinkSchema, internalLink, internalLinkTypes, parseInternalLink } from "./internalLink";

const id = "01M3D3SJM6ZCR31JSN793PR52J";

describe("internal links", () => {
	for (const type of internalLinkTypes) {
		test(`reads the ${type} record type`, () => {
			const link = internalLink(type, id);
			expect(link).toBe(`trellis://${type}/${id}`);
			expect(parseInternalLink(link)).toEqual({ type, id });
		});
	}

	test.each([
		"trellis://unknown/01M3D3SJM6ZCR31JSN793PR52J",
		"trellis://page/not-an-id",
		"trellis://page/01m3d3sjm6zcr31jsn793pr52j",
		"trellis://page/01M3D3SJM6ZCR31JSN793PR52J/extra",
		"trellis://page/01M3D3SJM6ZCR31JSN793PR52J?version=2",
		"trellis://person:secret@page/01M3D3SJM6ZCR31JSN793PR52J",
		"https://trellis/page/01M3D3SJM6ZCR31JSN793PR52J",
	])("refuses %s", (value) => {
		expect(parseInternalLink(value)).toBeNull();
		expect(InternalLinkSchema.safeParse(value).success).toBe(false);
	});
});
