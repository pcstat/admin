import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', '.open-next/**', 'node_modules/**', 'next-env.d.ts', 'local-data/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
