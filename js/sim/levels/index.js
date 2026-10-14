// The missions, in order. Each is plain data (see js/sim/levels/firewall.js for the full shape).
import firewall from './firewall.js';
import strait from './strait.js';
import heist from './heist.js';
import area51 from './area51.js';
import vegas from './vegas.js';

export const LEVELS = [firewall, strait, heist, area51, vegas];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
