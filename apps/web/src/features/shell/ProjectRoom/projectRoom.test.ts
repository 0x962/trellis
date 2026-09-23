import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { projectOfPath, roomColorOf, ticketOfPath } from "./projectRoom";

const project = (key: string, color: ProjectSummary["color"]): ProjectSummary => ({
	id: key,
	key,
	slug: key.toLowerCase(),
	name: key,
	position: 0,
	openCount: 0,
	openEpicCount: 0,
	color,
	archivedAt: null,
});

const projects = [project("TRL", "blue"), project("HBR", "teal"), project("CNY", null)];

test("a project path names its project, and a view segment changes nothing", () => {
	expect(projectOfPath("/p/TRL", projects, null)?.key).toBe("TRL");
	expect(projectOfPath("/p/TRL/table", projects, null)?.key).toBe("TRL");
	expect(projectOfPath("/p/TRL/settings", projects, null)?.key).toBe("TRL");
	expect(projectOfPath("/p/TRL/epics/the-epic", projects, null)?.key).toBe("TRL");
});

test("the slug of a project names it as well as its key", () => {
	expect(projectOfPath("/p/trl", projects, null)?.key).toBe("TRL");
	expect(projectOfPath("/p/hbr/table", projects, null)?.key).toBe("HBR");
});

test("a ticket page stands in the room of the project of the ticket", () => {
	expect(ticketOfPath("/t/TRL-386")).toBe("TRL-386");
	expect(ticketOfPath("/p/TRL")).toBeNull();
	expect(roomColorOf("/t/HBR-12", projects, "HBR")).toBe("teal");
	expect(roomColorOf("/t/HBR-12", projects, null)).toBeNull();
});

test("a page of no project, and a project with no color, leave the pane plain", () => {
	expect(roomColorOf("/needs-you", projects, null)).toBeNull();
	expect(roomColorOf("/p/CNY", projects, null)).toBeNull();
	expect(roomColorOf("/p/NOPE", projects, null)).toBeNull();
	expect(roomColorOf("/p/TRL", projects, null)).toBe("blue");
});
