import { renderHome } from './pages/home.js';
import { renderMensaje } from './pages/mensaje.js';
import { renderConfirmacion } from './pages/confirmacion.js';
import { renderGracias } from './pages/gracias.js';
import { renderAdminLogin } from './pages/admin-login.js';
import { renderAdminPanel } from './pages/admin-panel.js';

const notFound = () => renderMensaje({
  titulo: 'Página no encontrada',
  tituloH1: 'Ups! Página no encontrada',
  mensaje: 'El recurso solicitado no existe. Por favor verificá el enlace.',
});

const routes = [
  { pattern: /^\/$/, render: renderHome },
  { pattern: /^\/confirmar\/([^/]+)\/?$/, render: ({ params }) => renderConfirmacion(params[0]) },
  { pattern: /^\/gracias\/?$/, render: renderGracias },
  { pattern: /^\/admin\/login\/?$/, render: renderAdminLogin },
  { pattern: /^\/admin\/?$/, render: renderAdminPanel },
];

function matchRoute(pathname) {
  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (match) {
      return { route, params: match.slice(1) };
    }
  }
  return null;
}

export function createRouter(root) {
  let cleanupFn = null;

  async function renderCurrentRoute(replace = false) {
    const pathname = window.location.pathname.replace(/\/$/, match => (match === '/' ? '/' : '')) || '/';
    const matched = matchRoute(pathname);
    const route = matched ? matched.route : null;
    const params = matched ? matched.params : [];

    const result = route ? await route.render({ params }) : notFound();
    const { html, setup, bodyClass = 'public-body', title } = result;

    if (typeof cleanupFn === 'function') {
      cleanupFn();
      cleanupFn = null;
    }

    document.body.className = bodyClass;
    if (title) {
      document.title = title;
    }

    root.innerHTML = html;

    if (typeof setup === 'function') {
      const maybeCleanup = setup({ navigate: navigateInternal });
      if (typeof maybeCleanup === 'function') {
        cleanupFn = maybeCleanup;
      }
    }

    if (!route) {
      document.title = 'Página no encontrada';
    }
  }

  async function navigateInternal(path, { replace = false } = {}) {
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    await renderCurrentRoute(replace);
  }

  window.addEventListener('popstate', () => {
    renderCurrentRoute(true);
  });

  renderCurrentRoute(true);

  return {
    navigate: navigateInternal,
    refresh: renderCurrentRoute,
  };
}
