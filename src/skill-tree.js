// Topological ranks stay on one row. Wrapped roots create false visual parents.
export function layoutSkillTree(skills, branch) {
  const ids = Object.keys(skills).filter(id => skills[id].branch === branch);
  const depths = new Map();
  function depth(id, visiting = new Set()) {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) throw new Error('Cyclic skill tree');
    const next = new Set(visiting).add(id);
    const parents = (skills[id].parents || []).filter(p => ids.includes(p));
    const rank = parents.length ? 1 + Math.max(...parents.map(p => depth(p, next))) : 0;
    depths.set(id, rank);
    return rank;
  }
  const rows = new Map();
  for (const id of ids) {
    const rank = depth(id);
    if (!rows.has(rank)) rows.set(rank, []);
    rows.get(rank).push(id);
  }
  const nodes = [];
  for (const [rank, row] of rows) row.forEach((id, column) => nodes.push({
    id, rank, x: 16 + column * 168, y: 16 + rank * 132, width: 144, height: 76,
  }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const contentWidth = Math.max(320, ...nodes.map(n => n.x + n.width + 16));
  const edges = [];
  let bypass = 0;
  for (const child of nodes) for (const parentId of skills[child.id].parents || []) {
    const parent = byId.get(parentId);
    if (!parent) continue; // Other branches are named in the purchase inspector.
    const start = [parent.x + parent.width / 2, parent.y + parent.height];
    const end = [child.x + child.width / 2, child.y];
    let points;
    if (child.rank > parent.rank + 1) {
      const outside = contentWidth + 12 + bypass++ * 12;
      points = [start, [start[0], start[1] + 16], [outside, start[1] + 16],
        [outside, end[1] - 16], [end[0], end[1] - 16], end];
    } else {
      const middle = (start[1] + end[1]) / 2;
      points = [start, [start[0], middle], [end[0], middle], end];
    }
    edges.push({ parent: parentId, child: child.id, points,
      path: points.map(([x,y],i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') });
  }
  return { nodes, edges, width: contentWidth + (bypass ? bypass * 12 + 12 : 0),
    height: Math.max(160, ...nodes.map(n => n.y + n.height + 20)) };
}
