import { notFound } from "@tanstack/react-router";
import { ProjectRefStringSchema } from "@trellis/api";

export type ProjectView = "table" | "board" | "settings";

// The web URL keeps slashes; the API ref joins with dots. The last segment
// is a view only when it is a reserved slug, so a sub-project can never
// take one of these names. `board` stays reserved so an old link such as
// /p/CDE/board still resolves to the board, which is now the bare path.
const views: ReadonlySet<string> = new Set(["board", "table", "settings"]);

export const parseProjectSplat = (splat: string): { ref: string; view: ProjectView } => {
	const segments = splat.split("/").filter((segment) => segment !== "");
	const last = segments[segments.length - 1];
	const view =
		last !== undefined && views.has(last.toLowerCase()) ? (segments.pop()!.toLowerCase() as ProjectView) : "board";
	if (segments.length === 0) throw notFound();
	const ref = ProjectRefStringSchema.safeParse(segments.join("."));
	if (!ref.success) throw notFound();
	return { ref: ref.data, view };
};

// `/p/CDE/web/auth/table`; the board writes no segment, because it is the
// view a project opens in.
export const projectHref = (ref: string, view: ProjectView = "board") =>
	`/p/${ref.split(".").join("/")}${view === "board" ? "" : `/${view}`}`;

// The project path as the sidebar and a breadcrumb print it: `CDE/web/auth`.
export const projectSlashPath = (ref: string) => ref.split(".").join("/");

// The API ref of a `/p/...` pathname, or null when the pathname is not a
// project route or holds an invalid segment. The sidebar marks the active
// row with it, so a bad URL never crashes the sidebar.
export const projectRefOfPathname = (pathname: string): string | null => {
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname
		.slice(3)
		.split("/")
		.filter((segment) => segment !== "");
	const last = segments[segments.length - 1];
	if (last !== undefined && views.has(last.toLowerCase())) segments.pop();
	const ref = ProjectRefStringSchema.safeParse(segments.join("."));
	return ref.success ? ref.data : null;
};
