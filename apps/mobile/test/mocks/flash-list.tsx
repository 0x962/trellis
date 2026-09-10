import { jest } from "@jest/globals";
import type { FlashListProps } from "@shopify/flash-list";
import { createElement, forwardRef } from "react";

// A see-through FlashList. Every render records its props, so a test reads
// the list's data and `getItemType` although the list draws only the rows in
// the viewport. `jest.mock("@shopify/flash-list", () => require("<this file>"))`
// installs it.
const actual = jest.requireActual<typeof import("@shopify/flash-list")>("@shopify/flash-list");

export const renders: FlashListProps<unknown>[] = [];

export const lastFlashListProps = <T,>() => renders[renders.length - 1] as FlashListProps<T> | undefined;

export const resetFlashListRenders = () => {
	renders.length = 0;
};

export const FlashList = forwardRef<unknown, FlashListProps<unknown>>((props, ref) => {
	renders.push(props);
	return createElement(actual.FlashList as never, { ...props, ref } as never);
});

export const useFlashListContext = actual.useFlashListContext;
