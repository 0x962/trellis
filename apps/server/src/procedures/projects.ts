import type { Project } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const projects = os.projects.router({
	list: os.projects.list.handler(({ context, input }) => call(context, "projects.list", input)),
	get: os.projects.get.handler(({ context, input }) => call(context, "projects.get", input)),
	create: os.projects.create.handler(async ({ context, input }) => {
		const project = await call<Project>(context, "projects.create", input);
		setLocation(context, `/api/projects/${project.key}`);
		return project;
	}),
	update: os.projects.update.handler(({ context, input }) => call(context, "projects.update", input)),
	move: os.projects.move.handler(({ context, input }) => call(context, "projects.move", input)),
	delete: os.projects.delete.handler(({ context, input }) => call(context, "projects.delete", input)),
	repos: os.projects.repos.handler(({ context, input }) => call(context, "projects.repos", input)),
	setRepos: os.projects.setRepos.handler(({ context, input }) => call(context, "projects.setRepos", input)),
});
