import { projectSchema } from "@/domain/schemas";
import type { Project } from "@/domain/types";

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  isDemo: boolean;
}

/** Persistence boundary: swap this implementation to move from localStorage to a real database. */
export interface ProjectRepository {
  /** False until the first project has ever been saved (used to seed the demo once). */
  initialized(): boolean;
  list(): ProjectSummary[];
  load(id: string): Project | null;
  save(project: Project): void;
  remove(id: string): void;
  getActiveId(): string | null;
  setActiveId(id: string | null): void;
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const INDEX_KEY = "mobileroad.projects.index";
const ACTIVE_KEY = "mobileroad.activeProjectId";
const LEGACY_KEY = "mobileroad.project.v1";
const projectKey = (id: string) => `mobileroad.project.${id}`;
const corruptKey = (id: string) => `mobileroad.corrupt.${id}`;

function readIndex(store: KeyValueStore): ProjectSummary[] | null {
  const raw = store.getItem(INDEX_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((p): p is ProjectSummary => typeof p?.id === "string" && typeof p?.name === "string");
  } catch {
    return null;
  }
}

function summarize(project: Project): ProjectSummary {
  return { id: project.id, name: project.name, updatedAt: new Date().toISOString(), isDemo: project.isDemo };
}

/** Stores every project as its own JSON document plus a small index, all in a key-value store. */
export function createKeyValueProjectRepository(store: KeyValueStore): ProjectRepository {
  const writeIndex = (index: ProjectSummary[]) => store.setItem(INDEX_KEY, JSON.stringify(index));

  const repository: ProjectRepository = {
    initialized() {
      migrateLegacy();
      return store.getItem(INDEX_KEY) !== null;
    },
    list() {
      migrateLegacy();
      return readIndex(store) ?? [];
    },
    load(id) {
      const raw = store.getItem(projectKey(id));
      if (!raw) return null;
      try {
        return projectSchema.parse(JSON.parse(raw));
      } catch {
        // Keep the unreadable data instead of silently destroying it.
        store.setItem(corruptKey(id), raw);
        repository.remove(id);
        return null;
      }
    },
    save(project) {
      store.setItem(projectKey(project.id), JSON.stringify(project));
      const index = (readIndex(store) ?? []).filter((p) => p.id !== project.id);
      writeIndex([...index, summarize(project)]);
    },
    remove(id) {
      store.removeItem(projectKey(id));
      writeIndex((readIndex(store) ?? []).filter((p) => p.id !== id));
      if (store.getItem(ACTIVE_KEY) === id) store.removeItem(ACTIVE_KEY);
    },
    getActiveId() {
      return store.getItem(ACTIVE_KEY);
    },
    setActiveId(id) {
      if (id) store.setItem(ACTIVE_KEY, id);
      else store.removeItem(ACTIVE_KEY);
    },
  };

  /** Moves the single-project storage used by earlier versions into the multi-project layout. */
  function migrateLegacy() {
    const raw = store.getItem(LEGACY_KEY);
    if (!raw) return;
    try {
      const project = projectSchema.parse(JSON.parse(raw));
      store.removeItem(LEGACY_KEY);
      repository.save(project);
      if (!store.getItem(ACTIVE_KEY)) store.setItem(ACTIVE_KEY, project.id);
    } catch {
      store.setItem("mobileroad.corrupt.legacy", raw);
      store.removeItem(LEGACY_KEY);
    }
  }

  return repository;
}

const unavailable: ProjectRepository = {
  initialized: () => false,
  list: () => [],
  load: () => null,
  save: () => undefined,
  remove: () => undefined,
  getActiveId: () => null,
  setActiveId: () => undefined,
};

export function getLocalStorageRepository(): ProjectRepository {
  if (typeof window === "undefined") return unavailable;
  return createKeyValueProjectRepository(window.localStorage);
}
