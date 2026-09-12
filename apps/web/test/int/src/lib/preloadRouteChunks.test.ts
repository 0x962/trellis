import { describe, expect, mock, test } from "bun:test";
import { wire } from "../../../renderWithProviders";
import { preloadRouteChunks } from "../../../../src/lib/preloadRouteChunks";

describe("lib/preloadRouteChunks", () => {
	// A route file loads on its first visit. After the server stops, that
	// fetch fails, and the router answers a failed route file with a full
	// reload that shows the browser's error page. Every route file therefore
	// loads while the server still answers.
	test("loads the chunk of every route in the tree", async () => {
		const { router } = wire({ path: "/needs-you", actor: "dana" });
		const loaded: string[] = [];
		router.loadRouteChunk = mock((route: { id: string }) => {
			loaded.push(route.id);
			return Promise.resolve();
		}) as unknown as typeof router.loadRouteChunk;
		await preloadRouteChunks(router);
		expect(loaded.sort()).toEqual(Object.keys(router.routesById).sort());
		expect(loaded).toContain("/needs-you");
		expect(loaded).toContain("/all");
	});
});
