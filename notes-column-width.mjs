// Shared display-only sizing for the notes columns in the patient register and
// calendar. Use visible notes; never change or truncate persisted note values.
const MIN_WIDTH=105;
const MAX_WIDTH=300;
const PADDING=24;
const AVERAGE_GLYPH_WIDTH=6.3;

// A shared column must accommodate the longest note in the visible rows,
// while very long notes remain clipped/wrapped with the full text available.
export function notesColumnWidth(notes){
 const lines=Array.from(notes||[],value=>String(value??'').split(/\r?\n/));
 const longest=lines.reduce((max,parts)=>Math.max(max,...parts.map(text=>text.trim().length)),0);
 const estimated=Math.ceil(PADDING+longest*AVERAGE_GLYPH_WIDTH);
 return Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,estimated));
}
