/** Rolls one die with the given number of sides, returning 1..sides. */
export type Roller = (sides: number) => number;

export const randomRoller: Roller = (sides) => 1 + Math.floor(Math.random() * sides);

/**
 * A roller that returns preset values in order, for tests and for entering
 * physical dice rolls. Throws if it runs out or a value can't come from that die.
 */
export function scriptedRoller(values: number[]): Roller & { remaining: () => number } {
  let i = 0;
  const roll = (sides: number) => {
    if (i >= values.length) throw new Error(`Ran out of scripted rolls (needed a d${sides})`);
    const v = values[i++]!;
    if (!Number.isInteger(v) || v < 1 || v > sides) throw new Error(`Scripted roll ${v} can't come from a d${sides}`);
    return v;
  };
  return Object.assign(roll, { remaining: () => values.length - i });
}
