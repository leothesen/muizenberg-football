/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
