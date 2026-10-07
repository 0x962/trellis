import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { useStatusWrite } from "./useStatusWrite";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("one status write runs until it settles", async () => {
	let state!: ReturnType<typeof useStatusWrite>;
	let finish!: () => void;
	let calls = 0;
	const root = createRoot();
	function Harness() {
		state = useStatusWrite();
		return <span>{state.busy ? "busy" : "ready"}</span>;
	}
	await act(async () => root.render(<Harness />));
	const operation = async () => {
		calls += 1;
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
	};
	let first!: Promise<void>;
	await act(async () => {
		first = state.write(operation);
		void state.write(operation);
		await Promise.resolve();
	});
	expect(calls).toBe(1);
	expect(state.busy).toBe(true);

	await act(async () => {
		finish();
		await first;
	});
	expect(state.busy).toBe(false);
	await act(async () => root.unmount());
});
