import { ArrowsClockwise, CaretDown, Check, Copy, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../../primitives/Button";
import { Checkbox } from "../../../primitives/Checkbox";
import { IconButton } from "../../../primitives/IconButton";
import { Input } from "../../../primitives/Input";
import { Segmented } from "../../../primitives/Segmented";
import { Select } from "../../../primitives/Select";
import { Switch } from "../../../primitives/Switch";
import { Tabs } from "../../../primitives/Tabs";
import { Textarea } from "../../../primitives/Textarea";
import { Section } from "../Section";

const sizes = ["sm", "md"] as const;

const iconSizes = ["xs", "sm", "md"] as const;

const priorities = ["none", "low", "medium", "high", "urgent"].map((value) => ({ value, label: value }));

// Every control primitive in every state.
export function ControlSections() {
	const [title, setTitle] = useState("Restore the export pages after the upstream 1.27 merge");
	const [comment, setComment] = useState("");
	const [priority, setPriority] = useState("high");
	const [done, setDone] = useState(false);
	const [sound, setSound] = useState(true);
	const [view, setView] = useState("Table");
	const [tab, setTab] = useState("All");
	return (
		<>
			<Section name="Button" note="primary, default, quiet, danger, danger-soft; sm 28 px and md 32 px; icon and kbd">
				{sizes.map((size) => (
					<div key={size} className="flex flex-wrap items-center gap-2">
						<Button size={size} variant="primary" kbd="a">
							Approve
						</Button>
						<Button size={size} kbd="r">
							Send back
						</Button>
						<Button size={size} variant="quiet">
							Move to Todo
						</Button>
						<Button size={size} variant="danger">
							Delete
						</Button>
						<Button size={size} variant="danger-soft">
							Keep mine
						</Button>
						<Button size={size} variant="primary" disabled>
							Create
						</Button>
						<Button size={size} disabled>
							Disabled
						</Button>
						<Button size={size} variant="primary" icon={<Copy />} kbd="⌘C">
							Copy brief
						</Button>
						<Button size={size} icon={<Check />}>
							Approved
						</Button>
					</div>
				))}
			</Section>
			<Section name="Split button" note="primary Button and primary IconButton at sm, sharing one edge">
				<span className="inline-flex items-center">
					<Button variant="primary" icon={<Copy />} kbd="⌘C" className="rounded-r-none focus-visible:z-1">
						Copy brief
					</Button>
					<IconButton
						label="Copy options"
						icon={<CaretDown />}
						variant="primary"
						className="-ml-px rounded-l-none focus-visible:z-1"
					/>
				</span>
			</Section>
			<Section
				name="IconButton"
				note="primary, default, quiet, danger, danger-soft; xs 24 px, sm 28 px, md 32 px; disabled"
			>
				{iconSizes.map((size) => (
					<div key={size} className="flex items-center gap-2">
						<IconButton label="Refresh" icon={<ArrowsClockwise />} size={size} variant="primary" />
						<IconButton label="Refresh" icon={<ArrowsClockwise />} size={size} variant="default" />
						<IconButton label="Refresh" icon={<ArrowsClockwise />} size={size} />
						<IconButton label="Delete" icon={<Trash />} size={size} variant="danger" />
						<IconButton label="Delete" icon={<Trash />} size={size} variant="danger-soft" />
						<IconButton label="Refresh" icon={<ArrowsClockwise />} size={size} disabled />
					</div>
				))}
			</Section>
			<Section name="Input" note="labeled, hidden label, invalid, disabled" className="items-start">
				<Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} className="w-80" />
				<Input label="Search" hideLabel placeholder="Search tickets" value="" onChange={() => {}} className="w-56" />
				<Input label="Key" invalid value="cde" onChange={() => {}} className="w-40" />
				<Input label="Locked" disabled value="CDE" onChange={() => {}} className="w-40" />
			</Section>
			<Section name="Textarea" note="rows 3; disabled" className="items-start">
				<Textarea
					label="Comment"
					rows={3}
					placeholder="Write a comment"
					value={comment}
					onChange={(event) => setComment(event.target.value)}
					className="w-80"
				/>
				<Textarea label="Locked" rows={2} disabled value="Read only" onChange={() => {}} className="w-56" />
			</Section>
			<Section name="Select" note="a value; disabled">
				<Select label="Priority" items={priorities} value={priority} onValueChange={setPriority} />
				<Select label="Locked" items={priorities} value="low" onValueChange={() => {}} disabled />
			</Section>
			<Section name="Checkbox" note="unchecked, checked, mixed, disabled">
				<Checkbox label="Done" checked={done} onCheckedChange={setDone} />
				<Checkbox label="Checked" checked onCheckedChange={() => {}} />
				<Checkbox label="Some" checked={false} indeterminate onCheckedChange={() => {}} />
				<Checkbox label="Locked" checked={false} disabled onCheckedChange={() => {}} />
			</Section>
			<Section name="Switch" note="on, off, disabled">
				<Switch label="Sound" checked={sound} onCheckedChange={setSound} />
				<Switch label="Off" checked={false} onCheckedChange={() => {}} />
				<Switch label="Locked" checked disabled onCheckedChange={() => {}} />
			</Section>
			<Section name="Segmented" note="one option on; arrow keys move it">
				<Segmented
					label="View"
					options={[
						{ value: "Table", label: "Table" },
						{ value: "Board", label: "Board" },
					]}
					value={view}
					onValueChange={setView}
				/>
			</Section>
			<Section name="Tabs" note="the arrow keys skip a disabled tab" className="items-start">
				<Tabs
					items={[
						{ value: "All", label: "All", content: <p className="text-fg-muted">Everything on the ticket.</p> },
						{ value: "Activity", label: "Activity", disabled: true, content: <p>Moves only.</p> },
						{ value: "Comments", label: "Comments", content: <p className="text-fg-muted">Comments only.</p> },
					]}
					value={tab}
					onValueChange={setTab}
					className="w-80"
				/>
			</Section>
		</>
	);
}
