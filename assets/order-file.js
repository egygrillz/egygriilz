/* The database stores editable instructions, not a screenshot of the sheet.
   Whitelist the file format: DOM, rendered images/PDFs, tokens and payment
   history are never part of the editable payload. Receipts live on the quote. */
(function (root) {
  const fields =
    `orderNo clientId clientName clientPhone clientEmail date appointmentDate appointmentTime deliveryDate reference status selectedTeeth toothMaterials designLayers activeDesignId newDesignSelection pendingToothSpecs ink icedTeeth groups editor designMode services timeline mold priceMode depositAuto paymentMethod productionStage productionChecks notes agreement signatureLines`.split(
      ' ',
    );
  const label = (s) => `${String(s.clientName || '').trim() || s.date || s.orderNo} · ${s.orderNo}`;
  function pack(s) {
    const data = Object.fromEntries(fields.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));
    if (s.priceMode === 'manual') data.price = s.price;
    if (s.depositAuto === false) data.deposit = s.deposit;
    data.ink = (s.ink || []).map(({ points, ...mark }) =>
      points ? { ...mark, xy: points.flatMap((p) => [Math.round(p.x * 100), Math.round(p.y * 100)]) } : mark,
    );
    // A pavé/iced operation can contain hundreds of identical stones. Store
    // the shared brush once and only quantised positions/time deltas per stone.
    data.gemRuns = [];
    let last;
    for (const { x, y, id, createdAt = 0, ...brush } of s.gems || []) {
      const k = JSON.stringify(brush);
      if (k !== last) {
        data.gemRuns.push({ brush, at: createdAt, xyz: [] });
        last = k;
      }
      const run = data.gemRuns.at(-1);
      run.xyz.push(Math.round(x * 100), Math.round(y * 100), createdAt - run.at);
    }
    // Revision is a copy of the full applied design. Recompute it on load for
    // clean layers; keep a pending flag on dirty layers instead of storing it twice.
    data.designLayers = (s.designLayers || []).map(({ revision, ...layer }) => ({
      ...layer,
      ...(revision && revision !== OrderDesign.revision(s, layer) && { draft: true }),
    }));
    return JSON.stringify(data);
  }
  function unpack(str) {
    const data = JSON.parse(str);
    data.ink = (data.ink || []).map(({ xy, ...mark }) =>
      xy
        ? {
            ...mark,
            points: Array.from({ length: xy.length / 2 }, (_, i) => ({
              x: xy[i * 2] / 100,
              y: xy[i * 2 + 1] / 100,
            })),
          }
        : mark,
    );
    if (data.gemRuns) {
      data.gems = [];
      for (const { brush, at, xyz } of data.gemRuns)
        for (let i = 0; i < xyz.length; i += 3)
          data.gems.push({
            ...brush,
            id: 'file-gem-' + data.gems.length,
            x: xyz[i] / 100,
            y: xyz[i + 1] / 100,
            createdAt: at + xyz[i + 2],
          });
      delete data.gemRuns;
    }
    return data;
  }
  const termsKey = (s) =>
    JSON.stringify([
      s.groups,
      s.services,
      s.timeline,
      s.mold,
      s.priceMode,
      s.priceMode === 'manual' && s.price,
      s.depositAuto,
      s.depositAuto === false && s.deposit,
    ]);
  root.OrderFile = { label, pack, unpack, termsKey };
})(globalThis);
