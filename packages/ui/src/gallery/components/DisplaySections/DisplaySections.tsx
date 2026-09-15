import { ChatCircle, Check, Funnel, Paperclip, Plus, X } from "@phosphor-icons/react";
import { StatusIcon } from "../../../domain/StatusIcon";
import { Avatar } from "../../../primitives/Avatar";
import { Badge } from "../../../primitives/Badge";
import { Button } from "../../../primitives/Button";
import { Chip } from "../../../primitives/Chip";
import { EmptyState } from "../../../primitives/EmptyState";
import { Kbd } from "../../../primitives/Kbd";
import { ScrollArea } from "../../../primitives/ScrollArea";
import { SectionHeader } from "../../../primitives/SectionHeader";
import { Separator } from "../../../primitives/Separator";
import { Skeleton } from "../../../primitives/Skeleton";
import { Section } from "../Section";

const lines = [...Array(24).keys()].map((line) => `CDE-${line + 20}`);

// Every static display primitive in every variant.
export function DisplaySections() {
	return (
		<>
			<Section name="Badge" note="ok, bad, wait, agent, neutral; with an icon">
				<Badge tone="ok" icon={<Check />}>
					6
				</Badge>
				<Badge tone="bad" icon={<X />}>
					2
				</Badge>
				<Badge tone="wait">1</Badge>
				<Badge tone="agent">5</Badge>
				<Badge tone="neutral" icon={<ChatCircle />}>
					14
				</Badge>
				<Badge tone="ok">merged</Badge>
			</Section>
			<Section name="Chip" note="with and without a remove button">
				<Chip
					icon={<StatusIcon category="started" />}
					label="Status"
					value="In Progress, Agent Review"
					onRemove={() => {}}
				/>
				<Chip icon={<Funnel />} label="Priority" op="is" value="High" onRemove={() => {}} />
				<Chip label="Actor" op="is" value="claude-code" />
			</Section>
			<Section name="Avatar" note="human; agent; live">
				<Avatar kind="human" name="Dana Lee" />
				<Avatar kind="human" name="dana" />
				<Avatar kind="agent" name="claude-code" />
				<Avatar kind="agent" name="claude-code" />
				<Avatar kind="human" name="dana" />
			</Section>
			<Section name="Kbd" note="one style, in a row and inside every button">
				<Kbd>⌘K</Kbd>
				<Kbd>a</Kbd>
				<Kbd>↵</Kbd>
				<Button variant="primary" kbd="C">
					New ticket
				</Button>
				<Button kbd="r">Send back</Button>
			</Section>
			<Section name="Skeleton" note="one line; three lines; a row" className="items-start">
				<Skeleton width="w-32" />
				<Skeleton width="w-64" lines={3} />
				<Skeleton width="w-full" height="h-10" className="w-80" />
			</Section>
			<Section name="ScrollArea" note="a 160 px viewport over 24 rows" className="items-start">
				<ScrollArea className="h-40 w-56 rounded-md border border-border">
					<ul className="flex flex-col p-1">
						{lines.map((line) => (
							<li key={line} className="h-7 px-2 text-sm leading-7 text-fg-muted">
								{line}
							</li>
						))}
					</ul>
				</ScrollArea>
			</Section>
			<Section name="Separator" note="horizontal; vertical" className="items-stretch">
				<div className="flex w-40 flex-col gap-2 text-sm text-fg-muted">
					<span>Above</span>
					<Separator />
					<span>Below</span>
				</div>
				<div className="flex h-7 items-center gap-2 text-sm text-fg-muted">
					<span>Left</span>
					<Separator orientation="vertical" />
					<span>Right</span>
				</div>
			</Section>
			<Section name="EmptyState" note="section: inside a list; page: fills the pane" className="justify-center">
				<EmptyState
					title="Nothing needs you"
					description="Every review is done. Every check passed."
					action={<Button>New ticket</Button>}
					className="w-full"
				/>
				<div className="flex h-60 w-full flex-col rounded-md border border-border">
					<EmptyState
						variant="page"
						title="Page not found"
						description="No page has this URL."
						action={<Button size="md">Needs you</Button>}
					/>
				</div>
			</Section>
			<Section
				name="SectionHeader"
				note="title, count, and actions; an empty section is the row alone"
				className="items-stretch"
			>
				<div className="flex w-120 flex-col gap-3">
					<SectionHeader
						title="Sub-tickets"
						count="3/5"
						actions={
							<Button variant="quiet" icon={<Plus />}>
								New sub-ticket
							</Button>
						}
					/>
					<SectionHeader
						title="Attachments"
						actions={
							<Button variant="quiet" icon={<Paperclip />}>
								Upload
							</Button>
						}
					/>
					<SectionHeader title="Timeline" count="14" actions={<span>updated 9h ago</span>} />
				</div>
			</Section>
		</>
	);
}
