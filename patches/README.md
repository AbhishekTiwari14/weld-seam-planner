# R3F 9 Timer compatibility

`@react-three/fiber@9.8.2` constructs `THREE.Clock` inside its store, before
`Canvas.onCreated`. The warning attributed to `Viewport.tsx` therefore cannot be
fixed by replacing an application clock. The stable v9 API still requires the
writable Clock fields and start/stop methods; Timer is not a drop-in replacement.
See the [upstream issue](https://github.com/pmndrs/react-three-fiber/issues/3741).

The versioned patch changes only that construction in the ESM and development /
production CommonJS bundles. `THREE.Timer.update()` and `getDelta()` compute time;
the small adapter preserves R3F's existing seconds, auto-start, elapsed time,
frameloop changes, and manual `advance()` behavior. It does not connect document
listeners, add a frame loop, suppress warnings, or change camera controls.

`npm ci` / `npm install` applies the patch via `postinstall`, failing if it cannot
apply. Install development dependencies to build this Vite application; do not
skip install scripts. The generated static application needs no patch tooling at
runtime. When upgrading R3F, review/remove this patch once a stable version has
supported timing; do not silently carry it across versions. R3F's root timing
tests plus development and production browser checks guard the integration.
