import type { Project } from "@trellis/api";

export type Repo = Pick<Project["repos"][number], "owner" | "repo">;
export type GeneralValues = Pick<Project, "name" | "key" | "description" | "color" | "directory"> & {
	repos: Repo[];
};
