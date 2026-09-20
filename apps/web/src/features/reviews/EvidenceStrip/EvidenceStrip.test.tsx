import { describe, expect, test } from "bun:test";
import type { Evidence, EvidenceFloor } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceStrip } from "./EvidenceStrip";

const headSha = "8b21f0c3d9a4e7b15f2c86d0a3e94b7c1d05fa62";
const actor = { name: "crisp-fjord", kind: "agent" as const };

const record = (over: Partial<Evidence> & Pick<Evidence, "id" | "kind">): Evidence => ({
	pullRequestId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
	headSha,
	record: {},
	blob: null,
	actor,
	createdAt: "2026-09-18T01:58:00.000Z",
	...over,
});

const captureRecord = record({
	id: "01M30A00000000000000000CAP",
	kind: "capture",
	record: {
		headSha,
		baseSha: "4c9a771e28b0f6d3a95c17e4b82d0639fa5c1478",
		route: "/chat/:uuid",
		viewport: "1440×900",
		theme: "dark",
		seed: "trellis seed op27-stall",
		browser: "Chrome 141",
		capturedAt: "2026-09-18T01:58:00.000Z",
	},
});

const beforeRecord = record({
	id: "01M30A0000000000000000BEFR",
	kind: "before",
	blob: {
		sha256: "fa629876f8c3a7ec361c05ba2c6d8f600a5ac19f70ef8b3123c474efa9e5013d",
		url: "/api/evidence/01M30A0000000000000000BEFR/file",
		filename: "op27-send-pending.png",
		mime: "image/png",
		size: 154154,
	},
});

const clipRecord = record({
	id: "01M30A0000000000000000CLIP",
	kind: "clip",
	record: { route: "/chat/:uuid", caption: "The post stalls and the dialog releases." },
	blob: {
		sha256: "a218aac4f3fa3a1f6bc0b815ece1d9db78797b4acd84b872fc327a69f0a4567f",
		url: "/api/evidence/01M30A0000000000000000CLIP/file",
		filename: "op27-send-timeout.gif",
		mime: "image/gif",
		size: 55454,
	},
});

const consoleRecord = record({
	id: "01M30A0000000000000000CONS",
	kind: "console",
	blob: {
		sha256: "ee7278b0057fb46dd74472faea39ab33e6bb93bc18269b280f7c57ee1f1858eb",
		url: "/api/evidence/01M30A0000000000000000CONS/file",
		filename: "op27-console.txt",
		mime: "text/plain",
		size: 2048,
	},
});

const floor: EvidenceFloor = {
	kind: "frontend",
	required: ["summary", "after", "before", "capture", "console"],
	present: ["before", "capture", "console"],
	missing: [
		{ item: "summary", fillCommand: 'trellis summary write <pr> --headline "..." --why - --watch "..."' },
		{ item: "after", fillCommand: "trellis evidence add <pr> --kind after --file <path>" },
	],
};

describe("EvidenceStrip", () => {
	test("prints the capture line, the record line and the count", () => {
		const html = renderToStaticMarkup(
			<EvidenceStrip records={[captureRecord, beforeRecord, consoleRecord]} floor={floor} />,
		);

		expect(html).toContain("3 of 5 · captured on 8b21f0c");
		expect(html).toContain("/chat/:uuid · 1440×900 · dark · seed: trellis seed op27-stall");
		expect(html).toContain("head 8b21f0c · base 4c9a771 · Chrome 141 · 2026-09-18 01:58");
		expect(html).toContain("op27-console.txt · 2.0 KB");
	});

	test("names each owed record in words and carries the command that writes it", () => {
		const html = renderToStaticMarkup(<EvidenceStrip records={[captureRecord]} floor={floor} />);

		expect(html).toContain("summary");
		expect(html).toContain("after image");
		expect(html).toContain("trellis evidence add &lt;pr&gt; --kind after --file &lt;path&gt;");
	});

	test("draws the before image in the page and holds the clip bytes back", () => {
		const html = renderToStaticMarkup(
			<EvidenceStrip records={[captureRecord, beforeRecord, clipRecord]} floor={floor} />,
		);

		expect(html).toContain('<img src="/api/evidence/01M30A0000000000000000BEFR/file"');
		expect(html).toContain("Play op27-send-timeout.gif");
		expect(html).toContain("The post stalls and the dialog releases.");
		expect(html).not.toContain("/api/evidence/01M30A0000000000000000CLIP/file");
	});

	test("drops a field the capture record does not hold", () => {
		const thin = record({
			id: "01M30A00000000000000000CAP",
			kind: "capture",
			record: { headSha, route: "/chat/:uuid", browser: "Chrome 141" },
		});
		const html = renderToStaticMarkup(<EvidenceStrip records={[thin]} floor={floor} />);

		expect(html).toContain("/chat/:uuid");
		expect(html).toContain("head 8b21f0c · Chrome 141");
		expect(html).not.toContain(" ·  · ");
		expect(html).not.toContain("· base");
	});

	test("prints one sentence when the pull request carries no record", () => {
		const html = renderToStaticMarkup(
			<EvidenceStrip records={[]} floor={{ ...floor, required: [], present: [], missing: [] }} />,
		);

		expect(html).toContain("This pull request owes no evidence.");
	});

	test("prints placeholders while the request is not complete", () => {
		const html = renderToStaticMarkup(<EvidenceStrip records={[]} floor={floor} loading={true} />);

		expect(html).toContain('aria-busy="true"');
		expect(html).not.toContain("after image");
	});
});

const verifyRecord = record({
	id: "01M30A0000000000000000VRFY",
	kind: "verify",
	record: { command: "cd backend/canary && direnv exec . pytest canary/api", exit: 0, tail: "47 passed in 9.10s" },
});

const pictureBlob = {
	sha256: "b0d3f4a1c25e7890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890",
	url: "/api/evidence/01M30A00000000000000000PIC/file",
	filename: "op43-route-sequence.png",
	mime: "image/png",
	size: 41000,
};

const pictureRecord = record({
	id: "01M30A00000000000000000PIC",
	kind: "picture",
	record: { why: "The call path crosses from Operator into Canary." },
	blob: pictureBlob,
});

const backendFloor: EvidenceFloor = {
	kind: "backend",
	required: ["summary", "verify", "test", "contract", "picture"],
	present: ["verify", "picture"],
	missing: [
		{ item: "summary", fillCommand: 'trellis summary write 57080 --headline "..."' },
		{
			item: "test",
			fillCommand: "trellis evidence add 57080 --kind test --name <test> --fails-on <base> --passes-on <head>",
		},
	],
};

describe("EvidenceStrip of a backend pull request", () => {
	test("prints the verify record, the picture and the command that fills each gap", () => {
		const html = renderToStaticMarkup(<EvidenceStrip records={[verifyRecord, pictureRecord]} floor={backendFloor} />);

		expect(html).toContain("2 of 5");
		expect(html).toContain("pytest canary/api");
		expect(html).toContain("exit 0");
		expect(html).toContain("47 passed in 9.10s");
		expect(html).toContain('<img src="/api/evidence/01M30A00000000000000000PIC/file"');
		expect(html).toContain("test proof");
		expect(html).toContain("--kind test --name &lt;test&gt;");
	});

	test("draws the capture line of a frontend record on a backend pull request never", () => {
		const html = renderToStaticMarkup(
			<EvidenceStrip records={[verifyRecord, captureRecord, beforeRecord]} floor={backendFloor} />,
		);

		expect(html).not.toContain("/chat/:uuid");
		expect(html).not.toContain("/api/evidence/01M30A0000000000000000BEFR/file");
	});

	test("draws one picture and never a second one", () => {
		const second = record({
			id: "01M30A0000000000000000PIC2",
			kind: "picture",
			record: { why: "A second picture." },
			blob: { ...pictureBlob, url: "/api/evidence/01M30A0000000000000000PIC2/file" },
		});
		const html = renderToStaticMarkup(<EvidenceStrip records={[pictureRecord, second]} floor={backendFloor} />);

		expect(html).toContain("/api/evidence/01M30A00000000000000000PIC/file");
		expect(html).not.toContain("/api/evidence/01M30A0000000000000000PIC2/file");
		expect(html).not.toContain("A second picture.");
	});

	test("draws both sets of records for a pull request of both kinds", () => {
		const html = renderToStaticMarkup(
			<EvidenceStrip records={[captureRecord, verifyRecord]} floor={{ ...backendFloor, kind: "mixed" }} />,
		);

		expect(html).toContain("/chat/:uuid");
		expect(html).toContain("pytest canary/api");
	});
});
