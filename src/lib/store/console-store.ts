import { create } from "zustand";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface ConsoleEntry {
	id: string;
	timestamp: number;
	level: LogLevel;
	message: string;
	source?: "engine" | "worker" | "chat" | "mcp" | "system";
}

interface ConsoleState {
	entries: ConsoleEntry[];
	maxEntries: number;
	filter: LogLevel | "all";

	log: (
		message: string,
		level?: LogLevel,
		source?: ConsoleEntry["source"],
	) => void;
	clear: () => void;
	setFilter: (filter: LogLevel | "all") => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
	entries: [],
	maxEntries: 500,
	filter: "all",

	log: (message, level = "info", source = "system") =>
		set((state) => {
			const entry: ConsoleEntry = {
				id: crypto.randomUUID(),
				timestamp: Date.now(),
				level,
				message,
				source,
			};
			const entries = [...state.entries, entry];
			// Trim to max
			if (entries.length > state.maxEntries) {
				entries.splice(0, entries.length - state.maxEntries);
			}
			return { entries };
		}),

	clear: () => set({ entries: [] }),
	setFilter: (filter) => set({ filter }),
}));
