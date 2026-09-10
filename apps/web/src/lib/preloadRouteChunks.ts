import type { createAppRouter } from "../router";

// Loads the code of every route. The router fetches a route's code on the
// first visit, and a fetch that fails makes it reload the whole document.
// With every route's code in the module cache, a visit after the server
// stops fails in its data load instead, and the page shows the error state
// inside the shell.
export const preloadRouteChunks = (router: ReturnType<typeof createAppRouter>) =>
	Promise.all(Object.values(router.routesById).map((route) => router.loadRouteChunk(route)));
