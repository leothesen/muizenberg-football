/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * The pictures are drawn in Archivo, read off disk at render time.
   *
   * Locally that works whether or not anything is traced, because the whole source
   * tree is sitting there — `pnpm build && next start` renders every card perfectly.
   * A deployed function only gets the files the tracer decided it needed, and a font
   * reached through `fileURLToPath` is exactly the kind of reference a tracer can
   * miss. The failure would be every image in production returning a 500 while every
   * local check stayed green, so the files are named here explicitly.
   */
  outputFileTracingIncludes: {
    "/api/og/**": ["./lib/og/fonts/**"],
    "/api/cron/**": ["./lib/og/fonts/**"],
    "/api/telegram/**": ["./lib/og/fonts/**"],
  },

  turbopack: {
    // Pin the workspace root to this directory.
    //
    // Without it Next infers the root by walking up looking for a lockfile, and any
    // checkout nested inside another one — a git worktree, most obviously — gets the
    // *parent* directory instead. The server still renders, so the site looks fine,
    // but client chunks are resolved against the wrong root and never execute: no
    // hydration, no effects, no errors anywhere. It cost an afternoon to find, and
    // this one line is the whole fix.
    root: __dirname,
  },
};

module.exports = nextConfig;
