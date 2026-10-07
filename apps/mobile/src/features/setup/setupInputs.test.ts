import { describe, expect, test } from "bun:test";
import { parsePairLink } from "@trellis/api";
import { validateActorName, validateServerUrl } from "../../lib/server";

describe("setup inputs", () => {
	test("normalizes a valid server URL", () => {
		expect(validateServerUrl("  http://192.168.1.20:4521/  ")).toEqual({
			ok: true,
			url: "http://192.168.1.20:4521",
		});
	});

	test("explains an invalid server URL", () => {
		expect(validateServerUrl("192.168.1.20:4521")).toEqual({
			ok: false,
			error: "Start the URL with http:// or https://, for example http://192.168.1.20:4521.",
		});
		expect(validateServerUrl("http://bad host")).toEqual({
			ok: false,
			error: "Write the URL as http://<host>:<port>.",
		});
	});

	test("normalizes a valid person name", () => {
		expect(validateActorName("  Dana  ")).toEqual({ ok: true, name: "Dana" });
	});

	test("rejects names that the actor header cannot carry", () => {
		const error = "Use letters, numbers, spaces, or punctuation. Do not use a colon.";
		expect(validateActorName("")).toEqual({ ok: false, error });
		expect(validateActorName("Dana:agent")).toEqual({ ok: false, error });
		expect(validateActorName("Dána")).toEqual({ ok: false, error });
	});

	test("reads a server URL from a Trellis pair link", () => {
		expect(parsePairLink("trellis://pair?url=http%3A%2F%2F192.168.1.20%3A4521")).toBe("http://192.168.1.20:4521");
	});

	test("rejects text that is not a Trellis pair link", () => {
		expect(parsePairLink("http://192.168.1.20:4521")).toBeNull();
	});
});
