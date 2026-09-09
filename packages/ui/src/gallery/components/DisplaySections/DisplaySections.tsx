import { Check, Funnel, Inbox, MessageCircle, X } from "lucide-react";
import { StatusIcon } from "../../../domain/StatusIcon";
import { Avatar } from "../../../primitives/Avatar";
import { Badge } from "../../../primitives/Badge";
import { Button } from "../../../primitives/Button";
import { Chip } from "../../../primitives/Chip";
import { EmptyState } from "../../../primitives/EmptyState";
import { Kbd } from "../../../primitives/Kbd";
import { ScrollArea } from "../../../primitives/ScrollArea";
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
				<Badge tone="neutral" icon={<MessageCircle />}>
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
				<Avatar kind="human" name="Navid Khan" />
				<Avatar kind="human" name="navid" />
				<Avatar kind="agent" name="claude-code" />
				<Avatar kind="agent" name="claude-code" live />
				<Avatar kind="human" name="navid" live />
			</Section>
			<Section name="Kbd" note="default; inverse on a fill">
				<Kbd>⌘K</Kbd>
				<Kbd>a</Kbd>
				<Kbd>↵</Kbd>
				<span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-on-accent">
					New ticket <Kbd tone="inverse">c</Kbd>
				</span>
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
							<li key={line} className="h-7 px-2 font-mono text-sm leading-7 text-fg-muted">
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
			<Section name="EmptyState" note="icon, title, description, action" className="justify-center">
				<EmptyState
					icon={<Inbox />}
					title="Nothing needs you"
					description="Every review is done and every check is green."
					action={<Button>New ticket</Button>}
					className="w-full"
				/>
			</Section>
		</>
	);
}
