import { PersonaMark } from "../../primitives/PersonaMark";

export type TrellisMarkProps = {
	label?: string;
	className?: string;
	background?: boolean;
	working?: boolean;
};

export function TrellisMark({ label, className = "size-4", background = true, working = false }: TrellisMarkProps) {
	return (
		<PersonaMark
			name="Trellis"
			kind="manager"
			label={label}
			className={className}
			background={background}
			state={working ? "working" : "static"}
		/>
	);
}
