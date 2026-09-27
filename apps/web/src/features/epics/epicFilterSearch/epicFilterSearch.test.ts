import { afterEach, beforeEach, expect, test } from "bun:test";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { parseSearchString, stringifySearchObject } from "../../../lib/searchParams";
import { useUiStore } from "../../../stores/uiStore";
import { parseSearch, stripDefaults } from "../../filters/grammar";
import { keepEpicPageChoices } from "../epicSearch";
import { loadEpicFilterSearch } from "./epicFilterSearch";

const initial = useUiStore.getState();
beforeEach(() => useUiStore.setState({ epicFilters: {}, activeEpicFilters: null }));
afterEach(() => useUiStore.setState(initial, true));

const makeRouter = (href: string) => {
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: "/p/$",
		validateSearch: (raw) => keepEpicPageChoices(raw, stripDefaults(parseSearch(raw))),
		beforeLoad: ({ params, search, location, cause, preload }) => {
			loadEpicFilterSearch({
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

test("display-only and Resources links retain their choices and restore filters", async () => {
	useUiStore.getState().setEpicFilters("QA/alpha", { priority: ["high"] });
	const router = makeRouter(`${alpha}?group=status&tab=resources&density=compact`);
	await router.load();
	expect(router.state.matches.at(-1)!.search).toEqual({
		priority: ["high"],
		group: "status",
		tab: "resources",
		density: "compact",
	});
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
