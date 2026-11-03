# Armatrix Weld Seam Planner

Browser-based engineering prototype. Milestone 1 implements the domain and numerical foundation; it does not yet implement STL import or the planning interface.

## Local development

Use Node.js 24 and npm. Install with `npm ci`, then run `npm run dev`.

- `npm run typecheck` — strict TypeScript checks.
- `npm test` — focused automated tests.
- `npm run build` — typecheck and production bundle.
- `npm run preview` — serve the production bundle locally.

The approved application stack is Vite, React, TypeScript, React Three Fiber, Three.js, Zustand, and Zod. Rendering and state libraries are installed for later milestones; the foundation is independent of them.

This is a weld **plan**, not an executable robot trajectory. Source units and workpiece coordinates are explicit. Robot registration, torch orientation, collision avoidance, and motion timing are outside this milestone.
