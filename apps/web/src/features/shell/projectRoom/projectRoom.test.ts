import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { roomColorOfPath } from "./projectRoom";

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

test("a project path takes the color of its project, and a view segment changes nothing", () => {
	expect(roomColorOfPath("/p/TRL", projects, null)).toBe("blue");
	expect(roomColorOfPath("/p/TRL/table", projects, null)).toBe("blue");
	expect(roomColorOfPath("/p/TRL/settings", projects, null)).toBe("blue");
	expect(roomColorOfPath("/p/TRL/epics/the-epic", projects, null)).toBe("blue");
});

test("the slug of a project names it as well as its key", () => {
	expect(roomColorOfPath("/p/trl", projects, null)).toBe("blue");
	expect(roomColorOfPath("/p/hbr/table", projects, null)).toBe("teal");
});

// `projectRefOfPathname` holds the rule, so the sessions page of a project
// stands in the room of that project, and a path with too many segments names
// no project.
test("the room follows the one rule that reads a project out of a path", () => {
	expect(roomColorOfPath("/sessions/project/HBR", projects, null)).toBe("teal");
	expect(roomColorOfPath("/p/TRL/web/auth", projects, null)).toBeNull();
});

test("a ticket page takes the color of the project of the ticket", () => {
	expect(roomColorOfPath("/t/HBR-12", projects, "HBR")).toBe("teal");
	expect(roomColorOfPath("/t/HBR-12", projects, null)).toBeNull();
});

test("a page of no project, and a project with no color, leave the pane plain", () => {
	expect(roomColorOfPath("/needs-you", projects, null)).toBeNull();
	expect(roomColorOfPath("/p/CNY", projects, null)).toBeNull();
	expect(roomColorOfPath("/p/NOPE", projects, null)).toBeNull();
	expect(roomColorOfPath("/p/TRL", projects, null)).toBe("blue");
});
