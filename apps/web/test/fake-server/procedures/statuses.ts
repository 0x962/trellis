import type { Status } from "@trellis/api";
import { fail } from "../fail";
import { os } from "../implementer";
import {
	effectiveStatuses,
	isoNow,
	matchStatus,
	newId,
	type ProjectRow,
	type State,
	slugify,
	statusesOf,
	subtree,
} from "../state";

// A sub-project that customizes its set takes a copy of the inherited one
// first, and every ticket under it points at the copy.
const ownSet = (state: State, project: ProjectRow): Status[] => {
	if (project.ownsStatuses) return statusesOf(state, project.id);
	const { statuses } = effectiveStatuses(state, project);
	const at = isoNow();
	const copies = statuses.map((status) => ({
		...status,
		id: newId(),
		projectId: project.id,
		createdAt: at,
		updatedAt: at,
	}));
	for (const copy of copies) state.statuses.set(copy.id, copy);
	const ids = new Set(subtree(state, project.id).map((row) => row.id));
	for (const ticket of state.tickets.values()) {
		if (!ids.has(ticket.projectId)) continue;
		const index = statuses.findIndex((status) => status.id === ticket.statusId);
		if (index !== -1) ticket.statusId = copies[index]!.id;
	}
	project.ownsStatuses = true;
	return copies;
};

const requireProjectRow = (state: State, ref: string) => {
	const project = [...state.projects.values()].find((row) => row.path === ref || row.id === ref);
	if (project === undefined) throw fail("NOT_FOUND", { kind: "project", ref });
	return project;
};

export const statuses = {
	list: os.statuses.list.handler(({ context, input }) =>
		effectiveStatuses(context.state, requireProjectRow(context.state, input.project)),
	),
	create: os.statuses.create.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProjectRow(state, input.project);
		const set = ownSet(state, project);
		const slug = slugify(input.name);
		if (set.some((status) => status.slug === slug)) throw fail("DUPLICATE", { field: "name" });
		const at = isoNow();
		const status: Status = {
			id: newId(),
			slug,
			name: input.name,
			category: input.category,
			reviewer: input.reviewer ?? null,
			color: input.color ?? "fg-muted",
			projectId: project.id,
			description: input.description ?? "",
			position: input.position ?? set.length,
			wipLimit: input.wipLimit ?? null,
			isDefault: input.isDefault ?? false,
			createdAt: at,
			updatedAt: at,
		};
		state.statuses.set(status.id, status);
		bus.emit("statuses.changed", { projectId: project.id }, { projectId: project.id });
		return status;
	}),
	update: os.statuses.update.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProjectRow(state, input.project);
		const status = matchStatus(ownSet(state, project), input.status);
		if (status === undefined) throw fail("NOT_FOUND", { kind: "status", ref: input.status });
		if (input.name !== undefined) status.name = input.name;
		if (input.description !== undefined) status.description = input.description;
		if (input.color !== undefined) status.color = input.color;
		if (input.reviewer !== undefined) status.reviewer = input.reviewer;
		if (input.wipLimit !== undefined) status.wipLimit = input.wipLimit;
		if (input.isDefault !== undefined) status.isDefault = input.isDefault;
		status.updatedAt = isoNow();
		bus.emit("statuses.changed", { projectId: project.id }, { projectId: project.id });
		return status;
	}),
	reorder: os.statuses.reorder.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProjectRow(state, input.project);
		const set = ownSet(state, project);
		input.statuses.forEach((ref, position) => {
			const status = matchStatus(set, ref);
			if (status === undefined) throw fail("STATUS_NOT_IN_PROJECT", { valid: set });
			status.position = position;
		});
		bus.emit("statuses.changed", { projectId: project.id }, { projectId: project.id });
		return effectiveStatuses(state, project);
	}),
	delete: os.statuses.delete.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProjectRow(state, input.project);
		const set = ownSet(state, project);
		const status = matchStatus(set, input.status);
		if (status === undefined) throw fail("STATUS_NOT_IN_PROJECT", { valid: set });
		if (set.length === 1) throw fail("LAST_STATUS", undefined);
		const users = [...state.tickets.values()].filter((ticket) => ticket.statusId === status.id);
		const target = input.moveTo === undefined ? undefined : matchStatus(set, input.moveTo);
		if (users.length > 0 && target === undefined) throw fail("STATUS_IN_USE", { count: users.length });
		for (const ticket of users) ticket.statusId = target!.id;
		state.statuses.delete(status.id);
		bus.emit("statuses.changed", { projectId: project.id }, { projectId: project.id });
		return { deleted: status.id, moved: users.length };
	}),
	clear: os.statuses.clear.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProjectRow(state, input.project);
		if (project.parentId === null) throw fail("ROOT_STATUSES", undefined);
		const own = statusesOf(state, project.id);
		project.ownsStatuses = false;
		const { statuses: inherited, inheritedFrom } = effectiveStatuses(state, project);
		let remapped = 0;
		for (const ticket of state.tickets.values()) {
			const old = own.find((status) => status.id === ticket.statusId);
			if (old === undefined) continue;
			ticket.statusId = inherited.find((status) => status.category === old.category)!.id;
			remapped += 1;
		}
		for (const status of own) state.statuses.delete(status.id);
		bus.emit("statuses.changed", { projectId: project.id }, { projectId: project.id });
		return { inheritedFrom: inheritedFrom!, remapped };
	}),
};
