/**
 * scenario.ts — Default noir detective scenario
 *
 * A hardcoded scenario for the initial demo.
 * Later this will be replaced by LLM-generated scenarios.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import type { Scenario } from '../types/game.js';

export const NOIR_SCENARIO: Scenario = {
  title: 'The Velvet Shadow',
  setting: '1920s noir detective mystery in rain-soaked Chicago',
  synopsis:
    'A jazz singer has gone missing from The Velvet Lounge. ' +
    'You are a private detective hired to find her. ' +
    'The rain never stops, the whiskey is cheap, and everyone has something to hide.',
  maxTurns: 12,
  solution: {
    culpritId: 'bartender',
    evidenceId: 'matchbook',
    requiredEvidenceIds: ['broken_necklace', 'diary', 'matchbook', 'cigarette_butt'],
  },
  rooms: [
    {
      id: 'office',
      name: 'Your Office',
      description:
        'A cramped office on the third floor. Rain hammers against the window. ' +
        'Your desk is buried under case files and empty bourbon glasses. ' +
        'A flickering neon sign outside paints the room in red and blue.',
      exits: { south: 'street' },
      items: ['case_file'],
      npcs: [],
    },
    {
      id: 'street',
      name: 'Rain-Soaked Street',
      description:
        'Wet cobblestones reflect the glow of streetlamps. ' +
        'Cars crawl through puddles. The Velvet Lounge is to the east, ' +
        'and a dark alley runs north.',
      exits: { north: 'office', east: 'lounge', west: 'alley' },
      items: [],
      npcs: [],
    },
    {
      id: 'lounge',
      name: 'The Velvet Lounge',
      description:
        'Smoke curls around the stage where a band plays without their singer. ' +
        'Red velvet curtains frame the room. The bartender polishes glasses ' +
        'with an expression that says he has seen everything.',
      exits: { west: 'street', north: 'backstage' },
      items: ['broken_necklace'],
      npcs: ['bartender'],
    },
    {
      id: 'backstage',
      name: 'Backstage',
      description:
        'A narrow corridor lined with dressing rooms. ' +
        'One door is slightly ajar — the missing singer\'s room. ' +
        'A faint scent of perfume lingers in the air.',
      exits: { south: 'lounge' },
      items: ['diary', 'matchbook'],
      npcs: ['stagehand'],
    },
    {
      id: 'alley',
      name: 'Dark Alley',
      description:
        'Trash cans and shadows. A cat watches you from a fire escape. ' +
        'There is a door here that leads to the back of the lounge, ' +
        'but it is locked from the inside.',
      exits: { east: 'street' },
      items: ['cigarette_butt'],
      npcs: ['informant'],
    },
  ],
  npcs: [
    {
      id: 'bartender',
      name: 'Mickey "The Pour" Malone',
      description: 'A broad-shouldered bartender who knows every secret in this joint.',
      roomId: 'lounge',
      dialogue: [
        'She was here last Tuesday. Sang her heart out, then vanished.',
        'There was a man in a grey coat watching her all night.',
        'Check the backstage. She left in a hurry.',
      ],
    },
    {
      id: 'stagehand',
      name: 'Tommy the Stagehand',
      description: 'A nervous kid who handles the curtains and the lights.',
      roomId: 'backstage',
      dialogue: [
        'I heard arguing that night. A man and a woman.',
        'She kept a diary in her dressing room. Maybe it has answers.',
        'The back door was open that night. Someone left through the alley.',
      ],
    },
    {
      id: 'informant',
      name: 'Whisper Pete',
      description: 'A shady figure leaning against the wall, hat pulled low.',
      roomId: 'alley',
      dialogue: [
        'You looking for the singer? Cost you a favor.',
        'Word on the street is she owed money to the wrong people.',
        'Check the matchbook. It has an address on the back.',
      ],
    },
  ],
  items: [
    { id: 'case_file', name: 'Case File', description: 'A manila folder with the missing person report.', roomId: 'office', isEvidence: false },
    { id: 'broken_necklace', name: 'Broken Necklace', description: 'A pearl necklace with a snapped clasp, found under a table.', roomId: 'lounge', isEvidence: true },
    { id: 'diary', name: 'Singer\'s Diary', description: 'A leather-bound diary with the last entry dated the night she vanished.', roomId: 'backstage', isEvidence: true },
    { id: 'matchbook', name: 'Matchbook', description: 'From "The Blue Flamingo" — an address is scrawled inside.', roomId: 'backstage', isEvidence: true },
    { id: 'cigarette_butt', name: 'Cigarette Butt', description: 'An imported brand. Expensive taste for a dark alley.', roomId: 'alley', isEvidence: true },
  ],
};
