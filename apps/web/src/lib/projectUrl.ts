import { notFound } from "@tanstack/react-router";
import { ProjectRefStringSchema, slugPattern } from "@trellis/api";

export type ProjectView = "table" | "board" | "settings" | "notes" | "diffs" | "epics" | "epic";

export type ProjectSplat = {
	ref: string;
	view: ProjectView;
	// The epic slug of the `epic` view: `/p/OP/epics/routine-runtime`.
	epic?: string;
};

// A project URL is `/p/<ref>` and one view segment at most. The segment is
// a view only when it is a reserved slug, so no project takes one of these
// names. `board` stays reserved so an old link such as /p/CDE/board still
// resolves to the board, which is now the bare path.
const views: ReadonlySet<string> = new Set(["board", "table", "settings", "notes", "diffs", "epics"]);

// Takes the view segments off the end of the splat and returns them. The
// `epic` view takes two segments, `epics/<slug>`; every other view takes
// one. A segment that names no view leaves the splat whole and the view is
// the board.
const popView = (segments: string[]): { view: ProjectView; epic?: string } => {
	const last = segments[segments.length - 1];
	const beforeLast = segments[segments.length - 2];
	if (
		segments.length === 3 &&
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
	if (segments.length !== 1) throw notFound();
	const ref = ProjectRefStringSchema.safeParse(segments[0] as string);
	if (!ref.success) throw notFound();
	return epic === undefined ? { ref: ref.data, view } : { ref: ref.data, view, epic };
};

// `/p/CDE/table`; the board writes no segment, because it is the view a
// project opens in.
export const projectHref = (ref: string, view: Exclude<ProjectView, "epic"> = "board") =>
	`/p/${ref}${view === "board" ? "" : `/${view}`}`;

// The sessions page of one project: `/sessions/project/TRL`.
export const projectSessionsHref = (ref: string) => `/sessions/project/${ref}`;

// The page of one epic: `/p/OP/epics/routine-runtime`.
export const epicHref = (ref: string, slug: string) => `${projectHref(ref, "epics")}/${slug}`;

// The `/p/$` splat of an epic page from the epic ref. An epic ref is
// `KEY/slug`, and the epic page is `/p/KEY/epics/slug`.
export const epicSplat = (epicRef: string) => epicRef.replace("/", "/epics/");

// True when the pathname is the page of one epic: `/p/OP/epics/<slug>`.
export const isEpicPathname = (pathname: string): boolean =>
	pathname.startsWith("/p/") &&
	popView(
		pathname
			.slice(3)
			.split("/")
			.filter((segment) => segment !== ""),
	).view === "epic";

// The epic ref of an epic page pathname, or null on every other page:
// `OP/routine-runtime` for `/p/OP/epics/routine-runtime`.
export const epicRefOfPathname = (pathname: string): string | null => {
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname
		.slice(3)
		.split("/")
		.filter((segment) => segment !== "");
	const { epic } = popView(segments);
	return epic === undefined ? null : `${segments[0]}/${epic}`;
};

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
	if (segments.length !== 1) return null;
	const ref = ProjectRefStringSchema.safeParse(segments[0] as string);
	return ref.success ? ref.data : null;
};
