import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
	"trellisDesktop",
	Object.freeze({
		platform: "darwin",
		chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("trellis:choose-directory"),
	}),
);
