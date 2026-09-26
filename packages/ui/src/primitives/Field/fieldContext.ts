import { type AriaAttributes, createContext } from "react";

export type FieldControlProps = AriaAttributes & {
	id?: string;
	disabled?: boolean;
	readOnly?: boolean;
};

export const fieldContext = createContext<FieldControlProps | null>(null);
