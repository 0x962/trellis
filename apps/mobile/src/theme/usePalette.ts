import { type Palette, tokens } from "./tokens";
import { useTheme } from "./useTheme";

// The palette of the resolved theme. A component reads every color from it.
export const usePalette = (): Palette => tokens[useTheme().resolved];
