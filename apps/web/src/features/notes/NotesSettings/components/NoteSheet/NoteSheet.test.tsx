import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Note, Project } from "@trellis/api";
import {
	act,
	type ChangeEventHandler,
	type FocusEventHandler,
	type ReactNode,
	type Ref,
	useImperativeHandle,
} from "react";
import { createRoot, type TestInstance } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";

let focusedField: string | undefined;

type ControlProps = {
	label: string;
	error?: string;
	value?: string;
	disabled?: boolean;
	onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
	onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
	ref?: Ref<HTMLInputElement | HTMLTextAreaElement>;
};

mock.module("@trellis/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
		<button {...props}>{children}</button>
	),
	Field: ({ label, children }: { label: string; children: ReactNode }) => (
		<div>
			{label}
			{children}
		</div>
	),
	Input: ({ label, error, ref, ...props }: ControlProps) => {
		useImperativeHandle(ref, () => ({ focus: () => (focusedField = label) }) as unknown as HTMLInputElement);
		return (
			<label>
				{label}
				<input
					{...props}
					aria-label={label}
					aria-invalid={error === undefined ? undefined : true}
					aria-describedby={error === undefined ? undefined : `${label}-error`}
				/>
				{error !== undefined && (
					<p id={`${label}-error`} role="alert">
						{error}
					</p>
				)}
			</label>
		);
	},
	Select: ({ label, disabled }: { label: string; disabled?: boolean }) => (
		<select aria-label={label} disabled={disabled} />
	),
	Sheet: ({
		title,
		children,
		onOpenChange,
	}: {
		title: string;
		children: ReactNode;
		onOpenChange: (open: boolean) => void;
	}) => (
		<section role="dialog" aria-label={title}>
			<button type="button" onClick={() => onOpenChange(false)}>
				Close sheet
			</button>
			{children}
		</section>
	),
	SheetBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SheetFooter: ({
		confirmation,
		leading,
		children,
	}: {
		confirmation?: ReactNode;
		leading?: ReactNode;
		children: ReactNode;
	}) => (
		<footer>
			{confirmation}
			{leading}
			{children}
		</footer>
	),
	Textarea: ({ label, error, ref, ...props }: ControlProps) => {
		useImperativeHandle(ref, () => ({ focus: () => (focusedField = label) }) as unknown as HTMLTextAreaElement);
		return (
			<label>
				{label}
				<textarea
					{...props}
					aria-label={label}
					aria-invalid={error === undefined ? undefined : true}
					aria-describedby={error === undefined ? undefined : `${label}-error`}
				/>
				{error !== undefined && (
					<p id={`${label}-error`} role="alert">
						{error}
					</p>
				)}
			</label>
		);
	},
}));

const { NoteSheet } = await import("./NoteSheet");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
	focusedField = undefined;
});
afterAll(() => mock.restore());

const project = { key: "TRL" } as Project;
const note = {
	id: "01M4ABSTYNSP40TJXRQ2B5W76V",
	title: "Catalog rules",
	body: "Use synthetic data for all stories.",
	audience: "all",
	expiresAt: null,
} as Note;

const textOf = (node: TestInstance): string =>
	node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");

type MountOptions = {
	create?: (input: unknown) => Promise<unknown>;
	update?: (input: unknown) => Promise<unknown>;
	remove?: (input: unknown) => Promise<unknown>;
	note?: Note;
	readOnly?: boolean;
};

async function mount(options: MountOptions = {}) {
	const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const createNote = mock(options.create ?? (async (input) => input));
	const updateNote = mock(options.update ?? (async (input) => input));
	const deleteNote = mock(options.remove ?? (async (input) => input));
	const close = mock(() => {});
	const app = {
		queryClient,
		client: {
			notes: {
				create: createNote,
				update: updateNote,
				delete: deleteNote,
			},
		},
		orpc: { notes: { key: () => ["notes"] } },
	} as unknown as AppContext;
	const root = createRoot();
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<NoteSheet project={project} note={options.note} readOnly={options.readOnly} onClose={close} />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	cleanups.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	const control = (label: string) =>
		root.container.queryAll(
			(node) => (node.type === "input" || node.type === "textarea") && node.props["aria-label"] === label,
		)[0]!;
	const button = (label: string) =>
		root.container.queryAll((node) => node.type === "button" && textOf(node) === label)[0]!;
	const form = () => root.container.queryAll((node) => node.type === "form")[0]!;
	const alerts = () => root.container.queryAll((node) => node.props.role === "alert").map(textOf);
	const change = async (label: string, value: string, badInput = false) => {
		await act(async () => {
			const target = { value, validity: { badInput } };
			control(label).props.onChange({ currentTarget: target, target });
		});
	};
	const blur = async (label: string, badInput = false) =>
		act(async () => control(label).props.onBlur({ currentTarget: { validity: { badInput } } }));
	const click = async (label: string) => act(async () => button(label).props.onClick());
	const submit = async () => {
		await act(async () => form().props.onSubmit({ preventDefault() {} }));
		await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
	};
	return { root, createNote, updateNote, deleteNote, close, control, button, alerts, change, blur, click, submit };
}

test("the form reports title and body errors only after a field exit", async () => {
	const fixture = await mount();

	expect(fixture.alerts()).toEqual([]);
	expect(fixture.button("Create note").props.disabled).toBe(true);

	await fixture.blur("Title");
	expect(fixture.alerts()).toEqual(["Enter a note title of 1 to 120 characters."]);
	expect(fixture.control("Title").props["aria-invalid"]).toBe(true);

	await fixture.change("Title", "Release host");
	expect(fixture.alerts()).toEqual([]);
	await fixture.blur("Body");
	expect(fixture.alerts()).toEqual(["Enter a note body."]);

	await fixture.change("Body", "The release host uses protocol 17.");
	expect(fixture.alerts()).toEqual([]);
	expect(fixture.button("Create note").props.disabled).toBe(false);
});

test("a partial native expiry stays on its field and never reaches create", async () => {
	const fixture = await mount();
	await fixture.change("Title", "Release host");
	await fixture.change("Body", "The release host uses protocol 17.");
	await fixture.change("Expires", "", true);
	await fixture.blur("Expires", true);

	expect(fixture.alerts()).toEqual(["Enter a valid expiry date and time."]);
	expect(fixture.control("Expires").props["aria-invalid"]).toBe(true);
	expect(fixture.button("Create note").props.disabled).toBe(true);

	await fixture.submit();
	expect(fixture.createNote).toHaveBeenCalledTimes(0);
	expect(focusedField).toBe("Expires");
});

test("submit shows every field error and focuses the first invalid field", async () => {
	const fixture = await mount();

	await fixture.submit();

	expect(fixture.alerts()).toEqual(["Enter a note title of 1 to 120 characters.", "Enter a note body."]);
	expect(fixture.createNote).toHaveBeenCalledTimes(0);
	expect(focusedField).toBe("Title");
});

test("a valid note reaches create after every validation error is clear", async () => {
	const fixture = await mount();
	await fixture.submit();
	await fixture.change("Title", "  Release host  ");
	await fixture.change("Body", "  The release host uses protocol 17.  ");
	await fixture.change("Expires", "2026-10-08T09:30");

	expect(fixture.alerts()).toEqual([]);
	expect(fixture.button("Create note").props.disabled).toBe(false);
	await fixture.submit();

	expect(fixture.createNote).toHaveBeenCalledTimes(1);
	expect(fixture.createNote.mock.calls[0]![0]).toEqual({
		project: "TRL",
		title: "Release host",
		body: "The release host uses protocol 17.",
		audience: "all",
		expiresAt: new Date("2026-10-08T09:30").toISOString(),
	});
	expect(fixture.close).toHaveBeenCalledTimes(1);
});

test("a pending create locks the form and refuses a close", async () => {
	let finish!: (value: unknown) => void;
	const fixture = await mount({ create: (input) => new Promise((resolve) => (finish = () => resolve(input))) });
	await fixture.change("Title", "Release host");
	await fixture.change("Body", "The release host uses protocol 17.");
	await fixture.submit();

	expect(fixture.control("Title").props.disabled).toBe(true);
	expect(fixture.button("Cancel").props.disabled).toBe(true);
	await fixture.click("Close sheet");
	expect(fixture.close).toHaveBeenCalledTimes(0);

	finish(note);
	await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
	expect(fixture.close).toHaveBeenCalledTimes(1);
});

test("an edit keeps invalid data out of update and preserves a write error", async () => {
	const fixture = await mount({ note, update: async () => Promise.reject(new Error("Write refused.")) });
	await fixture.change("Body", "");
	await fixture.blur("Body");
	expect(fixture.button("Save changes").props.disabled).toBe(true);
	await fixture.submit();
	expect(fixture.updateNote).toHaveBeenCalledTimes(0);

	await fixture.change("Body", "Keep the current catalog rules.");
	await fixture.submit();
	expect(fixture.updateNote).toHaveBeenCalledTimes(1);
	expect(fixture.alerts()).toEqual(["Could not save the note. Write refused."]);
	expect(fixture.close).toHaveBeenCalledTimes(0);
});
