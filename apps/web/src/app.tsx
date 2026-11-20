import './styles/global.css';
import { RegistryProvider } from '@effect/atom-react';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from './components/ui/Primitives.tsx';
import { router } from './router.ts';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

createRoot(root).render(
  <StrictMode>
    <RegistryProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </RegistryProvider>
  </StrictMode>,
);
