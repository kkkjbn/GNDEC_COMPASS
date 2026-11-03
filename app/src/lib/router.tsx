import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

type RouterValue = {
  path: string;
  query: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
  back: () => void;
};

const RouterContext = createContext<RouterValue | null>(null);

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  // Older versions of the app used hash routing. Keep those links working.
  if (window.location.hash.startsWith("#/")) {
    const legacy = window.location.hash.slice(1);
    window.history.replaceState({}, "", legacy);
  }
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => ({ path: currentPath(), search: typeof window === "undefined" ? "" : window.location.search }));

  useEffect(() => {
    const onPop = () => setState({ path: currentPath(), search: window.location.search });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean; scroll?: boolean }) => {
    const url = new URL(to, window.location.origin);
    const next = url.pathname.replace(/\/+$/, "") || "/";
    if (opts?.replace) window.history.replaceState({}, "", `${next}${url.search}`);
    else window.history.pushState({}, "", `${next}${url.search}`);
    setState({ path: next, search: url.search });
    if (opts?.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;
      if (anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
      event.preventDefault();
      navigate(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  const value = useMemo<RouterValue>(() => ({
    path: state.path,
    query: new URLSearchParams(state.search),
    navigate,
    back: () => window.history.back(),
  }), [state.path, state.search, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter must be used inside RouterProvider");
  return value;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
