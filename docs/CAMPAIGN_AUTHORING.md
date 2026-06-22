# Tiny Quest Campaign Authoring

Tiny Quest campaigns are short, replayable narrative engines. They are not loose prompts.

Every campaign should be playable in 15 minutes, contain 3 scenes, and still feel like it has secrets, cost, and branching.

## Campaign Template

A campaign needs:

- `id`
- `title`
- `genre`
- `description`
- `storyHook`
- `difficulty`
- `recommendedStats`
- `recommendedSkills`
- `npcs`
- `enemies`
- `clues`
- `possibleEndings`
- `legendaryPets`
- `rewards`
- `imagePrompt`
- `ambientSoundPrompt`
- `narratorGuidance`
- `scenes`

## Three Scene Structure

Scene 1: Inciting Mystery

- Introduce the conflict.
- Show the first body, theft, curse, disappearance or threat.
- Reveal 2-3 possible routes.
- Let characters contribute differently.

Scene 2: Complication

- Add contradiction, betrayal, chase, second suspect or combat.
- Force a costly decision.
- Unlock paths based on clues or flags.

Scene 3: Resolution

- Resolve through proof, mercy, violence, sacrifice, escape or betrayal.
- Endings must depend on accumulated state, not only the final action.

## Clues

Clues should come from data, not from the LLM.

Future first-class clue shape:

```ts
type Clue = {
  id: string
  label: string
  description: string
  source: string
  sceneId: string
  discoveredBy?: string[]
  unlocksFlags: string[]
  unlocksActions: string[]
  suspectsAffected: Array<{ suspectId: string; suspicionChange: number }>
  endingImpact: string[]
}
```

Current implementation still stores campaign clues as `{ id, text }`, but actions can already unlock flags that behave like discovered clue facts.

## Actions

Good actions are not just labels. They change the game.

Use:

- `requiredFlags` for actions unlocked by earlier choices.
- `blockedByFlags` for paths closed by consequences.
- `unlocksFlags` for memory and branching.
- `progressOnSuccess` for moving the scene forward.
- `dangerOnPartial` and `dangerOnFailure` for cost.
- `memoryImpact` for later narration and recap.
- `combatEffect` when action touches combat.
- `npcReaction` when social state changes.

Example:

```ts
option("study-claws", "Estudiar las huellas", "investigate", "mind", "low", "Distinguir bestia de montaje.", {
  unlocksFlags: ["fake_claws_seen"],
  memoryImpact: "El grupo noto que las garras parecen fabricadas, no animales.",
  npcReaction: "El Lobo Acusado deja de temblar y empieza a escuchar."
})
```

## Dice Profiles

Tiny Quest currently uses:

- `d20`: primary action.
- `d4`: bonus from pet, skill, item, bond or advantage.
- `d6`: consequence, complication or damage.

Do not add dice without purpose.

Good dice moments:

- investigation with d20 plus d4 from pet
- combat with d20 to hit and d6 for damage/consequence
- risky magic with d20 plus d6 backlash
- chase with progress and danger changes
- protecting an NPC with d20 and danger reduction

## Character Specific Actions

Each campaign should eventually include options that care about the character.

Examples:

- Warrior/guard: protect NPC, block attack, break barrier, intimidate.
- Mage/oracle: read runes, detect curse, speak with echoes, reconstruct ritual.
- Rogue/lock specialist: open lock, steal evidence, spy, disable trap.
- Cleric/soul reader: purify mark, detect corruption, speak with dead.
- Ranger/tracker: follow tracks, detect ambush, find forest route.

These options must be data-driven. The LLM may narrate them, but must not invent them.

## Endings

Each campaign should have at least:

- good ending
- bad ending
- neutral ending
- secret or cursed ending

Endings should check:

- discovered clues
- story flags
- danger clock
- scene progress
- NPCs helped or betrayed
- combat outcomes
- memory summary
- moral choices

## Quality Checklist

A campaign is not ready if:

- all options lead to the same result
- every character sees exactly the same meaningful choices
- clues appear only in LLM text
- final outcome depends only on the last action
- consequences are vague
- NPCs have no motive
- danger does not change play
- memory does not matter

A campaign is ready if:

- every scene has objective, clue, danger and decision
- actions unlock flags, clues or later options
- partial and failure outcomes matter
- at least one scene has a moral cost
- at least one route can close or open based on prior choices
- final state depends on accumulated play
- the LLM only narrates resolved engine facts

## LLM Prompt Rules

The Dungeon Master receives:

- campaign
- current scene
- active player
- chosen action
- selected stat
- dice result
- engine outcome
- memory summary
- story flags
- recent session log

It returns JSON only. It may suggest memory updates, but the engine validates and owns state.

Avoid:

- invented clues
- invented items
- invented HP/damage
- scene changes outside the engine
- generic phrases
- repeated opening narration
- broken encoding
- `<think>` or reasoning text
