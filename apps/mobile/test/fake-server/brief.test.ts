import { describe, expect, test } from "bun:test";
import { BriefSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server brief", () => {
	// WS-128
	test("brief.get returns markdown for the ticket", async () => {
		const server = createFakeServer();
		const response = await server.app.request("/api/tickets/CDE-42/brief");
		expect(response.status).toBe(200);
		const brief = BriefSchema.parse(await response.json());
		expect(brief.markdown).toContain("CDE-42");
		expect(brief.markdown).toContain("Restore the fork pages after the upstream 1.27 merge");
		expect(brief.markdown.startsWith("# CDE-42")).toBe(true);
		expect(Number.isNaN(Date.parse(brief.generatedAt))).toBe(false);
		expect(await server.client.brief.get({ ticket: "cde-42" })).toMatchObject({ markdown: brief.markdown });
	});
});
