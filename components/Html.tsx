"use client";

import { Html as DreiHtml } from "@react-three/drei";
import { useEffect, useState, type ComponentProps } from "react";

// R3F mounts the scene inside React DOM's commit, and drei's Html unmounting its own root there (when R3F
// connects events, or on StrictMode's effect replay) logs a React error. Mount it in a later task instead.
export default function Html(props: ComponentProps<typeof DreiHtml>) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true));
    return () => clearTimeout(id);
  }, []);
  return ready ? <DreiHtml {...props} /> : null;
}
