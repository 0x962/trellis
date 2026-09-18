import { notFound } from "@tanstack/react-router";
import { ProjectRefStringSchema, slugPattern } from "@trellis/api";

export type ProjectView = "table" | "board" | "settings" | "notes" | "diffs" | "epics" | "epic";

export type ProjectSplat = {
	ref: string;
	view: ProjectView;
	// The epic slug of the `epic` view: `/p/OP/epics/routine-runtime`.
	epic?: string;
};

// The web URL keeps slashes; the API ref joins with dots. The last segment
// is a view only when it is a reserved slug, so a sub-project can never
// take one of these names. `board` stays reserved so an old link such as
// /p/CDE/board still resolves to the board, which is now the bare path.
const views: ReadonlySet<string> = new Set(["board", "table", "settings", "notes", "diffs", "epics"]);

// Takes the view segments off the end of the splat and returns them. The
// `epic` view takes two segments, `epics/<slug>`; every other view takes
// one. A segment that names no view leaves the splat whole and the view
// is the board. `epics/<slug>` is an epic only when a project segment
// precedes it: `epics` is a reserved slug, so it never names a
// sub-project, but a root key `EPICS` is valid, and `/p/EPICS/<sub>` is
// that root's sub-project.
const popView = (segments: string[]): { view: ProjectView; epic?: string } => {
	const last = segments[segments.length - 1];
	const beforeLast = segments[segments.length - 2];
	if (
		segments.length > 2 &&
		last !== undefined &&
		beforeLast?.toLowerCase() === "epics" &&
		slugPattern.test(last.toLowerCase())
	) {
		segments.pop();
		segments.pop();
		return { view: "epic", epic: last.toLowerCase() };
	}
	if (last !== undefined && views.has(last.toLowerCase())) {
		return { view: segments.pop()!.toLowerCase() as ProjectView };
	}
	return { view: "board" };
};

export const parseProjectSplat = (splat: string): ProjectSplat => {
	const segments = splat.split("/").filter((segment) => segment !== "");
	const { view, epic } = popView(segments);
	if (segments.length === 0) throw notFound();
	const ref = ProjectRefStringSchema.safeParse(segments.join("."));
	if (!ref.success) throw notFound();
	return epic === undefined ? { ref: ref.data, view } : { ref: ref.data, view, epic };
};

// `/p/CDE/web/auth/table`; the board writes no segment, because it is the
// view a project opens in.
export const projectHref = (ref: string, view: Exclude<ProjectView, "epic"> = "board") =>
	`/p/${ref.split(".").join("/")}${view === "board" ? "" : `/${view}`}`;

// The page of one epic: `/p/OP/epics/routine-runtime`.
export const epicHref = (ref: string, slug: string) => `${projectHref(ref, "epics")}/${slug}`;

// The `/p/$` splat of an epic page from the epic ref. An epic ref is
// `KEY/slug`, and the epic page is `/p/KEY/epics/slug`.
export const epicSplat = (epicRef: string) => epicRef.replace("/", "/epics/");

// The root key of a project ref: `CDE` of `CDE.web.auth`. An epic belongs
// to a root, so a list of the epics a ticket can take asks for the root key.
export const rootKey = (ref: string) => ref.split(".")[0]!;

// The project path as the sidebar and a breadcrumb print it: `CDE/web/auth`.
export const projectSlashPath = (ref: string) => ref.split(".").join("/");

// The API ref of a `/p/...` pathname, or null when the pathname is not a
// project route or holds an invalid segment. The sidebar marks the active
// row with it, so a bad URL never crashes the sidebar.
export const projectRefOfPathname = (pathname: string): string | null => {
	if (pathname.startsWith("/sessions/project/")) {
		const ref = ProjectRefStringSchema.safeParse(pathname.slice("/sessions/project/".length));
		return ref.success ? ref.data : null;
	}
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname
		.slice(3)
		.split("/")
		.filter((segment) => segment !== "");
	popView(segments);
	const ref = ProjectRefStringSchema.safeParse(segments.join("."));
	return ref.success ? ref.data : null;
};
