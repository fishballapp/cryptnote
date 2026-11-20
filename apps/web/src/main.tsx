// Safari lacks native Temporal, so load the polyfill dynamically before importing the app.
if (!('Temporal' in globalThis)) await import('temporal-polyfill/global');
await import('./app.tsx');

export {};
