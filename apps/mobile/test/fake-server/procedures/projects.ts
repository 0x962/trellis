import { fail } from "../fail";
import { os } from "../implementer";
import { requireProject, slugify } from "../refs";
import { addChild, addRoot } from "../seeder";
import { childrenOf, isoNow, type ProjectRow, projectsInOrder, type State, subtree } from "../state";
import { fullProject, projectSummary } from "../summaries";

// A slug change renames the path of the project and of every descendant.
const repath = (state: State, project: ProjectRow) => {
	const parent = project.parentId === null ? null : state.projects.get(project.parentId)!;
	project.path = parent === null ? project.key : `${parent.path}.${project.slug}`;
	project.depth = parent === null ? 0 : parent.depth + 1;
	for (const child of childrenOf(state, project.id)) repath(state, child);
};

const requireFreeSlug = (state: State, parentId: string, slug: string) => {
	if (childrenOf(state, parentId).some((child) => child.slug === slug)) throw fail("DUPLICATE", { field: "slug" });
};

export const projects = {
	list: os.projects.list.handler(({ context, input }) =>
		projectsInOrder(context.state)
			.filter((project) => (input.archived ?? false) === (project.archivedAt !== null))
			.map((project) => projectSummary(context.state, project)),
	),
	get: os.projects.get.handler(({ context, input }) =>
		fullProject(context.state, requireProject(context.state, input.project)),
	),
	create: os.projects.create.handler(({ context, input }) => {
		const { state, bus } = context;
		const at = isoNow();
		let project: ProjectRow;
		if (input.parent === undefined) {
			const key = input.key!;
			if ([...state.projects.values()].some((row) => row.parentId === null && row.key === key)) {
				throw fail("DUPLICATE", { field: "key" });
			}
			const roots = [...state.projects.values()].filter((row) => row.parentId === null);
			project = addRoot(state, key, input.name, roots.length, at);
		} else {
			const parent = requireProject(state, input.parent);
			const slug = input.slug ?? slugify(input.name);
			requireFreeSlug(state, parent.id, slug);
			project = addChild(state, parent, slug, input.name, childrenOf(state, parent.id).length, at);
		}
		project.description = input.description ?? "";
		if (input.ticketTemplate !== undefined) project.ticketTemplate = input.ticketTemplate;
		bus.emit("project.created", { id: project.id }, { projectId: project.id });
		context.resHeaders.set("location", `/api/projects/${project.path}`);
		return fullProject(state, project);
	}),
	update: os.projects.update.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProject(state, input.project);
		if (input.slug !== undefined && project.parentId !== null && input.slug !== project.slug) {
			requireFreeSlug(state, project.parentId, input.slug);
			project.slug = input.slug;
			repath(state, project);
		}
		if (input.name !== undefined) project.name = input.name;
		if (input.description !== undefined) project.description = input.description;
		if (input.ticketTemplate !== undefined) project.ticketTemplate = input.ticketTemplate;
		if (input.archived !== undefined) project.archivedAt = input.archived ? isoNow() : null;
		project.updatedAt = isoNow();
		bus.emit("project.updated", { id: project.id }, { projectId: project.id });
		return fullProject(state, project);
	}),
	move: os.projects.move.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProject(state, input.project);
		if (input.parent !== undefined) {
			const parent = input.parent === null ? state.projects.get(project.rootId)! : requireProject(state, input.parent);
			if (parent.rootId !== project.rootId) throw fail("CROSS_ROOT_MOVE", undefined);
			if (subtree(state, project.id).some((row) => row.id === parent.id)) throw fail("PARENT_CYCLE", undefined);
			project.parentId = parent.id;
			repath(state, project);
		}
		const siblings = childrenOf(state, project.parentId ?? "").filter((row) => row.id !== project.id);
		const anchor = input.after ?? input.before;
		const index = anchor === undefined ? siblings.length : siblings.findIndex((row) => row.path === anchor);
		if (index === -1) throw fail("INVALID_ANCHOR", undefined);
		siblings.splice(input.before === undefined ? index + (anchor === undefined ? 0 : 1) : index, 0, project);
		siblings.forEach((row, position) => {
			row.position = position;
		});
		project.updatedAt = isoNow();
		bus.emit("project.moved", { id: project.id }, { projectId: project.id });
		return fullProject(state, project);
	}),
	delete: os.projects.delete.handler(({ context, input }) => {
		const { state, bus } = context;
		const project = requireProject(state, input.project);
		if (context.actor!.kind === "agent" && input.force !== true) throw fail("AGENT_CANNOT_DELETE", undefined);
		const rows = subtree(state, project.id);
		const ids = new Set(rows.map((row) => row.id));
		const tickets = [...state.tickets.values()].filter((ticket) => ids.has(ticket.projectId));
		if (input.force !== true && (tickets.length > 0 || rows.length > 1)) {
			throw fail("PROJECT_NOT_EMPTY", { tickets: tickets.length, projects: rows.length - 1 });
		}
		for (const ticket of tickets) state.tickets.delete(ticket.id);
		for (const row of rows) state.projects.delete(row.id);
		bus.emit("project.deleted", { id: project.id }, { projectId: project.id });
		return { deleted: project.path };
	}),
	setRepos: os.projects.setRepos.handler(({ context, input }) => {
		const project = requireProject(context.state, input.project);
		project.repos = input.repos.map((repo) => ({ id: `${project.id}`, projectId: project.id, ...repo }));
		return project.repos;
	}),
};
