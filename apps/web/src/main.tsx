import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './i18n/index.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/archive.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// 设计预览页只在开发环境可用（`pnpm dev` 后访问 #design），生产构建里这段是死代码。
const DesignPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./pages/DesignPreviewPage.tsx').then((module) => ({
        default: module.DesignPreviewPage,
      })),
    )
  : null;
const showDesign = DesignPreview !== null && window.location.hash === '#design';

createRoot(container).render(
  <StrictMode>
    {showDesign && DesignPreview ? (
      <Suspense fallback={null}>
        <DesignPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
