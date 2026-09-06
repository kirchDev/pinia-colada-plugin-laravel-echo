import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // Every package the emitted module names is a peer the consumer already has
  // installed — bundling a second copy of Echo would give the plugin a
  // different instance than the app's, which is the one bug this plugin cannot
  // afford.
  deps: { neverBundle: ['@pinia/colada', 'laravel-echo', 'vue'] }
});
