/**
 * Local persistence: the working document (autosaved), named documents (the "disk"),
 * and preferences. Browser localStorage only; nothing leaves the machine.
 */
import { DocumentError, type FMCDocument, normalizeDocument } from '../state/document';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const P = 'frakmc.';
const CURRENT = P + 'current';
const INDEX = P + 'index';
const DOC = (name: string) => P + 'doc.' + name;
const PREFS = P + 'prefs';

export class StorageFull extends Error {
  constructor() {
    super('Browser storage is full — export the document as a file instead');
  }
}

export interface SavedInfo {
  name: string;
  savedAt: number;
}

export class DocStore {
  constructor(private readonly kv: KV | null = safeLocalStorage()) {}

  get available(): boolean {
    return this.kv !== null;
  }

  private get(k: string): string | null {
    try {
      return this.kv?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }

  private set(k: string, v: string): void {
    if (!this.kv) return;
    try {
      this.kv.setItem(k, v);
    } catch (e) {
      if (e instanceof DOMException || (e as Error)?.name?.includes('Quota')) throw new StorageFull();
      throw e;
    }
  }

  saveCurrent(doc: FMCDocument): void {
    this.set(CURRENT, JSON.stringify(doc));
  }

  loadCurrent(): FMCDocument | null {
    const s = this.get(CURRENT);
    if (!s) return null;
    try {
      return normalizeDocument(JSON.parse(s));
    } catch {
      return null;
    }
  }

  list(): SavedInfo[] {
    try {
      const v = JSON.parse(this.get(INDEX) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string').sort((a, b) => a.name.localeCompare(b.name)) : [];
    } catch {
      return [];
    }
  }

  save(doc: FMCDocument): void {
    const name = doc.name;
    this.set(DOC(name), JSON.stringify(doc));
    const idx = this.list().filter((x) => x.name !== name);
    idx.push({ name, savedAt: Date.now() });
    this.set(INDEX, JSON.stringify(idx));
  }

  load(name: string): FMCDocument {
    const s = this.get(DOC(name));
    if (!s) throw new DocumentError(`No document called ${name}`);
    return normalizeDocument(JSON.parse(s));
  }

  remove(name: string): void {
    try {
      this.kv?.removeItem(DOC(name));
    } catch {
      /* ignore */
    }
    this.set(INDEX, JSON.stringify(this.list().filter((x) => x.name !== name)));
  }

  loadPrefs<T extends object>(defaults: T): T {
    try {
      const v = JSON.parse(this.get(PREFS) ?? '{}');
      return { ...defaults, ...(v && typeof v === 'object' ? v : {}) };
    } catch {
      return { ...defaults };
    }
  }

  savePrefs(p: object): void {
    try {
      this.set(PREFS, JSON.stringify(p));
    } catch {
      /* preferences are a convenience */
    }
  }
}

function safeLocalStorage(): KV | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.getItem(CURRENT);
    return ls;
  } catch {
    return null;
  }
}

/** Serialise a document for a .frakmc.json file. */
export function documentToJson(doc: FMCDocument): string {
  return JSON.stringify(doc, null, 1);
}

/** Parse a .frakmc.json file (throws DocumentError with a readable message). */
export function documentFromJson(text: string): FMCDocument {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new DocumentError('The file is not valid JSON');
  }
  return normalizeDocument(v);
}

/** In-memory KV for tests. */
export class MemoryKV implements KV {
  readonly m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
