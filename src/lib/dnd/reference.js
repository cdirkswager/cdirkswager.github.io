export const CONDITIONS = [
  { key: "blinded", label: "Blinded", short: "Can't see. Attacks vs. have ADV; its attacks have DIS." },
  { key: "charmed", label: "Charmed", short: "Can't attack charmer; charmer has ADV on social checks." },
  { key: "deafened", label: "Deafened", short: "Can't hear; auto-fails hearing checks." },
  { key: "frightened", label: "Frightened", short: "DIS on checks/attacks while source in sight; can't move closer." },
  { key: "grappled", label: "Grappled", short: "Speed 0; ends if grappler incapacitated." },
  { key: "incapacitated", label: "Incapacitated", short: "No actions or reactions." },
  { key: "invisible", label: "Invisible", short: "Attacks vs. have DIS; its attacks have ADV." },
  { key: "paralyzed", label: "Paralyzed", short: "Incapacitated, can't move/speak; melee hits within 5ft auto-crit." },
  { key: "petrified", label: "Petrified", short: "Stone. Resist all damage; immune poison/disease." },
  { key: "poisoned", label: "Poisoned", short: "DIS on attack rolls and ability checks." },
  { key: "prone", label: "Prone", short: "Melee vs. has ADV; ranged vs. has DIS; its attacks DIS." },
  { key: "restrained", label: "Restrained", short: "Speed 0; attacks vs. ADV, its attacks DIS; DIS DEX saves." },
  { key: "stunned", label: "Stunned", short: "Incapacitated; auto-fail STR/DEX saves; attacks vs. have ADV." },
  { key: "unconscious", label: "Unconscious", short: "Incapacitated, prone; melee within 5ft auto-crit." },
  { key: "concentration", label: "Concentration", short: "Con save (DC 10 or half dmg) when hit to keep the spell." },
];

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning",
  "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
];

export const DAMAGE_ICON = {
  acid: "🜅", bludgeoning: "🔨", cold: "❄", fire: "🔥", force: "✷",
  lightning: "⚡", necrotic: "☠", piercing: "🏹", poison: "☣",
  psychic: "🌀", radiant: "☀", slashing: "⚔", thunder: "💥",
};

export const XP_THRESHOLDS = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
};

export function encounterMultiplier(monsterCount) {
  if (monsterCount <= 1) return 1;
  if (monsterCount === 2) return 1.5;
  if (monsterCount <= 6) return 2;
  if (monsterCount <= 10) return 2.5;
  if (monsterCount <= 14) return 3;
  return 4;
}

export const RESOURCE_TEMPLATES = [
  { name: "Ki Points", resource_type: "numeric", recovery_type: "short_rest", weight_damage_boost: 0.7, weight_damage_reduction: 0.3, weight_healing: 0.1 },
  { name: "Rage", resource_type: "numeric", recovery_type: "long_rest", weight_damage_boost: 0.4, weight_damage_reduction: 0.8, weight_healing: 0.0 },
  { name: "Wild Shape", resource_type: "numeric", recovery_type: "short_rest", weight_damage_boost: 0.3, weight_damage_reduction: 0.9, weight_healing: 0.0 },
  { name: "Channel Divinity", resource_type: "numeric", recovery_type: "short_rest", weight_damage_boost: 0.5, weight_damage_reduction: 0.3, weight_healing: 0.4 },
  { name: "Lay on Hands", resource_type: "numeric", recovery_type: "long_rest", weight_damage_boost: 0.0, weight_damage_reduction: 0.2, weight_healing: 0.9 },
  { name: "Arcane Arrow", resource_type: "numeric", recovery_type: "short_rest", weight_damage_boost: 0.8, weight_damage_reduction: 0.0, weight_healing: 0.0 },
  { name: "Bardic Inspiration", resource_type: "numeric", recovery_type: "short_rest", weight_damage_boost: 0.4, weight_damage_reduction: 0.4, weight_healing: 0.2 },
  { name: "Superiority Dice", resource_type: "numeric", recovery_type: "short_rest", weight_damage_boost: 0.6, weight_damage_reduction: 0.4, weight_healing: 0.0 },
  { name: "Sorcery Points", resource_type: "numeric", recovery_type: "long_rest", weight_damage_boost: 0.6, weight_damage_reduction: 0.2, weight_healing: 0.1 },
  { name: "Magical Weapon Charges", resource_type: "numeric", recovery_type: "long_rest", weight_damage_boost: 0.7, weight_damage_reduction: 0.1, weight_healing: 0.0 },
];

export function spellSlotTemplate(level, maxSlots) {
  return {
    name: `Spell Slot ${ordinal(level)}`,
    resource_type: "spell_slot",
    recovery_type: "long_rest",
    weight_damage_boost: 0.4 + level * 0.04,
    weight_damage_reduction: 0.2,
    weight_healing: 0.4,
    slot_level: level,
    max_value: maxSlots,
  };
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
