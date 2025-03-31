// utils/debug.js - Công cụ debug

let DEBUG = false;

export function initDebug(debugMode) {
  DEBUG = debugMode;
}

export function debugLog(...args) {
  if (DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}
