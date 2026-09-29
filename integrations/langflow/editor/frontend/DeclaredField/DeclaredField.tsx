import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InputFieldType } from "@/types/api";
import { NumericField } from "../NumericField";
import { fieldPolicy } from "../fieldPolicy";

export function DeclaredField({ name, nodeId, field, value, disabled = false, sourceBound, onChange }: {
	name: string; nodeId: string; field: Partial<InputFieldType>; value: unknown;
	disabled?: boolean; sourceBound: boolean; onChange: (value: unknown) => void;
}) {
	const id = useId();
	const label = field.display_name || name;
	const policy = fieldPolicy(name, field, sourceBound);
	const options = field.options;
	const choices = Array.isArray(options) && options.every((option) => typeof option === "string") ? options as string[] : null;
	const reason = policy || (options !== undefined && options !== null && choices === null ? "The installed selector manages this field." : null);
	const numeric = field.type === "int" || field.type === "float";
	return <div className="flex min-w-0 flex-col gap-2" data-trellis-node={nodeId} data-trellis-field={name}>
		<Label className="flex min-h-11 items-center" htmlFor={id}>{label}{field.required ? " (required)" : ""}</Label>
		{reason || disabled ? <p id={id} tabIndex={0} className="whitespace-pre-wrap break-words">
			{reason || "This field is read-only."}
		</p> : field.type === "bool" ? <Switch id={id} checked={value === true} onCheckedChange={onChange} />
		: numeric ? <NumericField id={id} value={value} integer={field.type === "int"}
			positive={name === "max_rounds" || name === "minutes"} required={field.required === true} onChange={onChange} />
		: choices ? <Select required={field.required} value={choices.includes(value as string) ? String(choices.indexOf(value as string) + 1) : ""}
			onValueChange={(selected) => onChange(choices[Number(selected) - 1])}>
			<SelectTrigger id={id} className="min-h-11"><SelectValue placeholder={typeof value === "string" && value ? value : "Select a value"} /></SelectTrigger>
			<SelectContent>{choices.map((option, index) => <SelectItem key={index} value={String(index + 1)}>{option || "Empty"}</SelectItem>)}</SelectContent>
		</Select> : field.multiline ? <Textarea id={id} value={typeof value === "string" ? value : ""}
			required={field.required} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />
		: <Input className="min-h-11" id={id} type={field.password ? "password" : "text"} value={typeof value === "string" ? value : ""}
			required={field.required} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />}
		{field.info && <p className="whitespace-pre-wrap break-words text-muted-foreground">{field.info}</p>}
	</div>;
}
