import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentLayout, type DocumentLayoutProps, Skeleton } from "@trellis/ui";
import { createElement, useRef } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const headings = [
	{ id: "overview", level: 1, text: "Release plan" },
	{ id: "checks", level: 2, text: "Release checks" },
	{ id: "install", level: 2, text: "Installation" },
	{ id: "verify", level: 3, text: "Verify the app" },
];

const meta = {
	title: "Components/DocumentLayout",
	component: DocumentLayout,
	args: {
		headings,
		activeId: "overview",
		onSelect: () => {},
		children: null,
		margin: null,
		contentRef: null,
		scrollRef: null,
	},
	globals: { viewport: { value: "desktop", isRotated: false } },
	parameters: {
		docs: {
			description: {
				component:
					"DocumentLayout renders DocumentContents beside the body or inside a Contents popover. Select a heading to scroll the local document and mark its entry. Duplicate labels retain separate targets. The margin uses its own space.",
			},
		},
	},
	render: function Render(args) {
		const content = useRef<HTMLElement>(null);
		const scroll = useRef<HTMLDivElement>(null);
		const [activeId, setActiveId] = useStoryState(args.activeId);
		return (
			<div className="flex h-128 min-w-0">
				<DocumentLayout
					{...args}
					contentRef={content}
					scrollRef={scroll}
					activeId={activeId}
					onSelect={(id) => {
						const heading = content.current!.querySelector<HTMLElement>(`#${CSS.escape(id)}`)!;
						const container = scroll.current!;
						const inset = Number.parseFloat(getComputedStyle(container).paddingTop);
						container.scrollTop += heading.getBoundingClientRect().top - container.getBoundingClientRect().top - inset;
						setActiveId(id);
					}}
				>
					{args.headings === null ? (
						<Skeleton lines={5} />
					) : args.headings.length === 0 ? (
						<p className="text-sm text-fg">The author prepares a release plan. The document contains no headings.</p>
					) : (
						args.headings.map((heading) => (
							<section key={heading.id} className="flex min-h-80 flex-col gap-3">
								{createElement(
									`h${heading.level}`,
									{ id: heading.id, className: "text-lg font-medium text-fg wrap-anywhere" },
									heading.text,
								)}
								<p className="text-sm text-fg-muted">
									The team checks the release, preserves the current work, and records the result before the
									installation.
								</p>
							</section>
						))
					)}
				</DocumentLayout>
			</div>
		);
	},
} satisfies Meta<DocumentLayoutProps>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Wide: Story = {};
export const Narrow: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
export const SelectHeading: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const contents = within(await canvas.findByRole("navigation", { name: "Document contents" }));
		const checks = contents.getByRole("button", { name: "Release checks" });
		await userEvent.click(checks);
		await expect(checks).toHaveAttribute("aria-current", "location");
		await expect(contents.getByRole("button", { name: "Release plan" })).not.toHaveAttribute("aria-current");
		await expect(canvas.getByRole("article").parentElement!.scrollTop).toBeGreaterThan(0);
	},
};
export const NarrowSelection: Story = {
	globals: { viewport: { value: "narrow", isRotated: false } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await canvas.findByRole("button", { name: "Contents" }));
		const contents = within(await body.findByRole("navigation", { name: "Document contents" }));
		await userEvent.click(contents.getByRole("button", { name: "Release checks" }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(canvas.getByRole("article").parentElement!.scrollTop).toBeGreaterThan(0);
		await userEvent.click(canvas.getByRole("button", { name: "Contents" }));
		const reopened = within(await body.findByRole("navigation", { name: "Document contents" }));
		await expect(reopened.getByRole("button", { name: "Release checks" })).toHaveAttribute("aria-current", "location");
	},
};
export const Empty: Story = { args: { headings: [], activeId: null } };
export const Loading: Story = { args: { headings: null, activeId: null } };
export const LongHeadings: Story = {
	args: {
		headings: [
			{
				id: "long",
				level: 1,
				text: "The release plan for the desktop application and every open project and agent session",
			},
			{ id: "unbroken", level: 2, text: "AHeadingWithoutSpacesThatMustWrapInsideTheContentsSidebarAndTheDocumentBody" },
			{ id: "empty", level: 3, text: "" },
			{ id: "four", level: 4, text: "Release evidence" },
			{ id: "five", level: 5, text: "Browser checks" },
			{ id: "six", level: 6, text: "日本語 <script>plain heading text</script>" },
		],
		activeId: "long",
	},
};
export const DuplicateHeadings: Story = {
	args: {
		headings: [
			{ id: "first", level: 1, text: "Overview" },
			{ id: "second", level: 2, text: "Overview" },
			{ id: "third", level: 3, text: "Overview" },
		],
		activeId: "first",
	},
	play: async ({ canvasElement }) => {
		const contents = within(await within(canvasElement).findByRole("navigation", { name: "Document contents" }));
		const entries = contents.getAllByRole("button", { name: "Overview" });
		await userEvent.click(entries[1]!);
		await expect(entries[1]).toHaveAttribute("aria-current", "location");
		await expect(entries[0]).not.toHaveAttribute("aria-current");
		await expect(entries[2]).not.toHaveAttribute("aria-current");
	},
};
export const WithMargin: Story = {
	args: {
		margin: (
			<aside aria-label="Document margin" className="w-64 shrink-0 border-l border-border p-4">
				<h2 className="text-md font-medium text-fg">Review notes</h2>
				<p className="mt-3 text-sm text-fg-muted">The reviewer checks the installation steps.</p>
			</aside>
		),
	},
};
