import type { Actor, CiState, EpicSummary, PrFilter, Priority, StatusSummary } from "@trellis/api";
import type { CommandItem } from "@trellis/ui";
import { epicItems } from "../../../../../pickers/EpicPicker";
import { priorityItems } from "../../../../../pickers/PriorityPicker";
import { projectItems } from "../../../../../pickers/ProjectPicker";
import { ciLabels, type FilterField, prLabels, timeLabels } from "../../../../fields";
import type { View } from "../../../../grammar";

const toggle = (values: readonly string[] | undefined, value: string) =>
	values?.includes(value) ? values.filter((entry) => entry !== value) : [...(values ?? []), value];
const emptyToUndefined = <T>(values: T[]) => (values.length === 0 ? undefined : values);
export const checkedStatusIds = (view: View, statuses: readonly StatusSummary[]) =>
	statuses.filter((status) => view.status?.includes(status.slug)).map((status) => status.id);

type ProjectRow = Parameters<typeof projectItems>[0][number];

export const valueItems = (
	field: FilterField,
	view: View,
	projects: readonly ProjectRow[],
	actors: readonly Actor[],
	epics: readonly EpicSummary[],
): CommandItem[] => {
	switch (field) {
		case "priority":
			return priorityItems({ checked: view.priority ?? [] });
		case "project":
			return projectItems(projects, view.project);
		case "parent":
			return [{ id: "none", label: "No parent", current: view.parent === "none" }];
		case "blocked":
			return [
				{ id: "true", label: "Blocked", current: view.blocked === true },
				{ id: "false", label: "Not blocked", current: view.blocked === false },
			];
		case "epic":
			return [
				{ id: "none", label: "No epic", current: view.epic === "none" },
				...epicItems(epics, { current: view.epic }),
			];
		case "wave":
			return [{ id: "none", label: "No wave", current: view.wave === "none" }];
		case "pr":
		case "ci":
			return [
				...(Object.keys(prLabels) as PrFilter[]).map((value) => ({
					id: `pr:${value}`,
					label: prLabels[value],
					current: view.pr === value,
				})),
				...(Object.keys(ciLabels) as CiState[]).map((value) => ({
					id: `ci:${value}`,
					label: ciLabels[value],
					checked: view.ci?.includes(value) ?? false,
				})),
			];
		case "updated":
		case "created":
			return Object.entries(timeLabels).map(([value, label]) => ({ id: value, label, current: view[field] === value }));
		case "actor":
			return [
				{ id: "@agent", label: "Agents", current: view.actor === "@agent" },
				{ id: "@human", label: "Humans", current: view.actor === "@human" },
				...actors.map((actor) => ({
					id: `${actor.kind}:${actor.name}`,
					label: actor.displayName ?? actor.name,
					hint: actor.kind,
				})),
			];
		default:
			return [];
	}
};

// The view after one value pick.
export const valueChange = (view: View, field: FilterField, id: string, statuses: readonly StatusSummary[]): View => {
	switch (field) {
		case "status": {
			const slug = statuses.find((status) => status.id === id)?.slug ?? id;
			return { ...view, status: emptyToUndefined(toggle(view.status, slug)) };
		}
		case "priority":
			return { ...view, priority: emptyToUndefined(toggle(view.priority, id) as Priority[]) };
		case "label":
			return { ...view, label: emptyToUndefined(toggle(view.label, id)) };
		case "project":
			return { ...view, project: id };
		case "parent":
			return { ...view, parent: "none" };
		case "waitsOn":
			return { ...view, waitsOn: id };
		case "blocked":
			return { ...view, blocked: id === "true" };
		case "epic":
			return { ...view, epic: id };
		case "wave":
			return { ...view, wave: id };
		case "pr":
		case "ci":
			return id.startsWith("pr:")
				? { ...view, pr: id.slice(3) as PrFilter }
				: { ...view, ci: emptyToUndefined(toggle(view.ci, id.slice(3)) as CiState[]) };
		case "updated":
		case "created":
			return { ...view, [field]: id };
		case "actor":
			return { ...view, actor: id };
		default:
			return view;
	}
};
