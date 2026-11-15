import { appendFileSync, readFileSync, writeFileSync, renameSync, statSync, accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { LOG_PATH } from "./paths.mjs";

export function log(...args) {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${args.join(" ")}\n`);
  } catch {}
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Atomic write so a crash never leaves half a JSON file. */
export function writeJson(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

/** Resolves a command name against PATH (plus Windows extensions). */
export function which(cmd, envPath = process.env.PATH || "") {
  if (cmd.includes("/") || cmd.includes("\\")) return isExecutable(cmd) ? cmd : null;
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of envPath.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      if (isExecutable(full)) return full;
    }
  }
  return null;
}

function isExecutable(p) {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const MAX_STRING = 40_000; // keeps every frame well under Chrome's 1 MB native-messaging cap

/** Deep copy with huge strings (file dumps, base64 images) shortened. */
export function clip(value) {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}\n… [+${value.length - MAX_STRING}]` : value;
  }
  if (Array.isArray(value)) return value.map(clip);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clip(v);
    return out;
  }
  return value;
}

/** Async iterable fed by push(); used as the Agent SDK's streaming input. */
export function inputQueue() {
  const items = [];
  let wake = null;
  let done = false;
  return {
    push(item) {
      items.push(item);
      wake?.();
    },
    end() {
      done = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (items.length) {
          yield items.shift();
          continue;
        }
        if (done) return;
        await new Promise((r) => (wake = r));
        wake = null;
      }
    },
  };
}

/** Text from a list of content blocks (Anthropic or ACP shaped). */
export function blocksText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content?.text ?? "";
  return content
    .map((c) => {
      if (typeof c === "string") return c;
      if (c.type === "text") return c.text;
      if (c.type === "content") return blocksText(c.content);
      if (c.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
