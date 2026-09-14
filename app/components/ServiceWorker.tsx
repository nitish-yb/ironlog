"use client";

import { useEffect } from "react";

const APP_SHELL_VERSION = "v21";

export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;
    const reloadKey = "ironlog:service-worker-reload";
    const onControllerChange = () => {
      if (disposed || sessionStorage.getItem(reloadKey) === APP_SHELL_VERSION) return;
      sessionStorage.setItem(reloadKey, APP_SHELL_VERSION);
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register(`/sw.js?app=${APP_SHELL_VERSION}`, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
