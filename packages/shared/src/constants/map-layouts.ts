/**
 * map-layouts.ts — Manual room positions for each scenario's map
 *
 * These are hand-crafted (x, y) coordinates for rendering the interactive
 * game map. Positions are designed to reflect the scenario's spatial logic
 * (e.g. linear western town, vertical ship, plus-shaped space station).
 *
 * All layouts target a 600x500 SVG viewBox.
 *
 * @author AKBOYS Team
 * @since 2026-04-08
 */

export interface RoomPosition {
  x: number;
  y: number;
}

export interface ScenarioMapLayout {
  viewBox: { width: number; height: number };
  rooms: Record<string, RoomPosition>;
  /** Theme colors per scenario */
  theme: {
    bg: string;            // map background
    roomFill: string;      // visited room card background
    roomStroke: string;    // visited room card border
    roomText: string;      // visited room label color
    connection: string;    // line between rooms
    current: string;       // pulse marker color
    fogFill: string;       // unvisited room fill
    fogStroke: string;     // unvisited room border
  };
}

export const MAP_LAYOUTS: Record<string, ScenarioMapLayout> = {
  /* ------------------------------------------------------------------ */
  /*  NOIR — 1920s Chicago. Office/alley on the outside, street hub.    */
  /* ------------------------------------------------------------------ */
  noir: {
    viewBox: { width: 600, height: 500 },
    rooms: {
      office:    { x: 100, y: 90 },
      backstage: { x: 480, y: 90 },
      street:    { x: 290, y: 240 },
      lounge:    { x: 480, y: 240 },
      alley:     { x: 100, y: 400 },
    },
    theme: {
      bg: '#0d0a08',
      roomFill: '#1a140a',
      roomStroke: '#8a6a30',
      roomText: '#e8d8a8',
      connection: '#5a4530',
      current: '#d4a843',
      fogFill: '#0f0d0a',
      fogStroke: '#2a2015',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  HAUNTED — 2x2 manor grid + cellar below foyer.                   */
  /* ------------------------------------------------------------------ */
  haunted: {
    viewBox: { width: 600, height: 500 },
    rooms: {
      library:     { x: 150, y: 90 },
      study:       { x: 450, y: 90 },
      foyer:       { x: 150, y: 240 },
      dining_hall: { x: 450, y: 240 },
      cellar:      { x: 150, y: 400 },
    },
    theme: {
      bg: '#0b0a10',
      roomFill: '#1a1520',
      roomStroke: '#6a5a8a',
      roomText: '#d8c8e8',
      connection: '#403550',
      current: '#a878d4',
      fogFill: '#0d0b12',
      fogStroke: '#22202a',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  SPACE — Plus/cross shape with corridor as central hub.           */
  /* ------------------------------------------------------------------ */
  space: {
    viewBox: { width: 600, height: 500 },
    rooms: {
      bridge:   { x: 290, y: 70 },
      quarters: { x: 90, y: 240 },
      corridor: { x: 290, y: 240 },
      lab:      { x: 490, y: 240 },
      cargo:    { x: 290, y: 410 },
    },
    theme: {
      bg: '#06090e',
      roomFill: '#0a1520',
      roomStroke: '#3a7aa8',
      roomText: '#b8d8f0',
      connection: '#2a4a6a',
      current: '#58a8d8',
      fogFill: '#07090c',
      fogStroke: '#14202a',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  PIRATE — Vertical ship cross-section + crow's nest.              */
  /* ------------------------------------------------------------------ */
  pirate: {
    viewBox: { width: 600, height: 500 },
    rooms: {
      crows_nest:     { x: 500, y: 80 },
      main_deck:      { x: 300, y: 110 },
      captains_cabin: { x: 100, y: 110 },
      gun_deck:       { x: 300, y: 270 },
      cargo_hold:     { x: 300, y: 420 },
    },
    theme: {
      bg: '#0a0805',
      roomFill: '#1a140a',
      roomStroke: '#a87840',
      roomText: '#ecd8a8',
      connection: '#5a4525',
      current: '#e8a850',
      fogFill: '#0c0a07',
      fogStroke: '#251d12',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  WESTERN — Plus/cross with main_street as hub.                    */
  /* ------------------------------------------------------------------ */
  western: {
    viewBox: { width: 600, height: 500 },
    rooms: {
      sheriff_office: { x: 290, y: 70 },
      saloon:         { x: 80, y: 240 },
      main_street:    { x: 290, y: 240 },
      stable:         { x: 500, y: 240 },
      general_store:  { x: 290, y: 410 },
    },
    theme: {
      bg: '#0d0a07',
      roomFill: '#1a1408',
      roomStroke: '#a07838',
      roomText: '#e8d4a0',
      connection: '#5a4220',
      current: '#e0a848',
      fogFill: '#0f0c09',
      fogStroke: '#261e14',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  CYBERPUNK — Horizontal street + vertical branches.               */
  /* ------------------------------------------------------------------ */
  cyberpunk: {
    viewBox: { width: 600, height: 500 },
    rooms: {
      server_room: { x: 200, y: 80 },
      penthouse:   { x: 480, y: 80 },
      noodle_bar:  { x: 80, y: 260 },
      market:      { x: 290, y: 260 },
      rooftop:     { x: 480, y: 260 },
    },
    theme: {
      bg: '#08080f',
      roomFill: '#0f0a1a',
      roomStroke: '#b040a8',
      roomText: '#e8b0e8',
      connection: '#5a2560',
      current: '#e858c8',
      fogFill: '#0a0810',
      fogStroke: '#1a1222',
    },
  },
};
