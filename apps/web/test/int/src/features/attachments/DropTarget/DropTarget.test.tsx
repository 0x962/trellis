import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DropTarget } from "../../../../../../src/features/attachments/DropTarget/DropTarget";
import { dragFilesOver, dragLeave, dragTextOver, dropFiles, fileOf } from "../../../../../attachments";

const surface = () => screen.getByTestId("surface");

const renderTarget = (identifier = "CDE-42", onFiles: (files: File[]) => void = () => {}) =>
	render(
		<DropTarget identifier={identifier} onFiles={onFiles}>
			<p data-testid="surface">Ticket body</p>
		</DropTarget>,
	);

const overlay = () => document.querySelector("[data-drop-overlay]");

describe("DropTarget", () => {
	// OUT-13. The whole ticket surface takes a file, so the overlay says
	// where the file lands.
	test("shows the dashed overlay with the ticket identifier while a file is over the surface", () => {
		renderTarget();
		dragFilesOver(surface());
		expect(overlay()).not.toBeNull();
		expect(overlay()!.textContent).toContain("Drop to attach to CDE-42");
		expect(overlay()!.getAttribute("class")).toContain("border-dashed");
	});

	// OUT-14
	test("names the identifier of the ticket it wraps", () => {
		renderTarget("CDE-41");
		dragFilesOver(surface());
		expect(overlay()!.textContent).toContain("Drop to attach to CDE-41");
	});

	// OUT-15
	test("hides the overlay when the file leaves the surface", () => {
		renderTarget();
		dragFilesOver(surface());
		expect(overlay()).not.toBeNull();
		dragLeave(surface());
		expect(overlay()).toBeNull();
		expect(screen.getByText("Ticket body")).toBeDefined();
	});

	// OUT-16. Without preventDefault the browser leaves the page and opens
	// the file itself.
	test("hides the overlay on drop and prevents the browser default", () => {
		const dropped: File[][] = [];
		renderTarget("CDE-42", (files) => dropped.push(files));
		dragFilesOver(surface());
		const notPrevented = dropFiles(surface(), [fileOf("notes.txt", "text/plain", 12)]);
		expect(notPrevented).toBe(false);
		expect(overlay()).toBeNull();
		expect(dropped).toHaveLength(1);
		expect(dropped[0]!.map((file) => file.name)).toEqual(["notes.txt"]);
	});

	// OUT-17. The first drag proves the surface is live, so the second one
	// shows that a text drag alone raises nothing.
	test("ignores a drag that carries no file", () => {
		renderTarget();
		dragFilesOver(surface());
		expect(overlay()).not.toBeNull();
		dragLeave(surface());
		dragTextOver(surface());
		expect(overlay()).toBeNull();
	});
});
