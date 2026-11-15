import { setConsoleFunction } from "three";

// @react-three/fiber 9, the latest stable release, still times frames with THREE.Clock, which three r183+
// warns about on every Canvas. Only that notice is dropped; three's other messages reach the console as usual.
setConsoleFunction((type: "log" | "warn" | "error", message: string, ...params: unknown[]) => {
  if (type === "warn" && message.startsWith("THREE.Clock: This module has been deprecated")) return;
  console[type](message, ...params);
});
