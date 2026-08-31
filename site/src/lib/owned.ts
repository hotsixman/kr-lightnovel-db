import { writable, derived } from "svelte/store";

const STORAGE_KEY = "lightnovel_owned";

function loadOwned(): Set<string> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch {
    return new Set();
  }
}

function saveOwned(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

/** 책의 고유 식자자: itemId가 있으면 itemId, 없으면 isbn */
function getBookId(itemId: string, isbn?: string | null): string {
  return itemId || isbn || "";
}

function createOwnedStore() {
  const { subscribe, set, update } = writable<Set<string>>(loadOwned());

  return {
    subscribe,
    has(itemId: string, isbn?: string | null): boolean {
      let result = false;
      subscribe((ids) => {
        const id = getBookId(itemId, isbn);
        result = id ? ids.has(id) : false;
      })();
      return result;
    },
    toggle(itemId: string, isbn?: string | null) {
      const id = getBookId(itemId, isbn);
      if (!id) return;
      update((ids) => {
        const next = new Set(ids);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        saveOwned(next);
        return next;
      });
    },
    add(itemId: string, isbn?: string | null) {
      const id = getBookId(itemId, isbn);
      if (!id) return;
      update((ids) => {
        const next = new Set(ids);
        next.add(id);
        saveOwned(next);
        return next;
      });
    },
    remove(itemId: string, isbn?: string | null) {
      const id = getBookId(itemId, isbn);
      if (!id) return;
      update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        saveOwned(next);
        return next;
      });
    },
    import(ids: string[]) {
      const next = new Set(ids);
      saveOwned(next);
      set(next);
    },
    export(): string[] {
      let result: string[] = [];
      subscribe((ids) => (result = [...ids]))();
      return result;
    },
    clear() {
      localStorage.removeItem(STORAGE_KEY);
      set(new Set());
    },
  };
}

export const owned = createOwnedStore();
export const ownedCount = derived(owned, ($owned) => $owned.size);
