import { describe, expect, test } from "bun:test";
import { Chats, Check, ListBullets } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { type ProjectSection, projectSectionItems, projectSectionLabel } from "./projectSectionItems";

const iconType = (icon: ReactElement | undefined) => (icon as ReactElement).type;

const picked = (current: "epics" | "sessions", label: string) => {
	const taken: ProjectSection[] = [];
	const items = projectSectionItems(current, (section) => taken.push(section));
	items.find((item) => item.label === label)!.onSelect();
	return taken;
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
		expect(picked("sessions", "Epics").map((section) => section.href("TRL"))).toEqual(["/p/TRL/epics"]);
		expect(picked("epics", "Sessions").map((section) => section.href("TRL"))).toEqual(["/sessions/project/TRL"]);
	});

	test("opens nothing for the section that is already on screen", () => {
		expect(picked("sessions", "Sessions")).toEqual([]);
		expect(picked("epics", "Epics")).toEqual([]);
	});
});

describe("projectSectionLabel", () => {
	test("names each section", () => {
		expect(projectSectionLabel("epics")).toBe("Epics");
		expect(projectSectionLabel("sessions")).toBe("Sessions");
	});
});
