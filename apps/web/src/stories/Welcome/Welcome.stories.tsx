import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeText, Kbd, SectionHeader } from "@trellis/ui";

function Welcome() {
	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
			<div className="flex flex-col gap-3">
				<h1 className="text-xl font-semibold">Trellis Storybook</h1>
				<p className="text-md text-fg-muted">Explore the components and pages that make Trellis.</p>
			</div>
			<section className="flex flex-col gap-3">
				<SectionHeader title="Find a state" />
				<p>Choose Components, Overlays, or Pages in the sidebar. Each story selects a supported state.</p>
				<p>
					Use the search field or <Kbd>⌘K</Kbd> to find a component. Controls changes its props. The toolbar selects the
					theme and screen width.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<SectionHeader title="Try an interaction" />
				<p>
					Open menus, change filters, edit forms, and use the keyboard. Interactive examples use the product controls.
				</p>
				<p>
					The catalog uses synthetic data. Forms and actions use local fixtures. They do not change your projects or
					start agents.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<SectionHeader title="Keep the catalog complete" />
				<p>
					Run <CodeText>bun run storybook:check</CodeText> after a component changes. Each coverage record names the
					component, its stories, and its states.
				</p>
				<p>
					Run <CodeText>bun run storybook:test</CodeText> to render every story and run its interactions. The
					Accessibility panel checks the selected story.
				</p>
			</section>
		</main>
	);
}

const meta = { title: "Welcome", component: Welcome } satisfies Meta<typeof Welcome>;
export default meta;
type Story = StoryObj<typeof meta>;
export const StartHere: Story = {};
