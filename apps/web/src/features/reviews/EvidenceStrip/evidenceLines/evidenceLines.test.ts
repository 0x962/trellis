import { describe, expect, test } from "bun:test";
import type { Evidence, EvidenceFloor } from "@trellis/api";
import { evidenceLines } from "./evidenceLines";

const headSha = "8b21f0c3d9a4e7b15f2c86d0a3e94b7c1d05fa62";

const record = (over: Partial<Evidence> & Pick<Evidence, "id" | "kind">): Evidence => ({
	pullRequestId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
	headSha,
	record: {},
	blob: null,
	actor: { name: "crisp-fjord", kind: "agent" },
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
		viewport: "1440x900",
		theme: "dark",
		seed: "trellis seed op27-stall",
		browser: "Chrome 141",
		capturedAt: "2026-09-18T01:58:00.000Z",
	},
});

const beforeRecord = record({
	id: "01M30A0000000000000000BEFR",
	kind: "before",
	record: { caption: "The dialog holds both buttons greyed." },
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
		{ item: "summary", fillCommand: 'trellis summary write <pr> --headline "..."' },
		{ item: "after", fillCommand: "trellis evidence add <pr> --kind after --file <path>" },
	],
};

describe("evidenceLines", () => {
	test("shortens both SHAs and cuts the capture time to the minute", () => {
		const lines = evidenceLines([captureRecord], floor);

		expect(lines.capture).toEqual({
			route: "/chat/:uuid",
			viewport: "1440x900",
			theme: "dark",
			seed: "trellis seed op27-stall",
			browser: "Chrome 141",
			headSha: "8b21f0c",
			baseSha: "4c9a771",
			capturedAt: "2026-09-18 01:58",
		});
		expect(lines.strip.note).toBe("captured on 8b21f0c");
	});

	test("reads a field the record does not hold as nothing", () => {
		const thin = record({ id: "01M30A00000000000000000CAP", kind: "capture", record: { route: "/chat/:uuid" } });
		const lines = evidenceLines([thin], floor);

		expect(lines.capture).toEqual({
			route: "/chat/:uuid",
			viewport: null,
			theme: null,
			seed: null,
			browser: null,
			headSha: "8b21f0c",
			baseSha: null,
			capturedAt: null,
		});
	});

	test("takes the head SHA of the row when the record names none", () => {
		const bare = record({ id: "01M30A00000000000000000CAP", kind: "capture" });

		expect(evidenceLines([bare], floor).capture?.headSha).toBe("8b21f0c");
	});

	test("names each owed record in the words the whole app uses", () => {
		const lines = evidenceLines([captureRecord], floor);

		expect(lines.strip.missing).toEqual([
			{ label: "summary", fillCommand: 'trellis summary write <pr> --headline "..."' },
			{ label: "after image", fillCommand: "trellis evidence add <pr> --kind after --file <path>" },
		]);
		expect(lines.strip.present).toBe(3);
		expect(lines.strip.required).toBe(5);
	});

	test("reads the screenshot, the clip and the console log out of their records", () => {
		const lines = evidenceLines([beforeRecord, clipRecord, consoleRecord], floor);

		expect(lines.before).toEqual({
			url: "/api/evidence/01M30A0000000000000000BEFR/file",
			caption: "The dialog holds both buttons greyed.",
		});
		expect(lines.after).toBeNull();
		expect(lines.clip).toEqual({
			url: "/api/evidence/01M30A0000000000000000CLIP/file",
			filename: "op27-send-timeout.gif",
			caption: "The post stalls and the dialog releases.",
			mime: "image/gif",
		});
		expect(lines.consoleLine).toBe("op27-console.txt · 2.0 KB");
	});

	test("reads a record that carries no file as nothing", () => {
		const fileless = record({ id: "01M30A0000000000000000BEFR", kind: "before" });
		const lines = evidenceLines([fileless], floor);

		expect(lines.before).toBeNull();
		expect(lines.strip.hasRecords).toBe(true);
	});

	test("reports a pull request that carries no record", () => {
		const lines = evidenceLines([], floor);

		expect(lines.strip.hasRecords).toBe(false);
		expect(lines.strip.note).toBeUndefined();
		expect(lines.capture).toBeNull();
	});
});
