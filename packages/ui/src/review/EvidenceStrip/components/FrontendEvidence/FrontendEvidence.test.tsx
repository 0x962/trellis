import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FrontendEvidence } from "./FrontendEvidence";

const capture = {
	route: "/chat/:uuid",
	viewport: "1440×900",
	theme: "dark",
	seed: "trellis seed op27-stall",
	browser: "Chrome 141",
	headSha: "8b21f0c",
	baseSha: "4c9a771",
	capturedAt: "2026-09-18 01:58",
};

const before = {
	url: "/api/evidence/01M30A0000000000000000BEFR/file",
	caption: "The dialog holds both buttons greyed while the post stalls.",
};

const after = {
	url: "/api/evidence/01M30A00000000000000000AFT/file",
	caption: "A post that gives up prints its words and the dialog closes.",
};

const clip = {
	url: "/api/evidence/01M30A0000000000000000CLIP/file",
	filename: "op27-send-timeout.gif",
	caption: "The post stalls, the dialog releases, and the thread decides the mode.",
	mime: "image/gif",
};

const full = (
	<FrontendEvidence capture={capture} before={before} after={after} clip={clip} consoleLine="op27-console.txt · 2 KB" />
);

test("prints the capture line, the console line and the record line", () => {
	const html = renderToStaticMarkup(full);

	expect(html).toContain("/chat/:uuid · 1440×900 · dark · seed: trellis seed op27-stall");
	expect(html).toContain("op27-console.txt · 2 KB");
	expect(html).toContain("head 8b21f0c · base 4c9a771 · Chrome 141 · 2026-09-18 01:58");
});

test("draws each image in the page and never as a link", () => {
	const html = renderToStaticMarkup(full);

	expect(html).toContain(`<img src="${before.url}"`);
	expect(html).toContain(`<img src="${after.url}"`);
	expect(html).toContain("The dialog holds both buttons greyed while the post stalls.");
	expect(html).toContain("A post that gives up prints its words and the dialog closes.");
	expect(html).not.toContain("<a ");
});

test("holds the clip bytes back until the reader asks for them", () => {
	const html = renderToStaticMarkup(full);

	expect(html).toContain("Play op27-send-timeout.gif");
	expect(html).toContain("The post stalls, the dialog releases, and the thread decides the mode.");
	expect(html).not.toContain(clip.url);
	expect(html).not.toContain("<video");
	expect(html).not.toContain("autoplay");
});

test("names the image an agent did not add", () => {
	const html = renderToStaticMarkup(
		<FrontendEvidence capture={capture} before={before} after={null} clip={null} consoleLine={null} />,
	);

	expect(html).toContain("The agent added no after image.");
	expect(html).not.toContain("op27-console.txt");
});

test("prints no image row and no record row when the pull request carries no record", () => {
	const html = renderToStaticMarkup(
		<FrontendEvidence capture={null} before={null} after={null} clip={null} consoleLine={null} />,
	);

	expect(html).not.toContain("<img");
	expect(html).not.toContain("record");
	expect(html).not.toContain("before");
});
