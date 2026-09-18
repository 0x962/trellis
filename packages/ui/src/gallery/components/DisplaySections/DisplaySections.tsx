import { Check, Funnel, Paperclip, Plus, TextAlignLeft, X } from "@phosphor-icons/react";
import { LabelDot } from "../../../domain/LabelDot";
import { LabelPill } from "../../../domain/LabelPill";
import { type LabelPillItem, LabelPills } from "../../../domain/LabelPills";
import { labelColors } from "../../../domain/labelColors";
import { StatusIcon } from "../../../domain/StatusIcon";
import { Avatar } from "../../../primitives/Avatar";
import { Badge } from "../../../primitives/Badge";
import { Button } from "../../../primitives/Button";
import { Chip } from "../../../primitives/Chip";
import { EmptyState } from "../../../primitives/EmptyState";
import { Kbd } from "../../../primitives/Kbd";
import { PropertyRow } from "../../../primitives/PropertyRow";
import { ScrollArea } from "../../../primitives/ScrollArea";
import { SectionHeader } from "../../../primitives/SectionHeader";
import { Separator } from "../../../primitives/Separator";
import { Skeleton } from "../../../primitives/Skeleton";
import { Section } from "../Section";

const lines = [...Array(24).keys()].map((line) => `CDE-${line + 20}`);

const ticketLabels: LabelPillItem[] = [
	{ id: "bug", name: "Bug", color: "red", group: null },
	{ id: "web", name: "Web", color: "blue", group: "Area" },
	{ id: "small", name: "Small", color: "green", group: "Size" },
	{ id: "customer", name: "Customer report", color: "red", group: null },
];

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
				<Badge tone="neutral" icon={<TextAlignLeft />}>
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
			<Section
				name="LabelPill"
				note="every hue; a label of a group; a long name; two pills; the N labels pill; the wrap form; the dot alone and in a 14 px icon box"
				className="items-start"
			>
				<div className="flex flex-wrap items-center gap-1">
					{labelColors.map((color) => (
						<LabelPill key={color} name={color} color={color} />
					))}
				</div>
				<LabelPill name="Bug" color="red" group="Type" title="The product does not work as the docs say." />
				<LabelPill
					name="Restore the export pages after the upstream 1.27 merge"
					color="purple"
					group="A group with a long name that is cut"
				/>
				<LabelPills labels={ticketLabels.slice(0, 2)} />
				<LabelPills labels={ticketLabels} />
				<div className="w-56 rounded-md border border-border bg-bg p-2">
					<LabelPills labels={ticketLabels} wrap />
				</div>
				<div className="flex items-center gap-2">
					<LabelDot color="teal" />
					<span className="inline-flex size-3.5 *:size-full">
						<LabelDot color="teal" variant="icon" />
					</span>
				</div>
			</Section>
			<Section name="Avatar" note="Human initials and agent states">
				<Avatar kind="human" name="Dana Lee" />
				<div className="flex items-center gap-6 p-3">
					<Avatar
						kind="agent"
						name="Claude agent"
						agentProfile={{ provider: "anthropic", model: "Claude Opus 5", effort: "Max" }}
						className="size-8"
					/>
					<Avatar
						kind="agent"
						name="Codex agent"
						agentProfile={{ provider: "openai", model: "GPT-6 Astra", effort: "High" }}
						className="size-8"
					/>
					<Avatar
						kind="agent"
						name="Gemini agent"
						agentProfile={{ provider: "google", model: "Gemini 3 Pro", effort: "Default" }}
						className="size-8"
					/>
					<Avatar
						kind="agent"
						name="Muse agent"
						agentProfile={{ provider: "meta", model: "Muse Spark 1.3" }}
						className="size-8"
					/>
				</div>
				{(["static", "working-mild", "working"] as const).map((state) => (
					<div key={state} className="flex flex-col gap-3 p-3">
						<span className="text-xs text-fg-muted">{state}</span>
						<div className="flex items-center gap-6">
							{["Trellis", "Builder", "Risk-Based Code Review"].map((name) => (
								<Avatar key={name} kind="agent" name={name} state={state} className="size-16" />
							))}
						</div>
						<div className="flex items-center gap-3">
							{["Trellis", "Builder", "Risk-Based Code Review"].map((name) => (
								<Avatar key={name} kind="agent" name={name} state={state} />
							))}
						</div>
					</div>
				))}
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
			<Section
				name="PropertyRow"
				note="a label and a value; a value that wraps; compact below 768 px"
				className="items-stretch"
			>
				<dl className="flex w-120 flex-col gap-0.5">
					<PropertyRow label="Branch">
						<span className="font-mono text-sm">fix/login-redirect</span>
					</PropertyRow>
					<PropertyRow label="Workspace" align="start">
						<span className="min-w-0 flex-1 break-all font-mono text-sm">
							/Users/navidkhan/.trellis/agents/01M2S1BZFYJW83WQWYTVQ7R35P/work
						</span>
					</PropertyRow>
					<PropertyRow label="Age" compact>
						<span className="tabular">51m</span>
					</PropertyRow>
				</dl>
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
