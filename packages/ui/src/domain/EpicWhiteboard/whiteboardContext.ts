import { createContext, useContext } from "react";
import type { WhiteboardCard, WhiteboardWave } from "./types";

export const WhiteboardContext = createContext<{
	tickets: readonly WhiteboardCard[];
	waves: readonly WhiteboardWave[];
}>({ tickets: [], waves: [] });

export const useWhiteboardContent = () => useContext(WhiteboardContext);
