import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { TicketSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server tickets.get", () => {
	// WS-117. CDE-42 is the ticket the canvas ticket page shows.
	test("tickets.get returns the full canvas ticket and 404s an unknown identifier", async () => {
		const server = createFakeServer();
		const ticket = TicketSchema.parse(await server.client.tickets.get({ ticket: "cde-42" }));
		expect(ticket.identifier).toBe("CDE-42");
		expect(ticket.title).toBe("Restore the fork pages after the upstream 1.27 merge");
		expect(ticket.project.path).toBe("CDE.web");
		expect(ticket.status.slug).toBe("human-review");
		expect(ticket.status.reviewer).toBe("human");
		expect(ticket.priority).toBe("high");
		expect(ticket.parent?.identifier).toBe("CDE-43");
		expect(ticket.description).toContain("1.27");
		expect(ticket.children.map((child) => child.identifier)).toEqual(["CDE-48", "CDE-49", "CDE-50"]);
		expect(ticket.childCount).toBe(3);
		expect(ticket.childDoneCount).toBe(2);
		expect(ticket.commentCount).toBe(4);
		expect(ticket.attachments).toHaveLength(1);
		expect(ticket.attachmentCount).toBe(1);
		expect(ticket.prs).toHaveLength(1);
		const pr = ticket.prs[0]!;
		expect(pr.owner).toBe("canary-technologies-corp");
		expect(pr.repo).toBe("de");
		expect(pr.number).toBe(118);
		expect(pr.state).toBe("open");
		expect(pr.reviewState).toBe("approved");
		expect(pr.headRef).toBe("cde-42-restore-fork-pages");
		expect(pr.checks.map((check) => [check.name, check.bucket])).toEqual([
			["lint", "pass"],
			["typecheck (desktop)", "pass"],
			["test (host-service)", "pass"],
			["build (macos-arm64)", "pass"],
		]);
		expect(pr.ciState).toBe("pass");
		expect(ticket.pr).toEqual({ state: "open", ciState: "pass", pass: 4, fail: 0, pending: 0 });
		expect(ticket.lastActor).toMatchObject({ name: "claude-code", kind: "agent" });
		expect(ticket.version).toBeGreaterThanOrEqual(1);

		const failing = await server.client.tickets.get({ ticket: "CDE-44" });
		expect(failing.prs[0]!.checks.map((check) => check.bucket)).toEqual(["pass", "fail", "pass", "pending"]);
		expect(failing.prs[0]!.ciState).toBe("fail");

		const { error } = await safe(server.client.tickets.get({ ticket: "CDE-999" }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "NOT_FOUND") throw new Error("expected NOT_FOUND");
		expect(error.status).toBe(404);
		expect(error.data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});
});
