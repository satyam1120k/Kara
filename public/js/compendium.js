/**
 * KĀRA: Piece Compendium & Rulebook Data
 */

export const COMPENDIUM_DATA = [
  {
    type: 'SOVEREIGN',
    name: 'Sovereign',
    abbr: 'S',
    qty: 1,
    role: 'Royal piece (unstackable)',
    echoName: 'None',
    echoDesc: 'Sovereigns cannot be stacked upon, cannot stack on allies, and grant no Echo.',
    dawnDesc: 'Moves 1 square in any of the 8 directions (orthogonal or diagonal). Cannot promote.',
    eclipseDesc: 'Does not promote. Remains on Dawn face throughout the game.',
    dawnGrid: [
      ['.', '.', '.', '.', '.'],
      ['.', '×', '×', '×', '.'],
      ['.', '×', '●', '×', '.'],
      ['.', '×', '×', '×', '.'],
      ['.', '.', '.', '.', '.']
    ],
    eclipseGrid: null
  },
  {
    type: 'SPEAR',
    name: 'Spear',
    abbr: 'Sp',
    qty: 5,
    role: 'Forward infantry',
    echoName: 'Thrust',
    echoDesc: 'Top piece gains +1 extra square of range when moving straight forward.',
    dawnDesc: 'Moves 1 square straight forward.',
    eclipseDesc: 'Moves 1 square in 6 directions: 4 orthogonal directions OR 2 forward-diagonal directions.',
    dawnGrid: [
      ['.', '.', '.', '.', '.'],
      ['.', '.', '×', '.', '.'],
      ['.', '.', '●', '.', '.'],
      ['.', '.', '.', '.', '.'],
      ['.', '.', '.', '.', '.']
    ],
    eclipseGrid: [
      ['.', '.', '.', '.', '.'],
      ['.', '×', '×', '×', '.'],
      ['.', '×', '●', '×', '.'],
      ['.', '.', '×', '.', '.'],
      ['.', '.', '.', '.', '.']
    ]
  },
  {
    type: 'BASTION',
    name: 'Bastion',
    abbr: 'B',
    qty: 2,
    role: 'Defensive anchor',
    echoName: 'Aegis',
    echoDesc: 'When this tower is attacked, the attacker captures the lowest buried Bastion instead of the top piece. Attacker stays on origin.',
    dawnDesc: 'Steps 1 square orthogonally in all 4 directions.',
    eclipseDesc: 'Steps 1 square in all 8 directions (like a King/Sovereign).',
    dawnGrid: [
      ['.', '.', '.', '.', '.'],
      ['.', '.', '×', '.', '.'],
      ['.', '×', '●', '×', '.'],
      ['.', '.', '×', '.', '.'],
      ['.', '.', '.', '.', '.']
    ],
    eclipseGrid: [
      ['.', '.', '.', '.', '.'],
      ['.', '×', '×', '×', '.'],
      ['.', '×', '●', '×', '.'],
      ['.', '×', '×', '×', '.'],
      ['.', '.', '.', '.', '.']
    ]
  },
  {
    type: 'SCOUT',
    name: 'Scout',
    abbr: 'Sc',
    qty: 2,
    role: 'Diagonal skirmisher',
    echoName: 'Vault',
    echoDesc: 'Top piece may leap over up to 1 intervening piece (friendly or enemy) along a directional line.',
    dawnDesc: 'Slides diagonally up to 3 squares in all 4 diagonal directions.',
    eclipseDesc: 'Slides diagonally unlimited squares (like Bishop), OR steps 1 square orthogonally.',
    dawnGrid: [
      ['↖', '.', '.', '.', '↗'],
      ['.', '↖', '.', '↗', '.'],
      ['.', '.', '●', '.', '.'],
      ['.', '↙', '.', '↘', '.'],
      ['↙', '.', '.', '.', '↘']
    ],
    eclipseGrid: [
      ['↖', '.', '.', '.', '↗'],
      ['.', '↖', '×', '↗', '.'],
      ['.', '×', '●', '×', '.'],
      ['.', '↙', '×', '↘', '.'],
      ['↙', '.', '.', '.', '↘']
    ]
  },
  {
    type: 'RIDER',
    name: 'Rider',
    abbr: 'R',
    qty: 2,
    role: 'Jumping cavalry',
    echoName: 'Gallop',
    echoDesc: 'Top piece also gains the Rider’s L-shape leap (2×1 in all 8 directions).',
    dawnDesc: 'Leaps in an L-shape (2 squares orthogonally + 1 square perpendicular, all 8 targets). Leaps over intervening pieces.',
    eclipseDesc: 'Leaps in an L-shape, OR steps 1 square orthogonally.',
    dawnGrid: [
      ['.', '★', '.', '★', '.'],
      ['★', '.', '.', '.', '★'],
      ['.', '.', '●', '.', '.'],
      ['★', '.', '.', '.', '★'],
      ['.', '★', '.', '★', '.']
    ],
    eclipseGrid: [
      ['.', '★', '.', '★', '.'],
      ['★', '.', '×', '.', '★'],
      ['.', '×', '●', '×', '.'],
      ['★', '.', '×', '.', '★'],
      ['.', '★', '.', '★', '.']
    ]
  },
  {
    type: 'CHARIOT',
    name: 'Chariot',
    abbr: 'C',
    qty: 2,
    role: 'Heavy orthogonal slider',
    echoName: 'Horizon',
    echoDesc: 'Top piece gains +2 range to any straight or diagonal directional move.',
    dawnDesc: 'Slides orthogonally unlimited squares in all 4 directions (like a Rook).',
    eclipseDesc: 'Slides orthogonally unlimited squares, OR steps 1 square diagonally.',
    dawnGrid: [
      ['.', '.', '▲', '.', '.'],
      ['.', '.', '┃', '.', '.'],
      ['◀', '━', '●', '━', '▶'],
      ['.', '.', '┃', '.', '.'],
      ['.', '.', '▼', '.', '.']
    ],
    eclipseGrid: [
      ['.', '.', '▲', '.', '.'],
      ['.', '×', '┃', '×', '.'],
      ['◀', '━', '●', '━', '▶'],
      ['.', '×', '┃', '×', '.'],
      ['.', '.', '▼', '.', '.']
    ]
  },
  {
    type: 'MYSTIC',
    name: 'Mystic',
    abbr: 'M',
    qty: 2,
    role: 'Diagonal mystic',
    echoName: 'Phase',
    echoDesc: 'Top piece also gains 1-step diagonal movement in all 4 diagonal directions.',
    dawnDesc: 'Steps 1 square diagonally in all 4 directions.',
    eclipseDesc: 'Leaps exactly 2 squares orthogonally or diagonally (8 targets, ignores obstacles), OR steps 1 square diagonally.',
    dawnGrid: [
      ['.', '.', '.', '.', '.'],
      ['.', '×', '.', '×', '.'],
      ['.', '.', '●', '.', '.'],
      ['.', '×', '.', '×', '.'],
      ['.', '.', '.', '.', '.']
    ],
    eclipseGrid: [
      ['★', '.', '★', '.', '★'],
      ['.', '×', '.', '×', '.'],
      ['★', '.', '●', '.', '★'],
      ['.', '×', '.', '×', '.'],
      ['★', '.', '★', '.', '★']
    ]
  }
];

export function renderMoveGrid(grid) {
  if (!grid) return '<div class="no-diagram">Same as Dawn</div>';
  let html = '<div class="compendium-diagram-grid">';
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      let cls = 'diag-cell';
      let content = '';
      if (cell === '●') {
        cls += ' diag-piece';
        content = '●';
      } else if (cell === '×') {
        cls += ' diag-step';
        content = '×';
      } else if (cell === '★') {
        cls += ' diag-leap';
        content = '★';
      } else if (cell !== '.') {
        cls += ' diag-ray';
        content = cell;
      }
      html += `<div class="${cls}">${content}</div>`;
    }
  }
  html += '</div>';
  return html;
}
