import { expect, test } from "bun:test";
import type { ComponentProps, ReactElement } from "react";
import { TicketComposer } from "./TicketComposer";

test("only the ticket form submits the ticket", () => {
	const calls: (boolean | undefined)[] = [];
	const composer = TicketComposer({
		open: true,
		onOpenChange() {},
		title: "Ticket",
		header: null,
		footer: null,
		children: null,
		onSubmit: (keep) => calls.push(keep),
	});
	const form = composer.props.children as ReactElement<ComponentProps<"form">>;
	const owner = {} as HTMLFormElement;
	const child = {} as HTMLFormElement;
	let prevented = 0;
	const submit = (target: HTMLFormElement) =>
		form.props.onSubmit!({
			target,
			currentTarget: owner,
			preventDefault() {
				prevented++;
			},
		} as Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0]);
	submit(child);
	expect(calls).toEqual([]);
	expect(prevented).toBe(0);
	submit(owner);
	expect(calls).toEqual([undefined]);
	expect(prevented).toBe(1);
});

test("modifier Enter in a nested form preserves the ticket draft", () => {
	const calls: (boolean | undefined)[] = [];
	const composer = TicketComposer({
		open: true,
		onOpenChange() {},
		title: "Ticket",
		header: null,
		footer: null,
		children: null,
		onSubmit: (keep) => calls.push(keep),
	});
	const form = composer.props.children as ReactElement<ComponentProps<"form">>;
	const owner = {} as HTMLFormElement;
	const child = {} as HTMLFormElement;
	const press = (targetForm: HTMLFormElement, shiftKey: boolean) =>
		form.props.onKeyDownCapture!({
			target: { closest: () => targetForm },
			currentTarget: owner,
			defaultPrevented: false,
			nativeEvent: { isComposing: false },
			metaKey: true,
			ctrlKey: false,
			key: "Enter",
			shiftKey,
			preventDefault() {},
		} as unknown as Parameters<NonNullable<ComponentProps<"form">["onKeyDownCapture"]>>[0]);
	press(child, false);
	press(child, true);
	expect(calls).toEqual([]);
	press(owner, false);
	press(owner, true);
	expect(calls).toEqual([undefined, true]);
});
