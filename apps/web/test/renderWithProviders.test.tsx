import { beforeEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { createFakeServer } from "./fake-server";
import { renderApp, renderWithProviders } from "./renderWithProviders";

beforeEach(() => localStorage.clear());

describe("renderWithProviders", () => {
	// WS-63. Every component test renders inside the same providers the app
	// mounts: a memory router at `path`, a fresh QueryClient, and a trellis
	// client whose fetch is the fake server's `app.request`.
	test("renderWithProviders wires the router, the query client, and the fake server", async () => {
		const result = renderWithProviders(<p>hello</p>, { path: "/needs-you", actor: "navid" });
		expect(await result.findByText("hello")).toBeDefined();
		expect(result.router.state.location.pathname).toBe("/needs-you");
		expect(result.queryClient).toBeInstanceOf(QueryClient);
		expect(typeof result.unmount).toBe("function");
		expect(typeof result.findByRole).toBe("function");
		expect(result.live.status.get()).toBe("live");
		expect(result.queryClient.getDefaultOptions().queries?.staleTime).toBe(Number.POSITIVE_INFINITY);
		expect(localStorage.getItem("trellis.actor")).toBe('{"name":"navid","kind":"human"}');
		const projects = await result.client.projects.list({});
		expect(projects.map((project) => project.path)).toEqual(["CDE", "CDE.web", "CDE.host", "TRL", "MRG"]);
		expect(result.server.calls.some((call) => call.path.join(".") === "projects.list")).toBe(true);
		expect(result.server.calls.find((call) => call.path.join(".") === "projects.list")!.actor).toBe("human:navid");
		const second = renderWithProviders(<p>again</p>, { path: "/all", actor: "navid" });
		expect(second.queryClient).not.toBe(result.queryClient);
		expect(second.server).not.toBe(result.server);
	});

	// WS-64. A server with projects or a stored name has an identity, so only
	// the empty server shows that the harness stored none.
	test("renderWithProviders starts without an identity when actor is omitted", async () => {
		const result = renderApp({ path: "/needs-you", server: createFakeServer({ empty: true }) });
		expect(localStorage.getItem("trellis.actor")).toBeNull();
		await waitFor(() => expect(result.router.state.location.pathname).toBe("/setup"));
	});
});
