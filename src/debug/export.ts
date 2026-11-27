// Debug exports: a player copies a result as a one-line code and sends it; the
// import screen decodes it and replays the attack with the same rolls.
//
// Format 1: "ZC1:" + base64url(UTF-8 JSON of DebugExport) + ".". The final dot
// marks the end, so line wrapping and text after the code don't corrupt it. It carries the setup
// by ID, every roll in the order the engine consumes them, and what the player
// saw, so a replay on a newer version can show whether the answer changed.
import { z } from "zod";
import type { Dataset } from "../data/schema.ts";
import { AttackError, resolveTurn, type AttackInput, type TurnResult } from "../engine/attack.ts";
import { scriptedRoller } from "../engine/dice.ts";
import { DEFAULT_SETTINGS, type RuleSettings } from "../engine/settings.ts";

export const PREFIX = "ZC1:";
export const END = ".";

export const DebugExport = z.object({
  format: z.literal(1),
  app: z.string(),
  build: z.string(),
  /** Fingerprint of the game data the player had (changes when the sheet does). */
  data: z.string(),
  at: z.string(),
  /** Whether the app rolled or the player typed the rolls. */
  rolledBy: z.enum(["app", "player"]),
  input: z.object({
    weapon: z.string(),
    variant: z.string().nullable(),
    body: z.string().nullable(),
    head: z.string().nullable(),
    distanceM: z.number(),
    mounted: z.boolean(),
    pulls: z.array(z.number().int()),
  }),
  /** Each pull's d20, then that pull's damage dice, round by round. */
  rolls: z.array(z.number().int()),
  /** What the player saw: total, and damage of each hit round per pull. */
  seen: z.object({ total: z.number(), rounds: z.array(z.array(z.number())) }),
  note: z.string(),
});
export type DebugExport = z.infer<typeof DebugExport>;

export class ImportError extends Error {}

// --- Encoding ------------------------------------------------------------------
// Hand-rolled so it behaves the same in browsers, Node and React Native.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function utf8Decode(bytes: number[]): string {
  let s = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++]!;
    const cont = () => {
      const x = bytes[i++];
      if (x === undefined || (x & 0xc0) !== 0x80) throw new ImportError("The code is damaged (bad text encoding).");
      return x & 63;
    };
    let c: number;
    if (b < 0x80) c = b;
    else if (b >> 5 === 6) c = ((b & 31) << 6) | cont();
    else if (b >> 4 === 14) c = ((b & 15) << 12) | (cont() << 6) | cont();
    else if (b >> 3 === 30) c = ((b & 7) << 18) | (cont() << 12) | (cont() << 6) | cont();
    else throw new ImportError("The code is damaged (bad text encoding).");
    s += String.fromCodePoint(c);
  }
  return s;
}

export function base64url(bytes: number[]): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (b !== undefined) s += B64[(n >> 6) & 63]!;
    if (c !== undefined) s += B64[n & 63]!;
  }
  return s;
}

export function fromBase64url(s: string): number[] {
  if (s.length % 4 === 1) throw new ImportError("The code is incomplete. Copy the whole line.");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new ImportError(`The code has a character that doesn't belong: "${ch}".`);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return out;
}

export function encodeExport(e: DebugExport): string {
  return PREFIX + base64url(utf8Encode(JSON.stringify(e))) + END;
}

/** Accepts the code with surrounding text or line breaks a messaging app may add. */
export function decodeExport(text: string): DebugExport {
  const at = text.indexOf(PREFIX);
  if (at < 0) throw new ImportError(`That isn't a debug export. It should start with ${PREFIX}`);
  const tail = text.slice(at + PREFIX.length);
  const end = tail.indexOf(END);
  // Without the end dot, fall back to the unbroken run of code characters.
  const body = end >= 0 ? tail.slice(0, end).replace(/\s+/g, "") : tail.match(/^[A-Za-z0-9_-]*/)![0];
  let json: unknown;
  try {
    json = JSON.parse(utf8Decode(fromBase64url(body)));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("The code is damaged or incomplete. Copy the whole line.");
  }
  const parsed = DebugExport.safeParse(json);
  if (!parsed.success) throw new ImportError("The code decoded, but its contents aren't a format-1 export.");
  return parsed.data;
}

// --- Building and replaying ------------------------------------------------------

/** FNV-1a over the data's JSON: a short fingerprint, not a security hash. */
export function dataFingerprint(data: Dataset): string {
  let h = 0x811c9dc5;
  for (const b of utf8Encode(JSON.stringify(data))) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The rolls a result used, in the order resolveTurn consumes them. */
export function rollsOf(result: TurnResult): number[] {
  return result.pulls.flatMap((p) => [p.d20, ...p.rounds.flatMap((r) => r.dice)]);
}

const seenOf = (r: TurnResult) => ({ total: r.totalDamage, rounds: r.pulls.map((p) => p.rounds.map((x) => x.damage)) });

export function buildExport(args: {
  input: AttackInput;
  result: TurnResult;
  rolledBy: "app" | "player";
  note: string;
  app: string;
  build: string;
  data: Dataset;
  now?: Date;
}): DebugExport {
  const { input, result } = args;
  const slot = (types: string[]) => input.targetArmor.find((a) => types.includes(a.type))?.id ?? null;
  return {
    format: 1,
    app: args.app,
    build: args.build,
    data: dataFingerprint(args.data),
    at: (args.now ?? new Date()).toISOString(),
    rolledBy: args.rolledBy,
    input: {
      weapon: input.weapon.id,
      variant: input.variantId,
      body: slot(DEFAULT_SETTINGS.armorSlots.body),
      head: slot(DEFAULT_SETTINGS.armorSlots.head),
      distanceM: input.distanceM,
      mounted: !!input.mounted,
      pulls: input.pulls,
    },
    rolls: rollsOf(result),
    seen: seenOf(result),
    note: args.note.trim(),
  };
}

export interface Replay {
  input: AttackInput;
  result: TurnResult;
  /** True if this version gets different damage from what the player saw. */
  differs: boolean;
  /** True if the export came from the same game data. */
  sameData: boolean;
}

/** Re-runs an export with the current rules and data. */
export function replayExport(e: DebugExport, data: Dataset, settings?: RuleSettings): Replay {
  const need = <T extends { id: string }>(list: T[], id: string, what: string): T => {
    const x = list.find((i) => i.id === id);
    if (!x) throw new ImportError(`This version's data has no ${what} "${id}".`);
    return x;
  };
  const weapon = need(data.weapons, e.input.weapon, "weapon");
  const input: AttackInput = {
    weapon,
    ammo: need(data.ammo, weapon.ammoId, "ammo"),
    variantId: e.input.variant,
    targetArmor: [e.input.body, e.input.head].flatMap((id) => (id ? [need(data.armor, id, "armor")] : [])),
    distanceM: e.input.distanceM,
    mounted: e.input.mounted,
    pulls: e.input.pulls,
  };
  let result: TurnResult;
  try {
    // A newer rule can need more or fewer dice than were recorded; missing ones show as an error.
    result = resolveTurn(input, { tables: data.tables, ammoVariants: data.ammoVariants, settings, roll: scriptedRoller(e.rolls) });
  } catch (err) {
    if (err instanceof AttackError) throw new ImportError(`This version won't allow that attack: ${err.message}`);
    if (err instanceof Error && /scripted roll/i.test(err.message)) {
      throw new ImportError(`This version needs different dice than were recorded, so it can't replay the attack (${err.message}).`);
    }
    throw err;
  }
  const differs = JSON.stringify(seenOf(result)) !== JSON.stringify(e.seen) || rollsOf(result).length !== e.rolls.length;
  return { input, result, differs, sameData: e.data === dataFingerprint(data) };
}
