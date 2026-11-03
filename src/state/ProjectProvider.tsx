"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildDemoProject } from "@/data/demoProject";
import { createBackup, type BackupFile } from "@/domain/backup";
import { applyScopeChange, changeStatus, toggleCheckpoint, updateFeatureDetails, type NewFeatureInput, type Result } from "@/domain/features";
import type { FeatureStatus, Project } from "@/domain/types";
import { getLocalStorageRepository, type ProjectRepository, type ProjectSummary } from "@/repositories/projectRepository";

interface ProjectStore {
  status: "loading" | "ready";
  /** The active project, or null while loading or when no project exists. */
  project: Project | null;
  projects: ProjectSummary[];
  today: Date;
  openProject: (id: string) => boolean;
  createProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  loadDemo: () => void;
  /** Builds a backup of the given projects (all of them when omitted). */
  exportProjects: (ids?: string[]) => BackupFile;
  /** Saves already-validated projects; the open project stays open and is refreshed if it was replaced. */
  importProjects: (projects: Project[]) => void;
  changeStatus: (featureId: string, status: FeatureStatus) => Result<Project>;
  toggleCheckpoint: (featureId: string, checkpointId: string) => Result<Project>;
  updateFeature: (featureId: string, patch: unknown) => Result<Project>;
  addAcceptedFeatures: (accepted: NewFeatureInput[]) => Result<Project>;
  resetDemo: () => void;
}

const ProjectContext = createContext<ProjectStore | null>(null);

export function ProjectProvider({ children, repository }: { children: React.ReactNode; repository?: ProjectRepository }) {
  const [today] = useState(() => new Date());
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const projectRef = useRef<Project | null>(null);
  const repoRef = useRef<ProjectRepository | null>(null);

  const refreshIndex = useCallback(() => setProjects(repoRef.current?.list() ?? []), []);

  const activate = useCallback((next: Project | null) => {
    projectRef.current = next;
    repoRef.current?.setActiveId(next?.id ?? null);
    setProject(next);
  }, []);

  useEffect(() => {
    const repo = repository ?? getLocalStorageRepository();
    repoRef.current = repo;
    if (!repo.initialized()) repo.save(buildDemoProject(today));
    const index = repo.list();
    const activeId = repo.getActiveId();
    const active = (activeId && repo.load(activeId)) || (index[0] ? repo.load(index[0].id) : null);
    // Hydrating from localStorage can only happen after mount (it does not exist during SSR).
    /* eslint-disable react-hooks/set-state-in-effect */
    activate(active);
    setProjects(repo.list());
    setStatus("ready");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repository, today, activate]);

  const commit = useCallback(
    (next: Project) => {
      repoRef.current?.save(next);
      projectRef.current = next;
      setProject(next);
      refreshIndex();
    },
    [refreshIndex],
  );

  const apply = useCallback(
    (fn: (current: Project) => Result<Project>): Result<Project> => {
      const current = projectRef.current;
      if (!current) return { ok: false, errors: ["There is no active project."] };
      const result = fn(current);
      if (result.ok && result.value !== current) commit(result.value);
      return result;
    },
    [commit],
  );

  const store = useMemo<ProjectStore>(
    () => ({
      status,
      project,
      projects,
      today,
      openProject: (id) => {
        const repo = repoRef.current;
        const loaded = repo?.load(id) ?? null;
        refreshIndex();
        if (!loaded) return false;
        activate(loaded);
        return true;
      },
      createProject: (created) => {
        commit(created);
        repoRef.current?.setActiveId(created.id);
      },
      deleteProject: (id) => {
        const repo = repoRef.current;
        if (!repo) return;
        repo.remove(id);
        const remaining = repo.list();
        if (projectRef.current?.id === id) activate(remaining[0] ? repo.load(remaining[0].id) : null);
        refreshIndex();
      },
      loadDemo: () => {
        const demo = buildDemoProject(new Date());
        commit(demo);
        repoRef.current?.setActiveId(demo.id);
      },
      exportProjects: (ids) => {
        const repo = repoRef.current;
        const wanted = ids ?? (repo?.list() ?? []).map((p) => p.id);
        const loaded = wanted.map((id) => (id === projectRef.current?.id ? projectRef.current : repo?.load(id) ?? null)).filter((p): p is Project => p !== null);
        return createBackup(loaded);
      },
      importProjects: (incoming) => {
        const repo = repoRef.current;
        if (!repo) return;
        incoming.forEach((p) => repo.save(p));
        const openId = projectRef.current?.id;
        const refreshed = openId ? incoming.find((p) => p.id === openId) : undefined;
        if (refreshed) {
          projectRef.current = refreshed;
          setProject(refreshed);
        } else if (!projectRef.current && incoming[0]) {
          activate(incoming[0]);
        }
        refreshIndex();
      },
      changeStatus: (id, next) => apply((p) => changeStatus(p, id, next)),
      toggleCheckpoint: (id, cp) => apply((p) => toggleCheckpoint(p, id, cp, new Date())),
      updateFeature: (id, patch) => apply((p) => updateFeatureDetails(p, id, patch)),
      addAcceptedFeatures: (accepted) => apply((p) => applyScopeChange(p, accepted, new Date())),
      resetDemo: () => {
        const demo = buildDemoProject(new Date());
        commit(demo);
        repoRef.current?.setActiveId(demo.id);
      },
    }),
    [status, project, projects, today, apply, commit, activate, refreshIndex],
  );

  return <ProjectContext.Provider value={store}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectStore {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
