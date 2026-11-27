// Loads the generated game data into the app, checked against the schema.
import ammoFile from "../../data/ammo.json";
import armor from "../../data/armor.json";
import factions from "../../data/factions.json";
import tables from "../../data/tables.json";
import weapons from "../../data/weapons.json";
import { Dataset } from "../data/schema.ts";

export const data: Dataset = Dataset.parse({
  weapons,
  ammo: ammoFile.calibers,
  ammoVariants: ammoFile.variants,
  armor,
  factions,
  tables,
});

export const ammoById = new Map(data.ammo.map((a) => [a.id, a]));
export const weaponById = new Map(data.weapons.map((w) => [w.id, w]));
export const armorById = new Map(data.armor.map((a) => [a.id, a]));
