# Local Three.js renderer

`three.min.js` is a self-hosted, tree-shaken ESM bundle of **three 0.186.0**,
compiled with **esbuild 0.25.12**. `entry.js` lists the public exports used by the
game. The upstream MIT license is retained in `LICENSE` and the bundle.

Rebuild from the repository root (build dependencies are temporary):

```sh
npm install --prefix /tmp/tp-three-build three@0.186.0 esbuild@0.25.12 --no-audit --no-fund
node - <<'JS'
require('/tmp/tp-three-build/node_modules/esbuild').buildSync({
  entryPoints: ['public/vendor/three/entry.js'],
  outfile: 'public/vendor/three/three.min.js',
  bundle: true, minify: true, format: 'esm', target: 'es2020',
  nodePaths: ['/tmp/tp-three-build/node_modules'], legalComments: 'eof',
});
JS
```

No external CDN or runtime package installation is needed. When adding renderer
features, add exports here and rebuild; do not assume the complete upstream API
is present in the trimmed bundle.
