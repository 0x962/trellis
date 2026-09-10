import { createMMKV } from "react-native-mmkv";

// The one MMKV instance of the app. `keys` travels with it, so a reader
// asks this module for the store and the name of the value it wants.
export const store = createMMKV({ id: "trellis" });

export { keys } from "./keys";
