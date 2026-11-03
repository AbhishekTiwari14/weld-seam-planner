import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Armatrix Weld Seam Planner</h1>
      <p>Milestone 1: engineering foundation.</p>
      <p>Model import, the 3D viewport, and seam editing are not implemented yet.</p>
    </main>
  </StrictMode>,
);
