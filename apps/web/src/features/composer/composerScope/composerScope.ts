import { createContext } from "react";
import type { ComposerOptions } from "../composerStore";

export const ComposerScope = createContext("trellis-composer");
export type ComposerInstance = {
	storagePrefix: string;
	options: ComposerOptions;
	initialTitle: string;
	onClose: (completed?: boolean) => void;
	onCreated: (identifier: string) => Promise<boolean>;
};
