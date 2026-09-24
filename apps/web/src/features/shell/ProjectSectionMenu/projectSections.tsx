import { Chats, ListBullets } from "@phosphor-icons/react";
import type { MenuItem } from "@trellis/ui";
import type { ReactElement } from "react";
import { projectHref, projectSessionsHref } from "../../../lib/projectUrl";

export type ProjectSectionId = "epics" | "sessions";

export type ProjectSection = {
	id: ProjectSectionId;
	label: string;
	icon: ReactElement;
	// The page of this section under one project key, such as
	// `/p/TRL/epics`.
	href: (projectKey: string) => string;
};

// The sections of one project that the header menu moves between, in the
// order of the sidebar rows.
export const projectSections: readonly ProjectSection[] = [
	{ id: "epics", label: "Epics", icon: <ListBullets />, href: (projectKey) => projectHref(projectKey, "epics") },
	{ id: "sessions", label: "Sessions", icon: <Chats />, href: (projectKey) => projectSessionsHref(projectKey) },
];

export const projectSectionLabel = (id: ProjectSectionId): string =>
	projectSections.find((section) => section.id === id)!.label;

// The rows of the header menu. The row of the section on screen reports its
// state to a screen reader, draws a check, and runs nothing, because that
// page is already open.
export const projectSectionItems = (current: ProjectSectionId, onPick: (section: ProjectSection) => void): MenuItem[] =>
	projectSections.map((section) => ({
		id: section.id,
		label: section.label,
		icon: section.icon,
		checked: section.id === current,
		onSelect: () => {
			if (section.id !== current) onPick(section);
		},
	}));
