import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Profile, Student } from "./types";

export type Theme = "system" | "light" | "dark";
export type Language = "en" | "hinglish" | "roman-punjabi";

export interface Settings {
  theme: Theme;
  language: Language;
  reduceMotion: boolean;
  aiEnabled: boolean;
  notifications: {
    notices: boolean;
    exams: boolean;
    study: boolean;
  };
  installDismissed: boolean;
}

interface Persisted {
  profile: Profile | null;
  settings: Settings;
  bookmarks: {
    papers: string[];
    places: string[];
    people: string[];
    notices: string[];
  };
  recent: {
    searches: string[];
    places: string[];
    people: string[];
    papers: string[];
  };
  chat: { role: "user" | "assistant"; text: string; at: number }[];
}

const KEY = "gndec-compass-v2";

const defaults: Persisted = {
  profile: null,
  settings: {
    theme: "system",
    language: "en",
    reduceMotion: false,
    aiEnabled: false,
    notifications: { notices: true, exams: true, study: false },
    installDismissed: false,
  },
  bookmarks: { papers: [], places: [], people: [], notices: [] },
  recent: { searches: [], places: [], people: [], papers: [] },
  chat: [],
};

function read(): Persisted {
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      profile: parsed.profile ?? null,
      settings: { ...defaults.settings, ...(parsed.settings || {}), notifications: { ...defaults.settings.notifications, ...(parsed.settings?.notifications || {}) } },
      bookmarks: { ...defaults.bookmarks, ...(parsed.bookmarks || {}) },
      recent: { ...defaults.recent, ...(parsed.recent || {}) },
      chat: Array.isArray(parsed.chat) ? parsed.chat.slice(-40) : [],
    };
  } catch {
    return defaults;
  }
}

interface StoreValue {
  profile: Profile | null;
  settings: Settings;
  bookmarks: Persisted["bookmarks"];
  recent: Persisted["recent"];
  chat: Persisted["chat"];
  setProfile: (profile: Profile | null) => void;
  profileFromStudent: (student: Student) => Profile;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleBookmark: (kind: keyof Persisted["bookmarks"], id: string) => void;
  isBookmarked: (kind: keyof Persisted["bookmarks"], id: string) => boolean;
  addRecent: (kind: keyof Persisted["recent"], value: string) => void;
  setChat: (chat: Persisted["chat"]) => void;
  exportData: () => string;
  reset: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && systemDark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#070b14" : "#f6f7fb");
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage can be full or blocked */
    }
  }, [state]);

  useEffect(() => {
    applyTheme(state.settings.theme);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(state.settings.theme);
    media?.addEventListener?.("change", onChange);
    return () => media?.removeEventListener?.("change", onChange);
  }, [state.settings.theme]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = state.settings.reduceMotion ? "true" : "false";
  }, [state.settings.reduceMotion]);

  const setProfile = useCallback((profile: Profile | null) => {
    setState((s) => ({ ...s, profile }));
  }, []);

  const profileFromStudent = useCallback((student: Student): Profile => ({
    crn: student.crn,
    name: student.name,
    branch: student.branch,
    year: student.year,
    section: student.section,
    subsection: student.subsection,
    role: "student",
    createdAt: new Date().toISOString(),
  }), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch, notifications: { ...s.settings.notifications, ...(patch.notifications || {}) } } }));
  }, []);

  const toggleBookmark = useCallback((kind: keyof Persisted["bookmarks"], id: string) => {
    setState((s) => {
      const list = s.bookmarks[kind];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, 100);
      return { ...s, bookmarks: { ...s.bookmarks, [kind]: next } };
    });
  }, []);

  const isBookmarked = useCallback((kind: keyof Persisted["bookmarks"], id: string) => state.bookmarks[kind].includes(id), [state.bookmarks]);

  const addRecent = useCallback((kind: keyof Persisted["recent"], value: string) => {
    if (!value) return;
    setState((s) => {
      const list = [value, ...s.recent[kind].filter((x) => x !== value)].slice(0, 8);
      return { ...s, recent: { ...s.recent, [kind]: list } };
    });
  }, []);

  const setChat = useCallback((chat: Persisted["chat"]) => setState((s) => ({ ...s, chat: chat.slice(-40) })), []);

  const exportData = useCallback(() => JSON.stringify(state, null, 2), [state]);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setState({ ...defaults, settings: { ...defaults.settings } });
  }, []);

  const value = useMemo<StoreValue>(() => ({
    profile: state.profile,
    settings: state.settings,
    bookmarks: state.bookmarks,
    recent: state.recent,
    chat: state.chat,
    setProfile,
    profileFromStudent,
    updateSettings,
    toggleBookmark,
    isBookmarked,
    addRecent,
    setChat,
    exportData,
    reset,
  }), [state, setProfile, profileFromStudent, updateSettings, toggleBookmark, isBookmarked, addRecent, setChat, exportData, reset]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
