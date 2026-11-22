// Launch Radar's model: one sealed snapshot of the protocol universe in,
// one ranked board of pre-token protocols out.
//
// Nothing here is a hand-kept list of names. Every number the model uses is
// derived from the snapshot's own figures at run time:
//
//   multiple   the category's own market multiple: the median mcap/TVL of
//              the live-token protocols in that category (at least 3 comps,
//              else the global median), clamped to [0.05, 1.5]
//   growth     the protocol's 7-day TVL change, clamped to [-60, 120]%
//   maturity   0.6 + min(age_days, 1095) / 1095 * 0.4 (unknown age: 365)
//   launch     the age cohort's own token rate: among protocols of the same
//              age band, the share that already record a token, read from
//              the snapshot itself (0.26 for the youngest band, 0.79 for
//              the oldest here), damped to 0.5 + 0.5 * rate
//
//   implied = TVL x multiple x (1 + growth/100 * 0.5) x maturity x launch
//
// The board ranks every rankable pre-token protocol in the snapshot: the
// whole watchlist (the floor) plus every other protocol that records no
// token and is not an exchange, a versioned pool, or a wrapped, staked or
// bridged product. Live-token protocols are never ranked; the dashboard
// shows them apart, at the market's own values, as the comparables the
// multiples come from.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard and changeable there. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_comps: number;
  launch_damp: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_comps: 3,
  launch_damp: 0.5,
};

export const MODEL_VERSION = 'launch-radar-1';

/** Age bands for the launch curve: [lo_days, hi_days, label]. */
export const AGE_BANDS: Array<[number, number, string]> = [
  [0, 180, '0-6mo'],
  [180, 365, '6-12mo'],
  [365, 730, '1-2y'],
  [730, 1095, '2-3y'],
  [1095, Number.POSITIVE_INFINITY, '3y+'],
];

/** One category's calibration: its multiple and the comps behind it. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comps: number;
  median_raw: number;
}

/** Everything the snapshot itself teaches the model, computed at run time. */
export interface Calibration {
  global_multiple: number;
  global_comps: number;
  global_token_rate: number;
  by_category: CategoryMultiple[];
  age_curve: Array<{ band: string; rate: number; n: number }>;
}

/** A farm step: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_source: string;
    multiple_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    launch_factor: number;
    launch_rate: number;
    age_band: string;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  multiple_source: string;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_factor: number;
  launch_rate: number;
  age_band: string;
  farm_steps: string[];
}

/** A live-token protocol, shown apart at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  ratio: number;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list, else `fallback`. */
export function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol's record carries a token at all. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol is pre-token: its record carries no token. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return !hasToken(p);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are never a launch of their own. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol name must not begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is one the board may rank. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The age band a protocol's age falls in, or null when its age is unknown. */
export function ageBand(age: number | null): string | null {
  if (age === null) return null;
  for (const [lo, hi, label] of AGE_BANDS) {
    if (age >= lo && age < hi) return label;
  }
  return AGE_BANDS[AGE_BANDS.length - 1]![2];
}

/**
 * Calibrate the model from the snapshot itself: category multiples from the
 * live-token comps, and the launch curve from the token rate of each age band.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter(
    (p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const allRatios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalRaw = median(allRatios, 0.2);
  const globalMultiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, globalRaw));

  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const categories: CategoryMultiple[] = [];
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ratios.length < model.min_comps) continue;
    const raw = median(ratios, globalRaw);
    categories.push({
      category,
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw)),
      comps: ratios.length,
      median_raw: round4(raw),
    });
  }

  const knownAge = snapshot.protocols
    .map((p) => ({ p, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((x) => x.age !== null);
  const globalTokenRate = knownAge.length === 0 ? 0.5 : knownAge.filter((x) => hasToken(x.p)).length / knownAge.length;
  const ageCurve = AGE_BANDS.map(([lo, hi, band]) => {
    const cohort = knownAge.filter((x) => x.age! >= lo && x.age! < hi);
    const rate = cohort.length === 0 ? globalTokenRate : cohort.filter((x) => hasToken(x.p)).length / cohort.length;
    return { band, rate: round4(rate), n: cohort.length };
  });

  return { global_multiple: round4(globalMultiple), global_comps: live.length, global_token_rate: round4(globalTokenRate), by_category: categories, age_curve: ageCurve };
}

/** The multiple a protocol gets: its category's, else the global one. */
export function multipleFor(p: SnapshotProtocol, cal: Calibration): { multiple: number; source: string; comps: number } {
  const hit = cal.by_category.find((c) => c.category === (p.category ?? 'Uncategorised'));
  if (hit !== undefined) return { multiple: hit.multiple, source: hit.category, comps: hit.comps };
  return { multiple: cal.global_multiple, source: 'global', comps: cal.global_comps };
}

/** The launch factor a protocol gets from its age band's token rate. */
export function launchFactor(age: number | null, cal: Calibration, model: ModelConstants = MODEL): { factor: number; band: string; rate: number } {
  const band = ageBand(age);
  const row = band === null ? undefined : cal.age_curve.find((r) => r.band === band);
  const rate = row === undefined ? cal.global_token_rate : row.rate;
  return { factor: round4(model.launch_damp + (1 - model.launch_damp) * rate), band: band ?? 'unknown', rate };
}

/** The implied value one protocol gets, with every factor shown. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  cal: Calibration,
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  multipleSource: string;
  multipleComps: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  launch: number;
  launchRate: number;
  band: string;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const { multiple, source, comps } = multipleFor(p, cal);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { factor: launch, band, rate: launchRate } = launchFactor(age, cal, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * launch));
  return { implied, multiple, multipleSource: source, multipleComps: comps, growthPct, growthMult: round4(growthMult), maturityMult: round4(maturityMult), launch, launchRate, band, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; cal: Calibration } {
  const cal = calibrate(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names.
  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((x) => x.slug === slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, cal, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      multiple: s.v.multiple,
      multiple_source: s.v.multipleSource,
      multiple_comps: s.v.multipleComps,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
      launch_factor: s.v.launch,
      launch_rate: s.v.launchRate,
      age_band: s.v.band,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
  return { board, cal };
}

/** A step as one string: action, cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('aggregator')) return `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and leave it compounding.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('privac')) return `Deposit $${capital} through ${name}'s private pool on ${chain} and keep the note.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, lighter interaction for the same protocol, by category. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex')) return `Swap a small amount on ${name} once a week so the wallet shows real trading activity, not only a deposit.`;
  if (c.includes('lend') || c.includes('cdp')) return `Borrow a small amount against the supply once, then repay it, so the wallet shows both sides of the market.`;
  if (c.includes('bridge')) return `Bridge back a small amount a week later so the wallet shows two-way use.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen the hedge once a month so the wallet shows ongoing use.`;
  return `Use ${name}'s app once a week on ${chain} — one small deposit, claim or vote — so the wallet shows ongoing use, not a single deposit.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const otherChain = p.chains.length > 1 ? p.chains[1]! : null;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: 'about $1-3 of gas a week',
      time: '10 minutes a week',
    },
    {
      text:
        otherChain === null
          ? `Check ${p.name}'s own page and docs for a points program, quest or leaderboard, and join it with the same wallet.`
          : `Repeat the core position once on ${otherChain} with half the capital, and check ${p.name}'s page for a points program or quest.`,
      cost: otherChain === null ? 'no extra capital' : `about $${Math.round(capital / 2)} of capital`,
      time: '20 minutes',
    },
    {
      text: `Hold the position for at least ${hold} days and do not move the funds between wallets; airdrop snapshots usually reward age and consistency over size.`,
      cost: 'no extra cost',
      time: `${hold} days of holding`,
    },
    {
      text: `Keep a note of every deposit, date and wallet address, and watch ${p.name}'s announcements for a token or snapshot date before moving anything.`,
      cost: 'no extra cost',
      time: '5 minutes a week',
    },
  ];
}

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Build the dashboard's data from the board and the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, cal } = buildBoard(snapshot, model);
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      ratio: round4(p.mcap_usd! / p.tvl_usd),
    }));
  const watch = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    calibration: cal,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      on_watchlist: r.on_watchlist,
      implied_value_usd: r.implied_value_usd,
      multiple: r.model.multiple,
      multiple_source: r.model.multiple_source,
      growth_pct: r.model.growth_pct,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      launch_factor: r.model.launch_factor,
      launch_rate: r.model.launch_rate,
      age_band: r.model.age_band,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** The dashboard's data as a script the page loads: `window.RADAR = {...}`. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Parse and lightly validate the snapshot document. */
export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new Error('snapshot is not a {protocols, watchlist} document');
  }
  return doc;
}

/**
 * The gate's own checks, run here before writing: null when the board is
 * valid, else the first problem found.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, needs 100 to 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!slugs.has(row.slug)) return `row ${i + 1}: slug ${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `row ${i + 1}: slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${i + 1}: rank is ${row.rank}, needs ${i + 1}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${i + 1}: implied value ${row.implied_value_usd} is not a positive whole number`;
    if (row.implied_value_usd > 100_000_000_000_000) return `row ${i + 1}: implied value over the cap`;
    if (row.implied_value_usd > prev) return `row ${i + 1}: implied value rises as rank ascends`;
    prev = row.implied_value_usd;
    if (typeof row.name !== 'string' || row.name.length === 0) return `row ${i + 1}: name is empty`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${i + 1}: farm_steps holds ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 0} steps, needs 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${i + 1}: a farm step is ${len} characters, needs 20 to 600`;
    }
  }
  if (board.length >= 2 && new Set(board.map((r) => r.implied_value_usd)).size === 1) {
    return 'every implied value is the same: the board ranks nothing';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
