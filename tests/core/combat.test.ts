import { describe, it, expect } from 'vitest';
import {
  ROSTER,
  getCharacterForColor,
  calculateDamage,
  createMonster,
  applyDamage,
  isDefeated,
} from '../../src/core/combat';

describe('roster', () => {
  it('has exactly 4 characters, one per color', () => {
    expect(ROSTER).toHaveLength(4);
    const colors = ROSTER.map((c) => c.color).sort();
    expect(colors).toEqual(['blue', 'green', 'red', 'yellow']);
  });

  it('finds a character for every color (no dead color)', () => {
    for (const color of ['red', 'green', 'yellow', 'blue'] as const) {
      expect(() => getCharacterForColor(ROSTER, color)).not.toThrow();
    }
  });
});

describe('calculateDamage', () => {
  it('is character.atk times count, with no damping', () => {
    const character = getCharacterForColor(ROSTER, 'red');
    expect(calculateDamage(ROSTER, 'red', 5)).toBe(character.atk * 5);
    expect(calculateDamage(ROSTER, 'red', 20)).toBe(character.atk * 20);
  });
});

describe('monster', () => {
  it('applies damage and detects defeat', () => {
    let monster = createMonster('Frost Yeti', 100);
    expect(isDefeated(monster)).toBe(false);
    monster = applyDamage(monster, 60);
    expect(monster.hp).toBe(40);
    monster = applyDamage(monster, 60);
    expect(monster.hp).toBe(0);
    expect(isDefeated(monster)).toBe(true);
  });
});
