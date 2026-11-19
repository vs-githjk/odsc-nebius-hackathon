import { createHash } from "node:crypto";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const micros = (usd: number) => Math.ceil(usd * 1e6);
export const liveEnabled = (value: string | null | undefined) => !["0", "false", "off", "no"].includes(value?.trim().toLowerCase() ?? "");
export type Admission = { id: string; ip: string; hour: number; day: number; perIp: number; perDay: number; cap: number; amount: number };
export interface LiveStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
  admit(input: Admission): Promise<"ok" | "cap" | "rate_limit" | "disabled">;
  settle(id: string, actual: number): Promise<void>;
}
// Admission, counters and reservation are one transaction across all function instances.
export const ADMIT = `
local enabled = string.lower((redis.call('GET','pz:live_enabled') or ''):match('^%s*(.-)%s*$'))
if enabled == '0' or enabled == 'false' or enabled == 'off' or enabled == 'no' then return 'disabled' end
local spent = tonumber(redis.call('GET',KEYS[1]) or '0')
if spent + tonumber(ARGV[1]) > tonumber(ARGV[2]) then return 'cap' end
if tonumber(redis.call('GET',KEYS[2]) or '0') >= tonumber(ARGV[3]) or tonumber(redis.call('GET',KEYS[3]) or '0') >= tonumber(ARGV[4]) then return 'rate_limit' end
redis.call('INCRBY',KEYS[1],ARGV[1])
redis.call('SET',KEYS[4],ARGV[1])
if redis.call('INCR',KEYS[2]) == 1 then redis.call('EXPIRE',KEYS[2],7200) end
if redis.call('INCR',KEYS[3]) == 1 then redis.call('EXPIRE',KEYS[3],172800) end
return 'ok'`;
export const SETTLE = `
local reserved = redis.call('GET',KEYS[2])
if not reserved then return 0 end
redis.call('INCRBY',KEYS[1],tonumber(ARGV[1])-tonumber(reserved))
redis.call('DEL',KEYS[2])
return 1`;
export function redisStore(url: string, token: string, transport: typeof fetch): LiveStore {
  async function command(args: (string | number)[]): Promise<unknown> {
    const response = await transport(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    if (!response.ok) throw new Error("store_unavailable");
    const data = await response.json() as { result?: unknown; error?: unknown };
    if (data.error || !("result" in data)) throw new Error("store_unavailable");
    return data.result;
  }
  return {
    async get(key) { const value = await command(["GET", key]); return value === null ? null : String(value); },
    async set(key, value, ttl) { await command(["SET", key, value, "EX", ttl]); },
    async admit(a) {
      const result = await command(["EVAL", ADMIT, 4, "pz:spent_micros", `pz:ip:${a.ip}:${a.hour}`, `pz:day:${a.day}`, `pz:reservation:${a.id}`, a.amount, a.cap, a.perIp, a.perDay]);
      if (result !== "ok" && result !== "cap" && result !== "rate_limit" && result !== "disabled") throw new Error("store_unavailable");
      return result;
    },
    async settle(id, actual) { await command(["EVAL", SETTLE, 2, "pz:spent_micros", `pz:reservation:${id}`, actual]); },
  };
}

export function memoryStore(now = Date.now): LiveStore {
  const values = new Map<string, { value: string; expires: number }>();
  const get = (key: string) => { const v = values.get(key); return v && v.expires > now() ? v.value : null; };
  const put = (key: string, value: string, ttl = Infinity) => { values.set(key, { value, expires: now() + ttl * 1000 }); };
  return {
    async get(key) { return get(key); }, async set(key, value, ttl) { put(key, value, ttl); },
    async admit(a) {
      if (!liveEnabled(get("pz:live_enabled"))) return "disabled";
      const spent = Number(get("pz:spent_micros") ?? 0);
      if (spent + a.amount > a.cap) return "cap";
      const ip = `pz:ip:${a.ip}:${a.hour}`, day = `pz:day:${a.day}`;
      if (Number(get(ip) ?? 0) >= a.perIp || Number(get(day) ?? 0) >= a.perDay) return "rate_limit";
      put("pz:spent_micros", String(spent + a.amount)); put(`pz:reservation:${a.id}`, String(a.amount));
      put(ip, String(Number(get(ip) ?? 0) + 1), 7200); put(day, String(Number(get(day) ?? 0) + 1), 172800);
      return "ok";
    },
    async settle(id, actual) {
      const key = `pz:reservation:${id}`, reserved = get(key);
      if (reserved === null) return;
      put("pz:spent_micros", String(Number(get("pz:spent_micros")) + actual - Number(reserved))); values.delete(key);
    },
  };
}
