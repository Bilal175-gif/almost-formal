"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const delay = 180;

function messageFor(path: string) {
  if (path === "/shop") return "Loading your store...";
  if (path.startsWith("/product/")) return "Getting your look ready...";
  if (path === "/our-story") return "Getting to know Almost Formal...";
  if (path.includes("collection")) return "Exploring the collection...";
  return "Just a moment...";
}

export function NavigationLoading() {
  const pathname = usePathname();
  const pending = useRef<string | null>(null);
  const currentPath = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Just a moment...");

  useEffect(() => {
    if (pathname !== currentPath.current && pending.current) {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setVisible(false);
    }
    currentPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const stop = () => {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setVisible(false);
    };
    const start = (path: string) => {
      if (pending.current === path) return false;
      if (timer.current) clearTimeout(timer.current);
      pending.current = path;
      setVisible(false);
      setMessage(messageFor(path));
      timer.current = setTimeout(() => {
        if (pending.current === path) setVisible(true);
      }, delay);
      return true;
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (url.pathname.startsWith("/checkout") || url.pathname.startsWith("/admin")) return;
      if (!start(url.pathname)) event.preventDefault();
    };
    const onProgrammatic = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (path && path !== window.location.pathname) start(path);
    };
    const onPopState = () => {
      stop();
      if (window.location.pathname !== document.documentElement.dataset.currentPath) start(window.location.pathname);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("almost-formal:navigate", onProgrammatic);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", stop);
    window.addEventListener("offline", stop);
    window.addEventListener("error", stop);
    window.addEventListener("unhandledrejection", stop);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("almost-formal:navigate", onProgrammatic);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", stop);
      window.removeEventListener("offline", stop);
      window.removeEventListener("error", stop);
      window.removeEventListener("unhandledrejection", stop);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.currentPath = pathname;
  }, [pathname]);

  return (
    <div className={`navigation-loading${visible ? " is-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!visible}>
      <div className="navigation-loading-card">
        <img src="/images/almost-formal-green-logo.webp" alt="" width="88" height="88" />
        <div className="navigation-loading-line" aria-hidden="true" />
        <p>{visible ? message : ""}</p>
        <small>Curating your next look.</small>
        <button type="button" onClick={() => {
          pending.current = null;
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          setVisible(false);
        }}>Dismiss loading screen</button>
      </div>
    </div>
  );
}
