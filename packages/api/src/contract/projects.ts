import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	ProjectCreateInputSchema,
	ProjectDeleteInputSchema,
	ProjectDeleteOutputSchema,
	ProjectGetInputSchema,
	ProjectListInputSchema,
	ProjectMoveInputSchema,
	ProjectSchema,
	ProjectSetReposInputSchema,
	ProjectSummarySchema,
	ProjectUpdateInputSchema,
	RepoSchema,
} from "../schemas/project.ts";
import { base } from "./base.ts";

export const projects = {
	list: base
		.route({ method: "GET", path: "/projects", summary: "List every project as a flat list" })
		.input(ProjectListInputSchema)
		.output(z.array(ProjectSummarySchema)),
	get: base
		.route({ method: "GET", path: "/projects/{project}", summary: "Read one project with its tree context" })
		.input(ProjectGetInputSchema)
		.output(ProjectSchema),
	create: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/projects", successStatus: 201, summary: "Create a root or a sub-project" })
		.input(ProjectCreateInputSchema)
		.output(ProjectSchema),
	update: base
		.errors(pickErrors(["DUPLICATE"]))
		.route({ method: "PATCH", path: "/projects/{project}", summary: "Change project fields" })
		.input(ProjectUpdateInputSchema)
		.output(ProjectSchema),
	move: base
		.errors(pickErrors(["CROSS_ROOT_MOVE", "PARENT_CYCLE", "INVALID_ANCHOR", "DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/projects/{project}/move", summary: "Re-parent or reorder a project" })
		.input(ProjectMoveInputSchema)
		.output(ProjectSchema),
	delete: base
		.errors(pickErrors(["AGENT_CANNOT_DELETE", "PROJECT_NOT_EMPTY"]))
		.route({ method: "DELETE", path: "/projects/{project}", summary: "Delete a project" })
		.input(ProjectDeleteInputSchema)
		.output(ProjectDeleteOutputSchema),
	setRepos: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "PUT", path: "/projects/{project}/repos", summary: "Replace the repos the poller scans" })
		.input(ProjectSetReposInputSchema)
		.output(z.array(RepoSchema)),
};
