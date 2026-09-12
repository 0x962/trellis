import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { RouteError } from "../../../../../../src/features/shell/RouteError/RouteError";

const chunkError = new TypeError("Failed to fetch dynamically imported module: http://127.0.0.1:4521/assets/route.js");

describe("features/shell/RouteError", () => {
	// A route file that does not load while the connection is down means the
	// server is down, not a new build.
	test("a missing route file while offline shows Server offline", () => {
		renderWithProviders(<RouteError error={chunkError} />, { path: "/all/table", actor: "dana", liveStatus: "down" });
		expect(screen.getByRole("heading", { name: "Server offline" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
	});

	test("a missing route file while online names the new build and offers a reload", () => {
		renderWithProviders(<RouteError error={chunkError} />, { path: "/all/table", actor: "dana", liveStatus: "live" });
		expect(screen.getByRole("heading", { name: "A new version of trellis is on the server" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Reload" })).toBeDefined();
	});

	test("any other failure shows its own message", () => {
		renderWithProviders(<RouteError error={new Error("The project is archived.")} />, {
			path: "/all/table",
			actor: "dana",
		});
		expect(screen.getByRole("heading", { name: "trellis did not load this page" })).toBeDefined();
		expect(screen.getByText("The project is archived.")).toBeDefined();
	});
});
