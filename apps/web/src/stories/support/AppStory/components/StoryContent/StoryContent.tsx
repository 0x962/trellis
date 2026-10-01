import { createContext, type ReactNode, useContext } from "react";

export const StoryContentContext = createContext<ReactNode>(null);

export function StoryContent() {
	return useContext(StoryContentContext);
}
