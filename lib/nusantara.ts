// The archipelago in plate carrée, 10 units per degree from 94.5° E, 6.5° N: wide enough for quakes off Sumatra
// and on the Papua New Guinea border. Shared by the server, which draws the land, and the client, which places events.
export const K = 10;
export const MAP_W = 47.5 * K;
export const MAP_H = 18 * K;
export const project = (lon: number, lat: number): [number, number] => [
  Math.min(Math.max((lon - 94.5) * K, 2), MAP_W - 2),
  Math.min(Math.max((6.5 - lat) * K, 2), MAP_H - 2),
];
