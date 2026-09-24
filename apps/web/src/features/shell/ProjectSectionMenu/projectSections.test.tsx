import { describe, expect, test } from "bun:test";
import { Chats, FileHtml, ListBullets } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { type ProjectSection, projectSectionItems, projectSectionLabel } from "./projectSections";

const iconType = (icon: ReactElement | undefined) => (icon as ReactElement).type;

const opens = (current: "epics" | "pages" | "sessions", label: string) => {
	const opened: ProjectSection[] = [];
	const items = projectSectionItems(current, (section) => opened.push(section));
	items.find((item) => item.label === label)!.onSelect();
	return opened;
};

describe("projectSectionItems", () => {
	test("lists the sections in the order of the sidebar rows", () => {
		const items = projectSectionItems("sessions", () => {});
		expect(items.map((item) => item.id)).toEqual(["epics", "pages", "sessions"]);
		expect(items.map((item) => item.label)).toEqual(["Epics", "Pages", "Sessions"]);
	});

	test("marks the section on screen, and no other section", () => {
		expect(projectSectionItems("sessions", () => {}).map((row) => row.checked)).toEqual([false, false, true]);
		expect(projectSectionItems("epics", () => {}).map((row) => row.checked)).toEqual([true, false, false]);
		expect(projectSectionItems("pages", () => {}).map((row) => row.checked)).toEqual([false, true, false]);
	});

	test("every row keeps its own icon, on each page", () => {
		for (const current of ["epics", "pages", "sessions"] as const) {
			const items = projectSectionItems(current, () => {});
			expect(iconType(items[0]!.icon)).toBe(ListBullets);
			expect(iconType(items[1]!.icon)).toBe(FileHtml);
			expect(iconType(items[2]!.icon)).toBe(Chats);
		}
	});

	test("opens the page of the section a person picks, under that project", () => {
		expect(opens("sessions", "Epics").map((section) => section.href("TRL"))).toEqual(["/p/TRL/epics"]);
		expect(opens("epics", "Pages").map((section) => section.href("TRL"))).toEqual(["/p/TRL/pages"]);
		expect(opens("epics", "Sessions").map((section) => section.href("TRL"))).toEqual(["/sessions/project/TRL"]);
	});

	test("opens nothing for the section that is already on screen", () => {
		expect(opens("sessions", "Sessions")).toEqual([]);
		expect(opens("epics", "Epics")).toEqual([]);
	});
});

describe("projectSectionLabel", () => {
	test("names each section", () => {
		expect(projectSectionLabel("epics")).toBe("Epics");
		expect(projectSectionLabel("pages")).toBe("Pages");
		expect(projectSectionLabel("sessions")).toBe("Sessions");
	});
});
