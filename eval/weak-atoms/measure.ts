// Scores weak-number matching rules against the hand labels in labels.json (E2 dev claims only).
// Run from the repo root: node --import tsx eval/weak-atoms/measure.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { atomHit, isWeak, loadRules, normalise, parseNumbers, sameNumber } from "../../packages/pz/src/rules/index.ts";

type Atom = { number: string; subjectLemma: string; unit: string | null };
const atoms: Record<string, Atom> = JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8"));
const labels: { claim: string; sentence: string; statesClaim: boolean }[] = JSON.parse(readFileSync("eval/weak-atoms/labels.json", "utf8"));

const toAtoms = (a: Atom) => ({ number: { raw: a.number, canonical: a.number }, unit: a.unit, subjectLemma: a.subjectLemma,
  population: null, time: null, hedge: null, namedSource: null, variants: [] });

// Word positions: index of the word that contains each character offset.
function words(text: string) {
  const list = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}.,%']*/gu)].map((m) => ({ start: m.index, end: m.index + m[0].length, w: m[0].toLowerCase() }));
  const at = (offset: number) => list.findIndex((x) => offset >= x.start && offset < x.end);
  return { list, at };
}

type Rule = (sentence: string, a: Atom) => boolean;

// atomHit as it was on main (03e1e8d) before #59: a weak number needs the subject anywhere in the sentence.
const before: Rule = (sentence, a) => {
  const target = parseNumbers(a.number).numbers[0]!;
  const text = normalise(sentence);
  const hits = parseNumbers(text).numbers.filter((n) => sameNumber(n, target).equal);
  if (hits.length === 0) return false;
  if (hits.some((n) => !isWeak(n) && !isWeak(target))) return true;
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${a.subjectLemma}`, "iu").test(text);
};
const rulesJson = loadRules();
const after: Rule = (s, a) => atomHit(s, toAtoms(a), rulesJson.weakNumberMinSigDigits, rulesJson.weakNumberMaxCommas);
const current = before;
function strict(test: (ctx: { w: ReturnType<typeof words>; n: number; a: Atom }) => boolean): Rule {
  return (s, a) => {
    const target = parseNumbers(a.number).numbers[0]!;
    if (!isWeak(target)) return current(s, a);
    const t = normalise(s);
    const w = words(t);
    return parseNumbers(t).numbers.filter((x) => sameNumber(x, target).equal).some((x) => test({ w, n: w.at(x.start), a }));
  };
}
const near = (k: number) => ({ w, n, a }: { w: ReturnType<typeof words>; n: number; a: Atom }) =>
  w.list.some((x, i) => i !== n && Math.abs(i - n) <= k && x.w.startsWith(a.subjectLemma.toLowerCase()));
const unitNext = ({ w, n, a }: { w: ReturnType<typeof words>; n: number; a: Atom }) =>
  !!a.unit && [1, 2].some((d) => w.list[n + d]?.w.startsWith(a.unit!.toLowerCase().replace(/s$/, "")));

// Same clause: no "|", ";", ":", "(" or ")" and at most one comma between the number and the subject word.
const clause = (maxCommas: number, blockSemicolon: boolean) => ({ w, n, a }: { w: ReturnType<typeof words>; n: number; a: Atom }, t: string) =>
  w.list.some((x, i) => {
    if (i === n || !x.w.startsWith(a.subjectLemma.toLowerCase())) return false;
    const [lo, hi] = i < n ? [x.end, w.list[n]!.start] : [w.list[n]!.end, x.start];
    const between = t.slice(lo, hi);
    return !(blockSemicolon ? /[|;:()\[\]]/ : /[|:()\[\]]/).test(between) && (between.match(/,/g) ?? []).length <= maxCommas;
  });
const sameClause = clause(1, true);
const URL = /\bhttps?:\/\/\S+/g;
function strictT(test: (ctx: { w: ReturnType<typeof words>; n: number; a: Atom }, t: string) => boolean, dropUrls = false): Rule {
  return (s, a) => {
    const target = parseNumbers(a.number).numbers[0]!;
    const t = normalise(dropUrls ? s.replace(URL, " ") : s);
    if (!isWeak(target)) return current(t, a);
    const w = words(t);
    return parseNumbers(t).numbers.filter((x) => sameNumber(x, target).equal).some((x) => test({ w, n: w.at(x.start), a }, t));
  };
}

const rules: Record<string, Rule> = { "before (main 03e1e8d)": before, "after (this PR)": after };
rules["before, no URLs"] = (s, a) => before(s.replace(URL, " "), a);
rules["same clause"] = strictT(sameClause);
rules["same clause, no URLs"] = strictT(sameClause, true);
for (const c of [1, 2, 3]) for (const semi of [true, false])
  rules[`clause commas<=${c}${semi ? "" : ", ; allowed"}, no URLs`] = strictT(clause(c, semi), true);
for (const k of [8, 10, 12]) rules[`clause+window ${k}, no URLs`] = strictT((c, t) => sameClause(c, t) && near(k)(c), true);
for (const k of [2, 3, 4, 5, 6, 8, 10]) rules[`window ${k}`] = strict((c) => near(k)(c));
rules["unit"] = strict((c) => (c.a.unit ? unitNext(c) : near(1e9)(c)));
for (const k of [3, 4, 5, 6, 8]) rules[`unit or window ${k}`] = strict((c) => unitNext(c) || near(k)(c));

const weakOnly = process.argv.includes("--weak");
const rows = labels.filter((l) => !weakOnly || isWeak(parseNumbers(atoms[l.claim]!.number).numbers[0]!));
console.log(weakOnly ? "weak-number claims only" : "all claims");
console.log("rule".padEnd(30), "hits  false  missed   (of", rows.filter((l) => l.statesClaim).length, "true,", rows.filter((l) => !l.statesClaim).length, "false)");
for (const [name, rule] of Object.entries(rules)) {
  let hit = 0, falseHit = 0, missed = 0;
  for (const l of rows) {
    const r = rule(l.sentence, atoms[l.claim]!);
    if (r && l.statesClaim) hit++; else if (r) falseHit++; else if (l.statesClaim) missed++;
  }
  console.log(name.padEnd(30), String(hit).padStart(4), String(falseHit).padStart(6), String(missed).padStart(7));
}

if (process.argv.includes("--diff")) {
  const [a, b] = [process.argv[process.argv.indexOf("--diff") + 1]!, process.argv[process.argv.indexOf("--diff") + 2]!];
  for (const l of rows) {
    const [ra, rb] = [rules[a]!(l.sentence, atoms[l.claim]!), rules[b]!(l.sentence, atoms[l.claim]!)];
    if (ra !== rb) console.log(`${l.statesClaim ? "TRUE " : "FALSE"} ${a}=${ra} ${b}=${rb} | ${l.sentence.slice(0, 140)}`);
  }
}

if (process.argv.includes("--per-claim")) {
  const all = JSON.parse(execFileSync("git", ["show", "origin/AnoopIbrampur/dev-claims:eval/dev-claims.json"], { encoding: "utf8" })) as { id: string }[];
  console.log("| Claim | Weak number | Sentences (true / false) | Before: hits / false / missed | After: hits / false / missed |");
  console.log("|---|---|---|---|---|");
  for (const { id } of all) {
    const a = atoms[id];
    const ls = labels.filter((l) => l.claim === id);
    if (!a || ls.length === 0) { console.log(`| ${id} | | 0 | not measured | not measured |`); continue; }
    const score = (r: Rule) => {
      let h = 0, f = 0, m = 0;
      for (const l of ls) { const x = r(l.sentence, a); if (x && l.statesClaim) h++; else if (x) f++; else if (l.statesClaim) m++; }
      return `${h} / ${f} / ${m}`;
    };
    const weak = isWeak(parseNumbers(a.number).numbers[0]!) ? `yes (${a.number})` : `no (${a.number})`;
    console.log(`| ${id} | ${weak} | ${ls.length} (${ls.filter((l) => l.statesClaim).length} / ${ls.filter((l) => !l.statesClaim).length}) | ${score(before)} | ${score(after)} |`);
  }
}
