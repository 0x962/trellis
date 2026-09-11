import { beforeEach, describe, expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import type { FetchLike } from "@trellis/api";
import { useState } from "react";
import { createFakeScheduler } from "../../../../../test/fakeScheduler";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../test/server";
import { useCommandSearch } from "./useCommandSearch";

let setQuery: (query: string) => void = () => {};

function Probe() {
	const [query, set] = useState("");
	setQuery = set;
	const search = useCommandSearch(query);
	return (
		<div
			data-testid="probe"
			data-results={search.tickets.map((ticket) => ticket.identifier).join(",")}
			data-jump={search.jump ?? ""}
		/>
	);
}

const searchCalls = (server: TestServer) => server.calls.filter((call) => call.path.join(".") === "search.query");

// A fetch that holds every response until the test releases it, so a test
// can answer two searches out of order.
const gated = (server: TestServer) => {
	const releases: (() => void)[] = [];
	const fetch: FetchLike = async (request, init) => {
		const response = await server.fetch(request, init);
		await new Promise<void>((resolve) => releases.push(resolve));
		return response;
	};
	return { server: { ...server, fetch } as TestServer, releases };
};

const renderProbe = (server: TestServer = createTestServer()) => {
	const clock = createFakeScheduler();
	const view = renderWithProviders(<Probe />, {
		path: "/p/CDE/table",
		actor: "navid",
		server,
		scheduler: clock.scheduler,
	});
	const probe = () => view.getByTestId("probe");
	return {
		...view,
		...clock,
		server,
		results: () => (probe().getAttribute("data-results") ?? "").split(",").filter((value) => value !== ""),
		jump: () => probe().getAttribute("data-jump"),
	};
};

// Types `query` one character at a time, 10 ms apart, inside the debounce
// window.
const type = (probe: ReturnType<typeof renderProbe>, query: string, start = 0) => {
	for (let index = 1; index <= query.length; index += 1) {
		act(() => {
			setQuery(query.slice(0, index));
			probe.advanceTo(start + index * 10);
		});
	}
};

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("features/command/useCommandSearch", () => {
	// SR-01. One request per burst: a request per keystroke would run five
	// searches for one word.
	test("a burst of keystrokes runs one search after 120 ms", async () => {
		const probe = renderProbe();
		type(probe, "oauth");
		expect(searchCalls(probe.server)).toHaveLength(0);
		act(() => probe.advanceTo(200));
		await waitFor(() => expect(searchCalls(probe.server)).toHaveLength(1));
		expect((searchCalls(probe.server)[0]!.input as { q: string }).q).toBe("oauth");
	});

	// SR-02
	test("a superseded search response never renders", async () => {
		const gate = gated(createTestServer());
		const probe = renderProbe(gate.server);
		type(probe, "oauth");
		act(() => probe.advanceTo(200));
		await waitFor(() => expect(gate.releases).toHaveLength(1));
		type(probe, "oauth token", 200);
		act(() => probe.advanceTo(600));
		await waitFor(() => expect(gate.releases).toHaveLength(2));
		gate.releases[1]!();
		gate.releases[0]!();
		await waitFor(() => expect(probe.results()).toEqual(["CDE-51"]));
	});

	// SR-03
	test("an empty query runs no search request", async () => {
		const probe = renderProbe();
		act(() => probe.advanceTo(500));
		expect(searchCalls(probe.server)).toHaveLength(0);
		expect(probe.results()).toEqual([]);
		type(probe, "oauth", 500);
		act(() => probe.advanceTo(800));
		await waitFor(() => expect(probe.results().length).toBeGreaterThan(0));
		act(() => {
			setQuery("");
			probe.advanceTo(1200);
		});
		await waitFor(() => expect(probe.results()).toEqual([]));
		expect(searchCalls(probe.server)).toHaveLength(1);
	});

	// SR-04
	test("a one character query still runs a search", async () => {
		const probe = renderProbe();
		type(probe, "o");
		act(() => probe.advanceTo(200));
		await waitFor(() => expect(searchCalls(probe.server)).toHaveLength(1));
		expect((searchCalls(probe.server)[0]!.input as { q: string }).q).toBe("o");
	});

	// SR-05. The identifier grammar is in the client, so the jump item is
	// on screen before any response.
	test("an identifier query needs no request for the jump item", () => {
		const probe = renderProbe();
		type(probe, "CDE-42");
		expect(probe.jump()).toBe("CDE-42");
		expect(searchCalls(probe.server)).toHaveLength(0);
	});
});
