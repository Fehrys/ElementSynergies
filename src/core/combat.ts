import { ElementColor } from './grid';

export interface Character {
  id: string;
  name: string;
  color: ElementColor;
  atk: number;
}

// Exactly 4 characters, 1:1 with the 4 colors — no dead color, no
// team-select, all 4 are always in the fight (see the design spec).
export const ROSTER: Character[] = [
  { id: 'warrior', name: 'Warrior', color: 'red', atk: 50 },
  { id: 'archer', name: 'Archer', color: 'green', atk: 50 },
  { id: 'rogue', name: 'Rogue', color: 'yellow', atk: 50 },
  { id: 'mage', name: 'Mage', color: 'blue', atk: 50 },
];

// Looks up which character owns a color. Throws rather than returning
// null/undefined because every color always has a character in this
// 4-color roster — a missing match would mean a real bug, not a valid
// "dead color" case (that mechanic was removed).
export function getCharacterForColor(roster: Character[], color: ElementColor): Character {
  const character = roster.find((c) => c.color === color);
  if (!character) {
    throw new Error(`No character found for color ${color}`);
  }
  return character;
}

// The whole damage model: ATK times however many stones of that color
// were destroyed. `count` is the manual chain's length for wave 1, or the
// number of same-colored stones a special-tile effect destroyed for later
// waves — no damping multiplier at any depth (see resolution.ts).
export function calculateDamage(roster: Character[], color: ElementColor, count: number): number {
  const character = getCharacterForColor(roster, color);
  return character.atk * count;
}

export interface Monster {
  name: string;
  maxHp: number;
  hp: number;
}

export function createMonster(name: string, maxHp: number): Monster {
  return { name, maxHp, hp: maxHp };
}

// Returns a new Monster with hp reduced (never below 0) rather than
// mutating in place, keeping combat state easy to reason about/test.
export function applyDamage(monster: Monster, damage: number): Monster {
  return { ...monster, hp: Math.max(0, monster.hp - damage) };
}

export function isDefeated(monster: Monster): boolean {
  return monster.hp <= 0;
}
