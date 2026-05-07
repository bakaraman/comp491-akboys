/**
 * scenarios.ts — All available game scenarios
 *
 * Contains every playable scenario in a single SCENARIOS map.
 * Each entry is keyed by a URL-friendly slug.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import type { Scenario } from '../types/game.js';

export const SCENARIOS: Record<string, Scenario> = {
  /* ------------------------------------------------------------------ */
  /*  1. NOIR — "The Velvet Shadow"                                     */
  /* ------------------------------------------------------------------ */
  noir: {
    title: 'The Velvet Shadow',
    setting: '1920s noir detective mystery in rain-soaked Chicago',
    synopsis:
      'A jazz singer has gone missing from The Velvet Lounge. ' +
      'You are a private detective hired to find her. ' +
      'The rain never stops, the whiskey is cheap, and everyone has something to hide.',
    maxTurns: 40,
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
        hiddenExits: {
          down: {
            targetRoomId: 'wine_cellar',
            discoverMethod: 'search',
            discoverDescription: 'You notice a loose floorboard behind the bar. Beneath it, stone steps descend into darkness.',
          },
        },
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
      {
        id: 'wine_cellar',
        name: 'Hidden Wine Cellar',
        description:
          'A dusty cellar beneath the lounge. Old wine racks line the walls. ' +
          'A private ledger sits on a makeshift desk — records of illicit dealings.',
        exits: { up: 'lounge' },
        isHidden: true,
        items: ['hidden_ledger'],
        npcs: [],
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
      { id: 'diary', name: 'Singer\'s Diary', description: 'A leather-bound diary with the last entry dated the night she vanished.', roomId: 'backstage', isEvidence: true, prerequisites: ['broken_necklace'], lockedDescription: 'The dressing room seems ordinary. Nothing catches your eye yet.' },
      { id: 'matchbook', name: 'Matchbook', description: 'From "The Blue Flamingo" — an address is scrawled inside.', roomId: 'backstage', isEvidence: true, prerequisites: ['diary'], lockedDescription: 'You rummage around but find nothing of note.' },
      { id: 'cigarette_butt', name: 'Cigarette Butt', description: 'An imported brand. Expensive taste for a dark alley.', roomId: 'alley', isEvidence: true, prerequisites: ['broken_necklace'], lockedDescription: 'Just trash. Nothing useful here.' },
      { id: 'hidden_ledger', name: 'Hidden Ledger', description: 'A private ledger recording payoffs and smuggling routes through the lounge.', roomId: 'wine_cellar', isEvidence: false },
    ],
  },

  /* ------------------------------------------------------------------ */
  /*  2. HAUNTED — "The Hollow Manor"                                   */
  /* ------------------------------------------------------------------ */
  haunted: {
    title: 'The Hollow Manor',
    setting: 'Gothic haunted manor on a stormy hilltop',
    synopsis:
      'You are a paranormal investigator called to Hollow Manor after the owner vanished. ' +
      'The locals say the house is alive. Your job is to find out what really happened.',
    maxTurns: 40,
    solution: {
      culpritId: 'caretaker',
      evidenceId: 'old_journal',
      requiredEvidenceIds: ['old_journal', 'silver_knife', 'torn_photograph'],
    },
    rooms: [
      {
        id: 'foyer',
        name: 'Grand Foyer',
        description:
          'A dust-covered entrance hall with a cracked chandelier overhead. ' +
          'Portraits on the walls seem to follow you with their eyes.',
        exits: { north: 'library', east: 'dining_hall' },
        items: ['welcome_letter'],
        npcs: [],
      },
      {
        id: 'library',
        name: 'The Library',
        description:
          'Shelves of rotting books rise to the ceiling. A cold draft blows from somewhere behind the walls.',
        exits: { south: 'foyer', east: 'study' },
        items: ['old_journal'],
        npcs: ['librarian_ghost'],
      },
      {
        id: 'dining_hall',
        name: 'Dining Hall',
        description:
          'A long table set for dinner that was never served. Cobwebs drape the candelabras.',
        exits: { west: 'foyer', north: 'study' },
        items: ['silver_knife'],
        npcs: ['caretaker'],
      },
      {
        id: 'study',
        name: 'Owner\'s Study',
        description:
          'A private room with a heavy oak desk. The fireplace is cold but the ashes are fresh.',
        exits: { south: 'dining_hall', west: 'library' },
        items: ['torn_photograph', 'locked_box'],
        npcs: [],
      },
      {
        id: 'cellar',
        name: 'Stone Cellar',
        description:
          'A damp underground room beneath the foyer, accessed by a hidden trapdoor. Strange symbols are carved into the floor.',
        exits: { up: 'foyer' },
        items: [],
        npcs: ['medium'],
      },
    ],
    npcs: [
      {
        id: 'librarian_ghost',
        name: 'The Grey Lady',
        description: 'A translucent figure drifting between the shelves, whispering softly.',
        roomId: 'library',
        dialogue: [
          'He tried to open something that should stay closed.',
          'The answers are not in books. They are beneath your feet.',
          'I have been here longer than the house itself.',
        ],
      },
      {
        id: 'caretaker',
        name: 'Old Gareth',
        description: 'The elderly caretaker who refused to leave when everyone else did.',
        roomId: 'dining_hall',
        dialogue: [
          'The master started acting strange after he found that box.',
          'I hear footsteps at night. Always going down, never coming up.',
          'There is a cellar below the foyer. He told me never to go there.',
        ],
      },
      {
        id: 'medium',
        name: 'Madame Elara',
        description: 'A self-proclaimed medium sitting cross-legged in the cellar, eyes closed.',
        roomId: 'cellar',
        dialogue: [
          'The symbols on this floor are a binding circle. Something was kept here.',
          'I can feel his presence. He is not dead, but he is not alive either.',
          'Open the locked box. It holds the key to everything.',
        ],
      },
    ],
    items: [
      { id: 'welcome_letter', name: 'Welcome Letter', description: 'A formal invitation addressed to you, dated three weeks ago.', roomId: 'foyer', isEvidence: false },
      { id: 'old_journal', name: 'Old Journal', description: 'A journal describing rituals performed in the cellar.', roomId: 'library', isEvidence: true },
      { id: 'silver_knife', name: 'Silver Knife', description: 'A ceremonial blade with dark stains on the edge.', roomId: 'dining_hall', isEvidence: true, prerequisites: ['old_journal'], lockedDescription: 'An ornate knife, but you see nothing unusual about it yet.' },
      { id: 'torn_photograph', name: 'Torn Photograph', description: 'Half a photo showing the owner standing next to an unknown figure.', roomId: 'study', isEvidence: true, prerequisites: ['old_journal'], lockedDescription: 'A cluttered desk. You would need to know what you are looking for.' },
      { id: 'locked_box', name: 'Locked Box', description: 'A small iron box engraved with the same symbols found in the cellar.', roomId: 'study', isEvidence: false },
    ],
  },

  /* ------------------------------------------------------------------ */
  /*  3. SPACE — "Station Zero"                                         */
  /* ------------------------------------------------------------------ */
  space: {
    title: 'Station Zero',
    setting: 'Deep-space research station orbiting a gas giant',
    synopsis:
      'Three crew members have gone missing aboard Station Zero. ' +
      'You are the head of security. The station AI is glitching, and the airlocks are cycling on their own.',
    maxTurns: 40,
    solution: {
      culpritId: 'scientist',
      evidenceId: 'research_notes',
      requiredEvidenceIds: ['access_log', 'sample_vial', 'research_notes'],
    },
    rooms: [
      {
        id: 'bridge',
        name: 'Command Bridge',
        description:
          'The main control room of the station. Warning lights blink across every console. ' +
          'Through the viewport, the gas giant churns in silence.',
        exits: { south: 'corridor' },
        items: ['access_log'],
        npcs: ['captain'],
      },
      {
        id: 'corridor',
        name: 'Central Corridor',
        description:
          'A long, white hallway connecting the major sections. Some overhead lights flicker on and off.',
        exits: { north: 'bridge', east: 'lab', west: 'quarters', south: 'cargo' },
        items: [],
        npcs: [],
      },
      {
        id: 'lab',
        name: 'Research Lab',
        description:
          'Workstations covered in data pads and biological samples. One containment unit is shattered.',
        exits: { west: 'corridor' },
        items: ['sample_vial', 'research_notes'],
        npcs: ['scientist'],
      },
      {
        id: 'quarters',
        name: 'Crew Quarters',
        description:
          'Rows of small sleeping pods. Three pods are open and empty, personal items left behind.',
        exits: { east: 'corridor' },
        items: ['id_badge'],
        npcs: [],
      },
      {
        id: 'cargo',
        name: 'Cargo Bay',
        description:
          'A vast storage area with crates stacked high. One airlock door is dented from the inside.',
        exits: { north: 'corridor' },
        items: ['dented_panel'],
        npcs: ['engineer'],
      },
    ],
    npcs: [
      {
        id: 'captain',
        name: 'Captain Voss',
        description: 'A tired officer staring at the console screens with bloodshot eyes.',
        roomId: 'bridge',
        dialogue: [
          'They vanished during the night cycle. No alarms, no alerts.',
          'The AI reported a life-sign anomaly in the cargo bay, then went silent.',
          'Check the lab. Dr. Hale was running some unauthorized experiment.',
        ],
      },
      {
        id: 'scientist',
        name: 'Dr. Ren Hale',
        description: 'A nervous researcher clutching a data pad tightly.',
        roomId: 'lab',
        dialogue: [
          'The samples came from the gas giant atmosphere. They were not supposed to be active.',
          'I did not break the containment unit. It broke itself.',
          'Read the research notes. You will understand why I am scared.',
        ],
      },
      {
        id: 'engineer',
        name: 'Chief Kowalski',
        description: 'The chief engineer, covered in grease, standing near the dented airlock.',
        roomId: 'cargo',
        dialogue: [
          'Something hit this door from the inside. Hard enough to bend the steel.',
          'I found a crew ID badge near the quarters. Belonged to one of the missing.',
          'The ventilation system has been rerouted. Someone — or something — did it on purpose.',
        ],
      },
    ],
    items: [
      { id: 'access_log', name: 'Access Log', description: 'A printout showing airlock activity during the night cycle.', roomId: 'bridge', isEvidence: true },
      { id: 'sample_vial', name: 'Sample Vial', description: 'A cracked vial with a faintly glowing residue inside.', roomId: 'lab', isEvidence: true, prerequisites: ['access_log'], lockedDescription: 'Lab samples line the shelves but nothing stands out yet.' },
      { id: 'research_notes', name: 'Research Notes', description: 'Handwritten notes describing an organism that responds to electrical signals.', roomId: 'lab', isEvidence: true, prerequisites: ['sample_vial'], lockedDescription: 'Stacks of papers — without context, they mean nothing.' },
      { id: 'id_badge', name: 'Crew ID Badge', description: 'Belongs to Engineer Park, one of the missing crew members.', roomId: 'quarters', isEvidence: false },
      { id: 'dented_panel', name: 'Dented Panel', description: 'A section of airlock door warped outward by tremendous force.', roomId: 'cargo', isEvidence: false },
    ],
  },

  /* ------------------------------------------------------------------ */
  /*  4. PIRATE — "The Crimson Tide"                                    */
  /* ------------------------------------------------------------------ */
  pirate: {
    title: 'The Crimson Tide',
    setting: 'An 18th-century pirate galleon anchored off a volcanic island',
    synopsis:
      'The treasure map that would make the crew rich has been stolen from the captain\'s cabin. ' +
      'You are the first mate, and the captain wants answers before the tide goes out.',
    maxTurns: 40,
    solution: {
      culpritId: 'quartermaster',
      evidenceId: 'hidden_note',
      requiredEvidenceIds: ['broken_lock', 'torn_cloth', 'hidden_note'],
    },
    rooms: [
      {
        id: 'main_deck',
        name: 'Main Deck',
        description:
          'Salt wind snaps the sails above. The crew mills about, casting suspicious glances at one another.',
        exits: { below: 'gun_deck', south: 'captains_cabin', east: 'crows_nest' },
        items: ['rope_fragment'],
        npcs: [],
      },
      {
        id: 'captains_cabin',
        name: 'Captain\'s Cabin',
        description:
          'A richly decorated room at the stern. The locked chest where the map was kept stands open and empty.',
        exits: { north: 'main_deck' },
        items: ['broken_lock', 'rum_bottle'],
        npcs: ['captain_blake'],
      },
      {
        id: 'gun_deck',
        name: 'Gun Deck',
        description:
          'Cannons line each side. Hammocks sway in the dim light. Someone has been rummaging through the crew\'s belongings.',
        exits: { up: 'main_deck', south: 'cargo_hold' },
        items: ['torn_cloth'],
        npcs: ['quartermaster'],
      },
      {
        id: 'cargo_hold',
        name: 'Cargo Hold',
        description:
          'Dark and damp. Barrels of supplies and stolen goods fill the space. Rats scurry in the shadows.',
        exits: { north: 'gun_deck' },
        items: ['hidden_note'],
        npcs: ['cook'],
      },
      {
        id: 'crows_nest',
        name: 'Crow\'s Nest',
        description:
          'A small platform high above the deck. From here you can see the volcanic island and the open sea.',
        exits: { west: 'main_deck' },
        items: [],
        npcs: [],
      },
    ],
    npcs: [
      {
        id: 'captain_blake',
        name: 'Captain Silas Blake',
        description: 'A scarred old pirate gripping the edge of his desk, fury in his eyes.',
        roomId: 'captains_cabin',
        dialogue: [
          'That map is worth more than every soul on this ship. Find it.',
          'The lock was picked, not broken. We have a skilled thief aboard.',
          'I trust no one but you, first mate. Do not let me down.',
        ],
      },
      {
        id: 'quartermaster',
        name: 'Quartermaster Hobbs',
        description: 'A stocky man with a ledger tucked under one arm and ink-stained fingers.',
        roomId: 'gun_deck',
        dialogue: [
          'I keep track of every man on this ship. Two were unaccounted for last night.',
          'Check the cargo hold. The cook has been acting strange.',
          'Someone tore a piece of their shirt on the cannon mount. The cloth is still there.',
        ],
      },
      {
        id: 'cook',
        name: 'One-Eye Morrow',
        description: 'The ship\'s cook, stirring a pot and avoiding eye contact.',
        roomId: 'cargo_hold',
        dialogue: [
          'I was down here all night. Rats got into the flour again.',
          'I found a note wedged between two barrels. Was not meant for me.',
          'If you think I took it, you are wrong. I cannot even read a map.',
        ],
      },
    ],
    items: [
      { id: 'broken_lock', name: 'Broken Lock', description: 'The lock from the captain\'s chest. It was picked cleanly.', roomId: 'captains_cabin', isEvidence: true },
      { id: 'rum_bottle', name: 'Rum Bottle', description: 'An empty bottle rolling on the cabin floor.', roomId: 'captains_cabin', isEvidence: false },
      { id: 'rope_fragment', name: 'Rope Fragment', description: 'A short piece of rope cut with a sharp blade.', roomId: 'main_deck', isEvidence: false },
      { id: 'torn_cloth', name: 'Torn Cloth', description: 'A scrap of blue fabric caught on a cannon mount.', roomId: 'gun_deck', isEvidence: true, prerequisites: ['broken_lock'], lockedDescription: 'Ropes and canvas everywhere — nothing catches your eye.' },
      { id: 'hidden_note', name: 'Hidden Note', description: 'A folded note reading: "Midnight. Island. Bring the map."', roomId: 'cargo_hold', isEvidence: true, prerequisites: ['torn_cloth'], lockedDescription: 'Barrels and crates. You would need a lead to know where to look.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  /*  5. WESTERN — "Dust and Ashes"                                     */
  /* ------------------------------------------------------------------ */
  western: {
    title: 'Dust and Ashes',
    setting: 'A sun-scorched frontier town in the American Wild West',
    synopsis:
      'Sheriff Morgan was found dead in his office at dawn. ' +
      'You are a bounty hunter passing through town, and the deputy has asked for your help before the killer escapes.',
    maxTurns: 40,
    solution: {
      culpritId: 'shopkeeper',
      evidenceId: 'receipt',
      requiredEvidenceIds: ['spent_casing', 'sheriff_badge', 'receipt'],
    },
    rooms: [
      {
        id: 'saloon',
        name: 'Dusty Saloon',
        description:
          'Swinging doors let in the desert heat. A piano sits silent in the corner. ' +
          'The barkeep watches everyone from behind the counter.',
        exits: { east: 'main_street' },
        items: ['whiskey_glass'],
        npcs: ['barkeep'],
      },
      {
        id: 'main_street',
        name: 'Main Street',
        description:
          'A wide dirt road cutting through town. The sheriff\'s office is to the north. ' +
          'A general store sits to the south, and the saloon is to the west.',
        exits: { west: 'saloon', north: 'sheriff_office', south: 'general_store', east: 'stable' },
        items: [],
        npcs: [],
      },
      {
        id: 'sheriff_office',
        name: 'Sheriff\'s Office',
        description:
          'A small stone building with iron bars on the windows. The sheriff\'s body has been removed, but chalk marks remain on the floor.',
        exits: { south: 'main_street' },
        items: ['spent_casing', 'sheriff_badge'],
        npcs: [],
      },
      {
        id: 'general_store',
        name: 'General Store',
        description:
          'Shelves of canned food, rope, and ammunition. The owner stands behind the counter looking nervous.',
        exits: { north: 'main_street' },
        items: ['receipt'],
        npcs: ['shopkeeper'],
      },
      {
        id: 'stable',
        name: 'Town Stable',
        description:
          'Hay bales and horse stalls. One stall is empty — someone left in a hurry. Fresh boot prints lead to the back door.',
        exits: { west: 'main_street' },
        items: ['horseshoe'],
        npcs: ['stable_boy'],
      },
    ],
    npcs: [
      {
        id: 'barkeep',
        name: 'Hank Dawson',
        description: 'A weathered man who has run the saloon for twenty years.',
        roomId: 'saloon',
        dialogue: [
          'The sheriff had a drink here last night. Left around ten.',
          'A stranger rode into town yesterday. Never gave his name.',
          'I heard a gunshot around midnight. Figured it was coyotes.',
        ],
      },
      {
        id: 'shopkeeper',
        name: 'Mrs. Clara Finch',
        description: 'A sharp-eyed woman in an apron, arranging goods on the shelf.',
        roomId: 'general_store',
        dialogue: [
          'Someone bought a box of .45 rounds yesterday evening. Paid cash.',
          'The sheriff was looking into cattle rustlers. Made some enemies.',
          'Check the receipt. I wrote down what was sold and when.',
        ],
      },
      {
        id: 'stable_boy',
        name: 'Young Eli',
        description: 'A freckled teenager mucking out stalls with a pitchfork.',
        roomId: 'stable',
        dialogue: [
          'A man took his horse before sunrise. Did not even saddle it proper.',
          'He was wearing a long black coat. Had a scar on his left hand.',
          'He dropped a horseshoe on the way out. It is still on the ground.',
        ],
      },
    ],
    items: [
      { id: 'whiskey_glass', name: 'Whiskey Glass', description: 'A half-finished glass of whiskey left on the bar.', roomId: 'saloon', isEvidence: false },
      { id: 'spent_casing', name: 'Spent Casing', description: 'A .45 caliber shell casing found near the sheriff\'s desk.', roomId: 'sheriff_office', isEvidence: true },
      { id: 'sheriff_badge', name: 'Sheriff\'s Badge', description: 'A tin star lying on the floor, smeared with blood.', roomId: 'sheriff_office', isEvidence: true, prerequisites: ['spent_casing'], lockedDescription: 'The badge is on the floor, but you need to understand the scene first.' },
      { id: 'receipt', name: 'Sales Receipt', description: 'A receipt for .45 ammunition sold at 8 PM the previous night.', roomId: 'general_store', isEvidence: true, prerequisites: ['spent_casing'], lockedDescription: 'Receipts and papers. Without knowing the caliber, these mean nothing.' },
      { id: 'horseshoe', name: 'Dropped Horseshoe', description: 'A horseshoe with a distinctive notch on one side.', roomId: 'stable', isEvidence: false },
    ],
  },

  /* ------------------------------------------------------------------ */
  /*  6. CYBERPUNK — "Neon Ghosts"                                      */
  /* ------------------------------------------------------------------ */
  cyberpunk: {
    title: 'Neon Ghosts',
    setting: 'A rain-drenched cyberpunk megacity in 2087',
    synopsis:
      'A legendary hacker known as "Specter" has gone missing from the grid. ' +
      'You are a street runner hired by an anonymous client to find them before a megacorp does.',
    maxTurns: 40,
    solution: {
      culpritId: 'fixer',
      evidenceId: 'encrypted_drive',
      requiredEvidenceIds: ['data_chip', 'encrypted_drive', 'shattered_tablet'],
    },
    rooms: [
      {
        id: 'noodle_bar',
        name: 'Noodle Bar',
        description:
          'A cramped street-level eatery glowing with neon signs. Holographic ads flicker above the counter. ' +
          'This is where Specter was last seen.',
        exits: { east: 'market' },
        items: ['data_chip'],
        npcs: ['noodle_vendor'],
      },
      {
        id: 'market',
        name: 'Black Market Alley',
        description:
          'A narrow passage crammed with vendors selling bootleg implants and stolen tech.',
        exits: { west: 'noodle_bar', north: 'server_room', east: 'rooftop' },
        items: ['burner_phone'],
        npcs: ['fixer'],
      },
      {
        id: 'server_room',
        name: 'Abandoned Server Room',
        description:
          'Rows of dead server racks fill this basement room. One terminal in the back still hums with power.',
        exits: { south: 'market' },
        items: ['encrypted_drive', 'access_card'],
        npcs: [],
      },
      {
        id: 'rooftop',
        name: 'Rooftop Overlook',
        description:
          'High above the streets. The city sprawls in every direction, a sea of neon and smog. A drone landing pad sits unused.',
        exits: { west: 'market', north: 'penthouse' },
        items: [],
        npcs: ['drone_pilot'],
      },
      {
        id: 'penthouse',
        name: 'Corporate Penthouse',
        description:
          'A sleek, sterile apartment at the top of a megacorp tower. Everything is white and chrome. Someone trashed the place recently.',
        exits: { south: 'rooftop' },
        items: ['shattered_tablet'],
        npcs: [],
      },
    ],
    npcs: [
      {
        id: 'noodle_vendor',
        name: 'Mai Chen',
        description: 'The noodle bar owner, cybernetic arm stirring broth while her real hand counts credits.',
        roomId: 'noodle_bar',
        dialogue: [
          'Specter was here two nights ago. Left a data chip under the bowl.',
          'A corp team came looking for them the next morning. Suits and guns.',
          'If you want to find Specter, talk to the fixer in the market.',
        ],
      },
      {
        id: 'fixer',
        name: 'Jackal',
        description: 'A wiry man with mirror-lens eyes and a coat full of hidden pockets.',
        roomId: 'market',
        dialogue: [
          'Specter was digging into NovaCorp. Found something they wanted buried.',
          'There is an old server room north of here. Specter used it as a hideout.',
          'Be careful. NovaCorp already sent a cleanup crew. You are not the only one looking.',
        ],
      },
      {
        id: 'drone_pilot',
        name: 'Skye',
        description: 'A young woman with VR goggles pushed up on her forehead, sitting on a crate.',
        roomId: 'rooftop',
        dialogue: [
          'I saw someone get dragged into the penthouse last night. Could have been Specter.',
          'My drones picked up heat signatures in the penthouse, then nothing.',
          'The access card from the server room should open the penthouse door.',
        ],
      },
    ],
    items: [
      { id: 'data_chip', name: 'Data Chip', description: 'A tiny storage chip hidden under a bowl. It contains encrypted files.', roomId: 'noodle_bar', isEvidence: true },
      { id: 'burner_phone', name: 'Burner Phone', description: 'A disposable phone with one saved contact labeled "S".', roomId: 'market', isEvidence: false },
      { id: 'encrypted_drive', name: 'Encrypted Drive', description: 'A portable drive with NovaCorp financial records on it.', roomId: 'server_room', isEvidence: true, prerequisites: ['data_chip'], lockedDescription: 'Dead servers and cables. You need a lead before you can find anything.' },
      { id: 'access_card', name: 'Access Card', description: 'A corporate keycard for NovaCorp upper floors.', roomId: 'server_room', isEvidence: false },
      { id: 'shattered_tablet', name: 'Shattered Tablet', description: 'A broken tablet displaying a half-deleted message: "They know. Run."', roomId: 'penthouse', isEvidence: true, prerequisites: ['encrypted_drive'], lockedDescription: 'The trashed apartment is a mess. You need more context to make sense of it.' },
    ],
  },
};
