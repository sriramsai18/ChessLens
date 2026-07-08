import { useEffect, useState } from "react";

/** Returns true only after mount — use to skip SSR of browser-only components. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
