/**
 * Undo/Redo History System
 *
 * Zustand middleware that tracks state changes and provides
 * undo/redo functionality with configurable snapshot depth.
 */

export interface HistoryEntry {
	editorCode: string;
	timestamp: number;
	label: string;
}

const MAX_HISTORY = 50;

class UndoRedoHistory {
	private past: HistoryEntry[] = [];
	private future: HistoryEntry[] = [];
	private current: HistoryEntry | null = null;

	/**
	 * Push a new state onto the history stack.
	 * Clears the redo stack when a new action is taken.
	 */
	push(entry: HistoryEntry) {
		if (this.current) {
			this.past.push(this.current);
			if (this.past.length > MAX_HISTORY) {
				this.past.shift();
			}
		}
		this.current = entry;
		this.future = [];
	}

	/**
	 * Move back one step. Returns the previous state or null.
	 */
	undo(): HistoryEntry | null {
		if (this.past.length === 0) return null;

		if (this.current) {
			this.future.unshift(this.current);
		}

		this.current = this.past.pop() ?? null;
		return this.current;
	}

	/**
	 * Move forward one step. Returns the next state or null.
	 */
	redo(): HistoryEntry | null {
		if (this.future.length === 0) return null;

		if (this.current) {
			this.past.push(this.current);
		}

		this.current = this.future.shift() ?? null;
		return this.current;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	get undoCount(): number {
		return this.past.length;
	}

	get redoCount(): number {
		return this.future.length;
	}

	clear() {
		this.past = [];
		this.future = [];
		this.current = null;
	}
}

// Singleton
export const history = new UndoRedoHistory();
