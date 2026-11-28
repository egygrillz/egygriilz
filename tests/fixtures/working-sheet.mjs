// Observe in-memory geometry only in the intercepted test script. Production
// does not expose a global containing the client file or write it to storage.
export function observeSheet(ctx) {
  return ctx.route('**/assets/order-file.js?*', async (r) => {
    const src = await r.fetch();
    await r.fulfill({
      response: src,
      body:
        (await src.text()) +
        `\n{const pack=OrderFile.pack;OrderFile.pack=s=>{window.__testSheet=s;return pack(s);};}`,
    });
  });
}
