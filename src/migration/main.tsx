import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactMigrationShell } from './ReactMigrationShell';

const root = document.getElementById('root');

if (!root) throw new Error('React migration shell root is missing');

createRoot(root).render(
  <StrictMode>
    <ReactMigrationShell />
  </StrictMode>
);
