/**
 * IndexedDB Persistence Layer
 *
 * Provides durable browser-side storage for parts, macros, splicer definitions,
 * batch jobs, and generated parts. This replaces localStorage for large datasets
 * and enables mass part creation workflows.
 *
 * Stores:
 *   parts       — Part library (built-in + user-created + batch-generated)
 *   macros      — Macro definitions
 *   splicers    — Splicer definitions with connection points
 *   spliceAssemblies — Saved splice assemblies
 *   batchJobs   — Batch/mass part creation jobs
 *   executions  — Macro execution history
 */

const DB_NAME = "ai-cad";
const DB_VERSION = 1;

const STORES = [
	"parts",
	"macros",
	"splicers",
	"spliceAssemblies",
	"batchJobs",
	"executions",
] as const;

export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			for (const name of STORES) {
				if (!db.objectStoreNames.contains(name)) {
					const store = db.createObjectStore(name, { keyPath: "id" });
					// Common indexes
					store.createIndex("name", "name", { unique: false });
					store.createIndex("createdAt", "createdAt", { unique: false });
					store.createIndex("updatedAt", "updatedAt", { unique: false });

					if (name === "parts") {
						store.createIndex("category", "category", { unique: false });
						store.createIndex("tags", "tags", {
							unique: false,
							multiEntry: true,
						});
					}
					if (name === "macros") {
						store.createIndex("category", "category", { unique: false });
						store.createIndex("tags", "tags", {
							unique: false,
							multiEntry: true,
						});
					}
					if (name === "splicers") {
						store.createIndex("partId", "partId", { unique: false });
					}
					if (name === "batchJobs") {
						store.createIndex("status", "status", { unique: false });
						store.createIndex("macroId", "macroId", { unique: false });
					}
					if (name === "executions") {
						store.createIndex("macroId", "macroId", { unique: false });
						store.createIndex("status", "status", { unique: false });
					}
				}
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

	return dbPromise;
}

// ─── Generic CRUD ──────────────────────────────────────────────

async function tx(
	storeName: StoreName,
	mode: IDBTransactionMode,
): Promise<IDBObjectStore> {
	const db = await openDb();
	return db.transaction(storeName, mode).objectStore(storeName);
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function put<T extends { id: string }>(
	storeName: StoreName,
	item: T,
): Promise<void> {
	const store = await tx(storeName, "readwrite");
	await wrapRequest(store.put(item));
}

export async function putMany<T extends { id: string }>(
	storeName: StoreName,
	items: T[],
): Promise<void> {
	const db = await openDb();
	const transaction = db.transaction(storeName, "readwrite");
	const store = transaction.objectStore(storeName);

	for (const item of items) {
		store.put(item);
	}

	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function get<T>(
	storeName: StoreName,
	id: string,
): Promise<T | undefined> {
	const store = await tx(storeName, "readonly");
	return wrapRequest(store.get(id)) as Promise<T | undefined>;
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
	const store = await tx(storeName, "readonly");
	return wrapRequest(store.getAll()) as Promise<T[]>;
}

export async function del(storeName: StoreName, id: string): Promise<void> {
	const store = await tx(storeName, "readwrite");
	await wrapRequest(store.delete(id));
}

export async function clear(storeName: StoreName): Promise<void> {
	const store = await tx(storeName, "readwrite");
	await wrapRequest(store.clear());
}

export async function count(storeName: StoreName): Promise<number> {
	const store = await tx(storeName, "readonly");
	return wrapRequest(store.count());
}

// ─── Index Queries ─────────────────────────────────────────────

export async function getByIndex<T>(
	storeName: StoreName,
	indexName: string,
	value: IDBValidKey,
): Promise<T[]> {
	const store = await tx(storeName, "readonly");
	const index = store.index(indexName);
	return wrapRequest(index.getAll(value)) as Promise<T[]>;
}

export async function getByIndexRange<T>(
	storeName: StoreName,
	indexName: string,
	lower: IDBValidKey,
	upper: IDBValidKey,
): Promise<T[]> {
	const store = await tx(storeName, "readonly");
	const index = store.index(indexName);
	const range = IDBKeyRange.bound(lower, upper);
	return wrapRequest(index.getAll(range)) as Promise<T[]>;
}

// ─── Search (text matching across name/description/tags) ───────

export async function search<
	T extends { name: string; tags?: string[]; description?: string },
>(storeName: StoreName, query: string): Promise<T[]> {
	const all = await getAll<T>(storeName);
	const q = query.toLowerCase();

	return all.filter((item) => {
		if (item.name.toLowerCase().includes(q)) return true;
		if (item.description?.toLowerCase().includes(q)) return true;
		if (item.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
		return false;
	});
}

// ─── Stats ─────────────────────────────────────────────────────

export async function getStats(): Promise<Record<StoreName, number>> {
	const stats = {} as Record<StoreName, number>;
	for (const name of STORES) {
		stats[name] = await count(name);
	}
	return stats;
}

export { openDb, STORES };
