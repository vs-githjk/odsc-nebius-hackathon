import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// T95: `pz doctor` explains the setup in plain lines, each OK, MISSING or SKIPPED with the exact fix. It never prints
// a key's value, only whether it is set. It makes no network call unless asked (--network), and then only for a key
// that is set: one free request per service, reported by status code alone.

export type Status = "OK" | "MISSING" | "SKIPPED";
export type DoctorLine = { status: Status; check: string; detail: string; fix?: string };
export type DoctorDeps = {
  root: string;
  env: Record<string, string | undefined>;
  nodeVersion: string;
  network?: boolean;
  fetch?: typeof fetch;
};

const KEYS = [
  { name: "NEBIUS_API_KEY", service: "Token Factory", used: "typed questions, fingerprint and the card sentence in live traces" },
  { name: "TAVILY_API_KEY", service: "Tavily", used: "search and page extraction in live traces" },
] as const;

// One free request each: listing models costs no tokens, and Tavily's usage endpoint costs no credits.
const PINGS: Record<(typeof KEYS)[number]["name"], { url: string }> = {
  NEBIUS_API_KEY: { url: "https://api.tokenfactory.nebius.com/v1/models" },
  TAVILY_API_KEY: { url: "https://api.tavily.com/usage" },
};

const isSet = (v: string | undefined) => !!v && v.trim().length > 0;

function nodeLine(root: string, version: string): DoctorLine {
  const engines = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { engines?: { node?: string } }).engines?.node ?? ">=24";
  const want = Number(engines.match(/\d+/)?.[0] ?? 24);
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return major >= want
    ? { status: "OK", check: "Node", detail: `${version} (package.json asks for ${engines})` }
    : { status: "MISSING", check: "Node", detail: `${version}, package.json asks for ${engines}; the keyless checks still run on 22`, fix: `install Node ${want} (for example: nvm install ${want})` };
}

// node_modules matches package-lock.json when every package the lock requires (optional ones aside, since npm skips
// other platforms' builds) is installed at the locked version.
function installLine(root: string): DoctorLine {
  const fix = "run npm ci in the repo root";
  const hidden = join(root, "node_modules/.package-lock.json");
  if (!existsSync(hidden)) return { status: "MISSING", check: "npm ci", detail: "node_modules is not installed", fix };
  type Lock = { packages: Record<string, { version?: string; optional?: boolean }> };
  const lock = (JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as Lock).packages;
  const installed = (JSON.parse(readFileSync(hidden, "utf8")) as Lock).packages;
  const stale = Object.entries(lock).filter(([path, p]) => path && !p.optional && installed[path]?.version !== p.version);
  return stale.length
    ? { status: "MISSING", check: "npm ci", detail: `${stale.length} package(s) differ from package-lock.json, for example ${stale[0]![0]}`, fix }
    : { status: "OK", check: "npm ci", detail: "node_modules matches package-lock.json" };
}

async function pingLine(key: (typeof KEYS)[number], deps: DoctorDeps): Promise<DoctorLine> {
  const check = `${key.service} reachable`;
  if (!isSet(deps.env[key.name])) return { status: "SKIPPED", check, detail: `${key.name} is not set` };
  if (!deps.network) return { status: "SKIPPED", check, detail: "no network check by default", fix: "run pz doctor --network (one free request per service)" };
  try {
    const res = await (deps.fetch ?? fetch)(PINGS[key.name].url, { headers: { Authorization: `Bearer ${deps.env[key.name]!.trim()}` }, signal: AbortSignal.timeout(10_000) });
    return res.ok
      ? { status: "OK", check, detail: `HTTP ${res.status}` }
      : { status: "MISSING", check, detail: `HTTP ${res.status}`, fix: res.status === 401 || res.status === 403 ? `check ${key.name} in .env` : `try again later; ${key.service} answered ${res.status}` };
  } catch (err) {
    return { status: "MISSING", check, detail: `no answer (${err instanceof Error ? err.name : "error"})`, fix: "check your connection, then run pz doctor --network again" };
  }
}

export async function runDoctor(deps: DoctorDeps): Promise<{ code: number; lines: DoctorLine[] }> {
  const lines: DoctorLine[] = [nodeLine(deps.root, deps.nodeVersion), installLine(deps.root)];
  for (const key of KEYS) {
    lines.push(isSet(deps.env[key.name])
      ? { status: "OK", check: key.name, detail: `set (${key.service}: ${key.used})` }
      : { status: "MISSING", check: key.name, detail: `not set; only live traces need it (${key.service}: ${key.used})`, fix: `copy .env.example to .env and fill ${key.name}` });
  }
  for (const key of KEYS) lines.push(await pingLine(key, deps));
  const live = KEYS.every((k) => isSet(deps.env[k.name]));
  lines.push({
    status: "OK", check: "stages",
    detail: live
      ? "keys set: search, extraction and typed questions can run live; dating rules, the decision table and pz verify are code and need no key"
      : "replay only: search and extraction (Tavily) and typed questions (Token Factory) come from recordings; dating rules, the decision table and pz verify are code and run here with no key",
  });
  // Only a missing install blocks the keyless checks; missing keys and an older Node are reported, not fatal.
  return { code: lines.some((l) => l.check === "npm ci" && l.status === "MISSING") ? 1 : 0, lines };
}

export function formatDoctor(lines: DoctorLine[]): string[] {
  return lines.map((l) => `${l.status.padEnd(8)}${l.check}: ${l.detail}${l.fix ? `. Fix: ${l.fix}.` : ""}`);
}
