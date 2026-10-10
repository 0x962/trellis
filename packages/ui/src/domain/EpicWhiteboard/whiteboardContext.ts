import { createContext, useContext } from "react";
import type { WhiteboardOutput } from "./outputTypes";
import type { WhiteboardCard, WhiteboardSession, WhiteboardWave } from "./types";

export const WhiteboardContext = createContext<{
	tickets: readonly WhiteboardCard[];
	waves: readonly WhiteboardWave[];
	sessions: readonly WhiteboardSession[];
	outputs: readonly WhiteboardOutput[];
}>({ tickets: [], waves: [], sessions: [], outputs: [] });

export const useWhiteboardContent = () => useContext(WhiteboardContext);
