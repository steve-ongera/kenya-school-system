// hooks/useFullscreen.js
import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "app:fullscreen-preference";

function isCurrentlyFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function requestFs(el) {
  const fn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen;
  if (fn) return fn.call(el);
  return Promise.reject(new Error("Fullscreen API not supported"));
}

function exitFs() {
  const fn =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;
  if (fn) return fn.call(document);
  return Promise.resolve();
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(isCurrentlyFullscreen());
  const pendingRef = useRef(false); // waiting for a user gesture to re-enter

  // Keep state in sync with the browser (covers Esc key, F11, etc.)
  useEffect(() => {
    function handleChange() {
      const active = isCurrentlyFullscreen();
      setIsFullscreen(active);
      // Only persist "off" here. Persisting "on" happens in enter(),
      // so a browser-forced exit (Esc) is treated as the user minimizing.
      if (!active) {
        localStorage.setItem(STORAGE_KEY, "false");
        pendingRef.current = false;
      }
    }
    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    document.addEventListener("MSFullscreenChange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
      document.removeEventListener("MSFullscreenChange", handleChange);
    };
  }, []);

  const enter = useCallback(() => {
    return requestFs(document.documentElement)
      .then(() => {
        localStorage.setItem(STORAGE_KEY, "true");
        setIsFullscreen(true);
      })
      .catch(() => {
        // Blocked (no user gesture yet) - remember intent, retry on next interaction
        pendingRef.current = true;
      });
  }, []);

  const exit = useCallback(() => {
    return exitFs().then(() => {
      localStorage.setItem(STORAGE_KEY, "false");
      setIsFullscreen(false);
      pendingRef.current = false;
    });
  }, []);

  const toggle = useCallback(() => {
    if (isCurrentlyFullscreen()) {
      exit();
    } else {
      enter();
    }
  }, [enter, exit]);

  // On reload: if the user left the site maximized, silently re-enter
  // fullscreen on the user's very first click/keypress/tap - browsers
  // refuse to grant fullscreen automatically on load, so this is the
  // earliest point it can happen. No prompt, no banner.
  useEffect(() => {
    const wantsFullscreen = localStorage.getItem(STORAGE_KEY) === "true";
    if (!wantsFullscreen || isCurrentlyFullscreen()) return;

    pendingRef.current = true;

    function tryEnterOnce() {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      requestFs(document.documentElement)
        .then(() => setIsFullscreen(true))
        .catch(() => {
          // still blocked for some reason - leave preference as-is,
          // user can just click the navbar icon
        });
      cleanup();
    }

    function cleanup() {
      window.removeEventListener("click", tryEnterOnce);
      window.removeEventListener("keydown", tryEnterOnce);
      window.removeEventListener("touchstart", tryEnterOnce);
    }

    window.addEventListener("click", tryEnterOnce, { once: true });
    window.addEventListener("keydown", tryEnterOnce, { once: true });
    window.addEventListener("touchstart", tryEnterOnce, { once: true });

    return cleanup;
  }, []);

  return { isFullscreen, toggle, enter, exit };
}