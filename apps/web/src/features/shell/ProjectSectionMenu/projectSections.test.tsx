import { describe, expect, test } from "bun:test";
import { Chats, Check, ListBullets } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { type ProjectSection, projectSectionItems, projectSectionLabel } from "./projectSections";

const iconType = (icon: ReactElement | undefined) => (icon as ReactElement).type;

const opens = (current: "epics" | "sessions", label: string) => {
	const opened: ProjectSection[] = [];
	const items = projectSectionItems(current, (section) => opened.push(section));
	items.find((item) => item.label === label)!.onSelect();
	return opened;
};

describe("projectSectionItems", () => {
	test("lists the sections in the order of the sidebar rows", () => {
		const items = projectSectionItems("sessions", () => {});
		expect(items.map((item) => item.id)).toEqual(["epics", "sessions"]);
		expect(items.map((item) => item.label)).toEqual(["Epics", "Sessions"]);
	});

	test("checks the section on screen and leaves every other section its own icon", () => {
		const items = projectSectionItems("sessions", () => {});
		expect(iconType(items[0]!.icon)).toBe(ListBullets);
		expect(iconType(items[1]!.icon)).toBe(Check);
		expect(iconType(projectSectionItems("epics", () => {})[0]!.icon)).toBe(Check);
		expect(iconType(projectSectionItems("epics", () => {})[1]!.icon)).toBe(Chats);
	});

	test("opens the page of the section a person picks, under that project", () => {
		expect(opens("sessions", "Epics").map((section) => section.href("TRL"))).toEqual(["/p/TRL/epics"]);
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
		expect(projectSectionLabel("sessions")).toBe("Sessions");
	});
});
