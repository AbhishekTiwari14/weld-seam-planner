import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Worker/lazy imports otherwise trigger a late dev optimizer reload, losing the staged file.
  optimizeDeps: { include: ['three', 'three-mesh-bvh', '@react-three/fiber',
    'three/examples/jsm/loaders/STLLoader.js', 'three/examples/jsm/controls/OrbitControls.js',
    'three/examples/jsm/lines/Line2.js', 'three/examples/jsm/lines/LineGeometry.js', 'three/examples/jsm/lines/LineMaterial.js'] },
  server: { watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/.local/**'] } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    maxWorkers: 1,
  },
});
