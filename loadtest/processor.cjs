// Artillery hooks for kindred.yml and contention.yml. run.mjs passes the private copy's id (WORLD) and the
// families to use (PAIRS) as environment variables.
const PAIRS = (process.env.PAIRS || "").split(",").filter(Boolean);

/** Every request goes to the private copy the run made, never the shared demo. */
function inWorld(req, ctx, ee, next) {
  if (process.env.WORLD) req.headers = { ...(req.headers || {}), "X-KindRed-World": process.env.WORLD };
  return next();
}

/** Each virtual visitor looks at one family, and its question names a different one (so the chat's guard answers it
 * without a language model, and the test measures the graph rather than a model's rate limit). */
function pickFamily(ctx, ee, next) {
  const i = Math.floor(Math.random() * PAIRS.length);
  ctx.vars.pair = PAIRS[i];
  ctx.vars.other = PAIRS[(i + 1) % PAIRS.length];
  return next();
}

/** Count the visits the API stored as a new Session (a reload within a minute reuses the last one). */
function countVisit(req, res, ctx, ee, next) {
  try { if (res.statusCode === 200 && JSON.parse(res.body).reused === false) ee.emit("counter", "kindred.new_visits", 1); }
  catch { /* not JSON: counted as an error by Artillery already */ }
  return next();
}

module.exports = { inWorld, pickFamily, countVisit };
