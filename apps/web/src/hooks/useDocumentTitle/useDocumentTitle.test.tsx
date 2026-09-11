import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { createFakeServer } from "../../../test/fake-server";
import { mockMatchMedia } from "../../../test/media";
import { renderApp } from "../../../test/renderWithProviders";
import { documentTitle } from "./useDocumentTitle";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	document.title = "trellis";
});

describe("hooks/useDocumentTitle", () => {
	test("documentTitle names each page and ends with trellis", () => {
		expect(documentTitle("/needs-you")).toBe("Needs you · trellis");
		expect(documentTitle("/needs-you")).toBe("Needs you · trellis");
		expect(documentTitle("/all")).toBe("All tickets · trellis");
		expect(documentTitle("/all/board")).toBe("All tickets · trellis");
		expect(documentTitle("/p/CDE/web")).toBe("CDE › web · trellis");
		expect(documentTitle("/p/CDE/web/board")).toBe("CDE › web · trellis");
		expect(documentTitle("/p/CDE/settings")).toBe("CDE › Settings · trellis");
		expect(documentTitle("/settings")).toBe("Settings · trellis");
		expect(documentTitle("/search")).toBe("Search · trellis");
		expect(documentTitle("/t/CDE-42")).toBeNull();
	});

	// Each route sets its tab title. The ticket page sets its own title.
	test("the shell sets the tab title of the page it shows", async () => {
		const server = createFakeServer();
		const { router } = renderApp({ path: "/needs-you", actor: "navid", server });
		await waitFor(() => expect(document.title).toBe("Needs you · trellis"));
		await router.navigate({ to: "/all" });
		await waitFor(() => expect(document.title).toBe("All tickets · trellis"));
		await router.navigate({ to: "/p/$", params: { _splat: "CDE/web" } });
		await waitFor(() => expect(document.title).toBe("CDE › web · trellis"));
		await router.navigate({ to: "/settings" });
		await waitFor(() => expect(document.title).toBe("Settings · trellis"));
	});
});
