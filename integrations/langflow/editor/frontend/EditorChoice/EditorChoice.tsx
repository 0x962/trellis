import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EditorChoice({ label, value, choices, onChange }: {
	label: string; value: string; choices: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
	const id = useId();
	return <div className="flex min-w-0 flex-col gap-2">
		<Label htmlFor={id}>{label}</Label>
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger id={id} className="min-h-11 w-full"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
			<SelectContent>{choices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent>
		</Select>
	</div>;
}
