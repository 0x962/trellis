import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { projectOfPath, roomColorOf, ticketOfPath } from "./projectRoom";

const project = (path: string, color: ProjectSummary["color"]): ProjectSummary => ({
	id: path,
	key: path.split(".")[0]!,
	path,
	parentId: null,
	rootId: path,
	slug: path.split(".").at(-1)!,
	name: path,
	depth: 0,
	position: 0,
	openCount: 0,
	openEpicCount: 0,
	color,
	archivedAt: null,
});

const projects = [project("TRL", "blue"), project("TRL.web", "teal"), project("CNY", null)];

test("a project path names its project, and a view segment changes nothing", () => {
	expect(projectOfPath("/p/TRL", projects, null)?.path).toBe("TRL");
	expect(projectOfPath("/p/TRL/table", projects, null)?.path).toBe("TRL");
	expect(projectOfPath("/p/TRL/settings", projects, null)?.path).toBe("TRL");
	expect(projectOfPath("/p/TRL/epics/the-epic", projects, null)?.path).toBe("TRL");
});

test("a sub-project path names the sub-project, not its root", () => {
	expect(projectOfPath("/p/TRL/web", projects, null)?.path).toBe("TRL.web");
	expect(projectOfPath("/p/trl/web/table", projects, null)?.path).toBe("TRL.web");
});

test("a ticket page stands in the room of the project of the ticket", () => {
	expect(ticketOfPath("/t/TRL-386")).toBe("TRL-386");
	expect(ticketOfPath("/p/TRL")).toBeNull();
	expect(roomColorOf("/t/TRL-386", projects, "TRL.web")).toBe("teal");
	expect(roomColorOf("/t/TRL-386", projects, null)).toBeNull();
});

test("a page of no project, and a project with no color, leave the pane plain", () => {
	expect(roomColorOf("/needs-you", projects, null)).toBeNull();
	expect(roomColorOf("/p/CNY", projects, null)).toBeNull();
	expect(roomColorOf("/p/NOPE", projects, null)).toBeNull();
	expect(roomColorOf("/p/TRL", projects, null)).toBe("blue");
});
