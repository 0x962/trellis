import { Check, Play, RefreshCw } from "lucide-react";
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

const priorities = ["none", "low", "medium", "high", "urgent"].map((value) => ({ value, label: value }));

// Every control primitive in every state.
export function ControlSections() {
	const [title, setTitle] = useState("Restore the fork pages after the upstream 1.27 merge");
	const [comment, setComment] = useState("");
	const [priority, setPriority] = useState("high");
	const [done, setDone] = useState(false);
	const [sound, setSound] = useState(true);
	const [view, setView] = useState("Table");
	const [tab, setTab] = useState("All");
	return (
		<>
			<Section name="Button" note="primary, default, quiet, danger; md and sm; icon and kbd">
				<Button variant="primary" kbd="a">
					Approve
				</Button>
				<Button kbd="r">Send back</Button>
				<Button variant="quiet">Move to Todo</Button>
				<Button variant="danger">Delete</Button>
				<Button disabled>Disabled</Button>
				<Button variant="primary" icon={<Play />} kbd="⌘⇧A">
					Start with agent
				</Button>
				<Button icon={<Check />}>Approved</Button>
				<Button size="sm">Small</Button>
				<Button size="sm" variant="primary">
					Small primary
				</Button>
				<Button size="sm" variant="quiet">
					Small quiet
				</Button>
			</Section>
			<Section name="IconButton" note="quiet and default; md and sm; disabled">
				<IconButton label="Refresh" icon={<RefreshCw />} />
				<IconButton label="Refresh" icon={<RefreshCw />} variant="default" />
				<IconButton label="Refresh" icon={<RefreshCw />} size="sm" />
				<IconButton label="Refresh" icon={<RefreshCw />} disabled />
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
					placeholder="Leave a comment…"
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
			<Section name="Tabs" note="a disabled tab is skipped" className="items-start">
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
