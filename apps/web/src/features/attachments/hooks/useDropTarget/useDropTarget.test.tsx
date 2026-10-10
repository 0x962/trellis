import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useDropTarget } from "./useDropTarget";

const browser = new Window();
const original = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(async () => {
	await browser.happyDOM.abort();
	if (original) Object.defineProperty(globalThis, "window", original);
	else Reflect.deleteProperty(globalThis, "window");
});

test("files dropped in a child portal reach only the child upload queue", async () => {
	const parentFiles: File[] = [];
	const childFiles: File[] = [];
	const container = browser.document.createElement("div");
	const portal = browser.document.createElement("div");
	browser.document.body.append(container, portal);
	function Target({ children, files }: { children?: ReactNode; files: File[] }) {
		const target = useDropTarget((added) => files.push(...added));
		return (
			<section aria-label="Files" onDrop={target.onDrop} onDragOver={target.onDragOver} data-over={target.over}>
				{children}
			</section>
		);
	}
	const root = createRoot(container as unknown as HTMLElement);
	await act(async () => {
		root.render(
			<Target files={parentFiles}>
				{createPortal(<Target files={childFiles} />, portal as unknown as HTMLElement)}
			</Target>,
		);
	});
	const file = new File(["child"], "child.txt");
	const child = portal.querySelector("section")!;
	const dispatch = async (type: string) => {
		const event = new browser.Event(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [file] } });
		await act(async () => child.dispatchEvent(event));
	};
	await dispatch("dragover");
	expect(child.getAttribute("data-over")).toBe("true");
	expect(container.querySelector("section")!.getAttribute("data-over")).toBe("false");
	await dispatch("drop");
	expect(childFiles).toEqual([file]);
	expect(parentFiles).toEqual([]);
	await act(async () => root.unmount());
	container.remove();
	portal.remove();
});
