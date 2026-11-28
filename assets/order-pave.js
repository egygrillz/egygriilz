/* Plan a whole gesture before committing it. Distances are in SVG units, not
   screen pixels. Jump to the exit of occupied circles: unlike arc-length stamps,
   corners, loops, retracing a line and crossing earlier stones cannot overlap. */
(function (root) {
  const unitsPerMm = 4.5;
  function plan(
    points,
    { sizeMm, cut = 'round', gapMm, existing, toothAt, room, brushAt, onPlace, max = 32 * 220 },
  ) {
    if (!points.length || !(sizeMm > 0) || !(gapMm >= 0)) return [];
    const radius = (g) =>
      (Math.max(2, (Number(g.visualSizeMm || g.sizeMm) || 1.5) * unitsPerMm) / 2) *
      ((g.visualCut || g.cut || 'round') === 'round' ? 1 : Math.SQRT2);
    const baseRadius = radius({ sizeMm, cut }),
      gap = gapMm * unitsPerMm;
    const cell = baseRadius * 2 + gap + 0.02;
    let largest = baseRadius;
    const cells = new Map(),
      counts = new Map(),
      placed = [];
    function index(x, y, rad) {
      largest = Math.max(largest, rad);
      const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ x, y, rad });
    }
    for (const g of existing) index(g.x, g.y, radius(g));
    for (let i = 0; i < Math.max(1, points.length - 1) && placed.length < max; i++) {
      const a = points[i],
        b = points[i + 1] || a,
        len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = len ? (b.x - a.x) / len : 0,
        uy = len ? (b.y - a.y) / len : 0;
      for (let t = 0; t <= len && placed.length < max;) {
        const x = a.x + t * ux,
          y = a.y + t * uy,
          cx = Math.floor(x / cell),
          cy = Math.floor(y / cell);
        const tooth = toothAt(x, y),
          n = counts.get(tooth) || 0;
        if (!tooth || n >= room(tooth)) {
          t += Math.max(0.5, baseRadius / 2);
          continue;
        }
        const brush = brushAt?.(tooth),
          r = brush ? radius(brush) : baseRadius;
        const reach = Math.ceil((largest + r + gap + 0.02) / cell);
        let skip = 0;
        for (let j = -reach; j <= reach; j++)
          for (let k = -reach; k <= reach; k++) {
            for (const g of cells.get(`${cx + j}:${cy + k}`) || []) {
              const dx = x - g.x,
                dy = y - g.y,
                min = r + g.rad + gap + 0.02,
                dist2 = dx * dx + dy * dy;
              if (dist2 >= min * min) continue;
              const dot = dx * ux + dy * uy;
              skip = Math.max(skip, -dot + Math.sqrt(dot * dot + min * min - dist2) + 0.00001);
            }
          }
        if (skip > 0) {
          // A smaller brush may start on the other side of a tooth boundary.
          t += brushAt ? Math.min(skip, 1.5) : skip;
          continue;
        }
        const stamp = {
          tooth,
          x,
          y,
          ...(brush && { sizeMm: brush.sizeMm, cut: brush.cut, color: brush.color }),
        };
        placed.push(stamp);
        counts.set(tooth, n + 1);
        index(x, y, r);
        onPlace?.(stamp);
        t += brushAt ? 0.00001 : 2 * r + gap + 0.02001;
      }
    }
    return placed;
  }
  root.OrderPave = { plan, unitsPerMm };
})(globalThis);
