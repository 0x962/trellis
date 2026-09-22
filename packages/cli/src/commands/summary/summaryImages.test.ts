import { expect, test } from "bun:test";
import { localImages, withImageUrls } from "./summaryImages.ts";

const markdown = `The Overview tab now opens with the explanation.

![the Overview tab after the change](shots/after.png)
![the same image again](shots/after.png)
![the after image](/api/evidence/01M33625ARYHT5J2T1YS5ADGPP/file)
![a web image](https://example.com/a.png)`;

test("lists each local image once, with its alt text", () => {
	expect(localImages(markdown)).toEqual([{ alt: "the Overview tab after the change", path: "shots/after.png" }]);
});

test("refuses a local image without alt text", () => {
	expect(() => localImages("![](shot.png)")).toThrow(
		"image shot.png has no alt text; write what it shows: ![...](shot.png)",
	);
});

test("points every reference to a local image at its uploaded file", () => {
	const urls = new Map([["shots/after.png", "/api/evidence/01M3362000000000000000000A/file"]]);
	expect(withImageUrls(markdown, urls)).toBe(`The Overview tab now opens with the explanation.

![the Overview tab after the change](/api/evidence/01M3362000000000000000000A/file)
![the same image again](/api/evidence/01M3362000000000000000000A/file)
![the after image](/api/evidence/01M33625ARYHT5J2T1YS5ADGPP/file)
![a web image](https://example.com/a.png)`);
});
