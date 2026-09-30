import { afterEach, beforeEach, expect, test } from "bun:test";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { parseSearchString, stringifySearchObject } from "../../../lib/searchParams";
import { useUiStore } from "../../../stores/uiStore";
import { parseSearch, stripDefaults } from "../../filters/grammar";
import { keepEpicPageChoices } from "../epicSearch";
import { syncEpicFilterSearch } from "./epicFilterSearch";

const initial = useUiStore.getState();
beforeEach(() => useUiStore.setState({ epicFilters: {}, epicSorts: {}, activeEpicFilterKey: null }));
afterEach(() => useUiStore.setState(initial, true));

const makeRouter = (href: string) => {
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: "/p/$",
		validateSearch: (raw) => keepEpicPageChoices(raw, stripDefaults(parseSearch(raw))),
		beforeLoad: ({ params, search, location, cause, preload }) => {
			syncEpicFilterSearch({
				splat: params._splat!,
				search,
				searchStr: location.searchStr,
				cause,
				preload,
				phone: false,
			});
		},
	});
	return createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: [href] }),
		parseSearch: parseSearchString,
		stringifySearch: stringifySearchObject,
		isServer: false,
		origin: "http://localhost",
	});
};

const alpha = "/p/QA/epics/alpha";
const beta = "/p/QA/epics/beta";

test.each(["updatedAt", "-updatedAt"])("an old %s link keeps filters and replaces its history entry", async (sort) => {
	const router = makeRouter(`${alpha}?priority=high&sort=${sort}&group=status&tab=resources`);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({
		priority: ["high"],
		group: "status",
		tab: "resources",
	});
	expect(router.state.location.searchStr).toBe("?priority=high&group=status&tab=resources");
	expect(router.history.length).toBe(1);
});

test("an explicit sort and group load without a canonical redirect", async () => {
	const href = `${alpha}?sort=-createdAt&group=status`;
	const router = makeRouter(href);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({ sort: "-createdAt", group: "status" });
	expect(router.state.location.href).toBe(href);
	expect(router.history.length).toBe(1);
});

test("each epic restores its filters after navigation away and back", async () => {
	const router = makeRouter(`${alpha}?priority=high`);
	await router.load();
	await router.navigate({ href: `${beta}?status=todo` });
	await router.navigate({ href: alpha });
	expect(router.state.matches.at(-1)!.search).toEqual({ priority: ["high"] });
	await router.navigate({ href: beta });
	expect(router.state.matches.at(-1)!.search).toEqual({ status: ["todo"] });
	expect(useUiStore.getState().epicFilters).toEqual({
		"QA/alpha": { priority: ["high"] },
		"QA/beta": { status: ["todo"] },
	});
});

test("a new router restores filters into the URL before the page loads", async () => {
	useUiStore
		.getState()
		.setEpicFilters("QA/alpha", { status: ["done"], not: ["status"], q: "test & ship", closed: "hide" });
	const router = makeRouter(alpha);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({
		status: ["done"],
		not: ["status"],
		q: "test & ship",
		closed: "hide",
	});
	expect(router.history.length).toBe(1);
});

test("explicit URL filters replace saved filters without a merge", async () => {
	useUiStore.getState().setEpicFilters("QA/alpha", { status: ["todo"] });
	const router = makeRouter(`${alpha}?priority=low`);
	await router.load();
	expect(useUiStore.getState().epicFilters["QA/alpha"]).toEqual({ priority: ["low"] });
});

test("removal of the last filter stays cleared on return and reload", async () => {
	const router = makeRouter(`${alpha}?priority=high`);
	await router.load();
	await router.navigate({ href: alpha });
	expect(useUiStore.getState().epicFilters["QA/alpha"]).toEqual({});
	await router.navigate({ href: "/p/QA/epics" });
	await router.navigate({ href: alpha });
	expect(router.state.matches.at(-1)!.search).toEqual({});
	const reloaded = makeRouter(alpha);
	await reloaded.load();
	expect(reloaded.state.matches.at(-1)!.search).toEqual({});
});

test.each(["number", "updatedAt", "-updatedAt"])("legacy density links with %s restore filters", async (sort) => {
	useUiStore.getState().setEpicFilters("QA/alpha", { priority: ["high"] });
	const router = makeRouter(`${alpha}?sort=${sort}&group=status&tab=resources&density=compact`);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({
		priority: ["high"],
		group: "status",
		tab: "resources",
	});
	expect(router.state.location.searchStr).toBe("?priority=high&group=status&tab=resources");
	expect(router.history.length).toBe(1);
	expect(useUiStore.getState().epicFilters["QA/alpha"]).toEqual({ priority: ["high"] });
});

test("link preload does not overwrite saved filters", async () => {
	const router = makeRouter(alpha);
	await router.load();
	useUiStore.getState().setEpicFilters("QA/beta", { priority: ["high"] });
	await router.preloadRoute({ to: "/p/$", params: { _splat: "QA/epics/beta" }, search: { priority: ["low"] } });
	expect(useUiStore.getState().epicFilters["QA/beta"]).toEqual({ priority: ["high"] });
});

test("return from the epic list restores filters after a link preview", async () => {
	const router = makeRouter(`${alpha}?priority=high`);
	await router.load();
	await router.navigate({ href: "/p/QA/epics" });
	await router.preloadRoute({ to: "/p/$", params: { _splat: "QA/epics/alpha" }, search: {} });
	await router.navigate({ href: alpha });
	expect(router.state.matches.at(-1)!.search).toEqual({ priority: ["high"] });
});

test.each(["priority", "-priority", "createdAt", "-createdAt", "status", "-status", "number", "-number"])(
	"a new router restores the saved %s order before the page loads",
	async (sort) => {
		const router = makeRouter(`${alpha}?sort=${sort}`);
		await router.load();
		const reloaded = makeRouter(alpha);
		await reloaded.load();
		expect(reloaded.state.matches.at(-1)!.search).toEqual(sort === "number" ? {} : { sort });
		expect(reloaded.history.length).toBe(1);
	},
);

test("each epic and project keeps its own order", async () => {
	const otherProject = "/p/OP/epics/alpha";
	const router = makeRouter(`${alpha}?sort=-priority`);
	await router.load();
	await router.navigate({ href: `${beta}?sort=createdAt` });
	await router.navigate({ href: `${otherProject}?sort=-number` });
	await router.navigate({ href: alpha });
	expect(router.state.matches.at(-1)!.search).toEqual({ sort: "-priority" });
	await router.navigate({ href: beta });
	expect(router.state.matches.at(-1)!.search).toEqual({ sort: "createdAt" });
	await router.navigate({ href: otherProject });
	expect(router.state.matches.at(-1)!.search).toEqual({ sort: "-number" });
});

test("an explicit filter replaces filters and retains the saved order", async () => {
	useUiStore.getState().setEpicFilters("QA/alpha", { status: ["todo"] });
	useUiStore.getState().setEpicSort("QA/alpha", "-priority");
	const router = makeRouter(`${alpha}?priority=low`);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({ priority: ["low"], sort: "-priority" });
	expect(useUiStore.getState().epicFilters["QA/alpha"]).toEqual({ priority: ["low"] });
});

test("an explicit order replaces the saved order and retains saved filters", async () => {
	useUiStore.getState().setEpicFilters("QA/alpha", { status: ["todo"] });
	useUiStore.getState().setEpicSort("QA/alpha", "-priority");
	const router = makeRouter(`${alpha}?sort=createdAt`);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({ status: ["todo"], sort: "createdAt" });
	expect(useUiStore.getState().epicSorts["QA/alpha"]).toBe("createdAt");
});

test.each(["number", "updatedAt", "-updatedAt"])(
	"an explicit %s order replaces saved sorting through the canonical redirect",
	async (sort) => {
		useUiStore.getState().setEpicSort("QA/alpha", "-priority");
		const router = makeRouter(`${alpha}?sort=${sort}&group=status&density=compact`);
		await router.load();
		expect(router.state.location.searchStr).toBe("?group=status");
		expect(router.history.length).toBe(1);
		expect(useUiStore.getState().epicSorts["QA/alpha"]).toBe("number");
		const reloaded = makeRouter(alpha);
		await reloaded.load();
		expect(reloaded.state.matches.at(-1)!.search).toEqual({});
	},
);

test("changing direction and then selecting default ID order survives a return", async () => {
	const router = makeRouter(`${alpha}?priority=high&sort=-createdAt`);
	await router.load();
	await router.navigate({ href: `${alpha}?priority=high&sort=createdAt` });
	expect(useUiStore.getState().epicSorts["QA/alpha"]).toBe("createdAt");
	await router.navigate({ href: `${alpha}?priority=high` });
	await router.navigate({ href: beta });
	await router.navigate({ href: alpha });
	expect(router.state.matches.at(-1)!.search).toEqual({ priority: ["high"] });
	expect(useUiStore.getState().epicSorts["QA/alpha"]).toBe("number");
});

test("removal of the last filter keeps the selected order", async () => {
	const router = makeRouter(`${alpha}?priority=high&sort=-createdAt`);
	await router.load();
	await router.navigate({ href: `${alpha}?sort=-createdAt` });
	const reloaded = makeRouter(alpha);
	await reloaded.load();
	expect(reloaded.state.matches.at(-1)!.search).toEqual({ sort: "-createdAt" });
	expect(useUiStore.getState().epicFilters["QA/alpha"]).toEqual({});
});

test.each([{}, { sort: "number" }, { sort: "createdAt" }])(
	"a link preview keeps saved sorting until navigation: %j",
	async (search) => {
		const router = makeRouter(`${beta}?sort=-number`);
		await router.load();
		useUiStore.getState().setEpicSort("QA/alpha", "-priority");
		await router.preloadRoute({ to: "/p/$", params: { _splat: "QA/epics/alpha" }, search });
		expect(useUiStore.getState().epicSorts).toEqual({ "QA/alpha": "-priority", "QA/beta": "-number" });
		expect(useUiStore.getState().activeEpicFilterKey).toBe("QA/beta");
		await router.navigate({ to: "/p/$", params: { _splat: "QA/epics/alpha" }, search });
		expect(router.state.matches.at(-1)!.search).toEqual(
			search.sort === "number" ? {} : { sort: search.sort ?? "-priority" },
		);
	},
);
