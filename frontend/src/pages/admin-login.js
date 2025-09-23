import { loginAdmin } from '../api.js';

export function renderAdminLogin() {
  const html = `
    <div class="admin-login-page">
      <style>
        .admin-login-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .admin-login-card {
          background: #ffffff;
          padding: 40px 32px;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
          max-width: 380px;
          width: 100%;
          text-align: center;
        }
        .admin-login-card h1 {
          margin-top: 0;
          color: #007bff;
        }
        .admin-login-card p {
          color: #6c757d;
          margin-bottom: 24px;
        }
        .admin-login-card form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .admin-login-card input[type="password"] {
          padding: 12px 14px;
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          font-size: 1em;
        }
        .admin-login-card button {
          background: #007bff;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 1em;
          cursor: pointer;
          font-weight: bold;
        }
        .admin-login-card button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .admin-login-card .error {
          color: #dc3545;
          font-weight: bold;
        }
        .admin-login-card a {
          color: #007bff;
          text-decoration: none;
          font-size: 0.95em;
        }
      </style>
      <div class="admin-login-card">
        <h1>Acceso administrador</h1>
        <p>Ingresá la clave para administrar las invitaciones.</p>
        <form id="admin-login-form">
          <input type="password" name="clave" placeholder="Clave de acceso" required />
          <p class="error hidden" id="admin-login-error"></p>
          <button type="submit">Ingresar</button>
        </form>
        <p style="margin-top:16px;"><a href="/">Volver al sitio público</a></p>
      </div>
    </div>
  `;

  const setup = ({ navigate }) => {
    const form = document.getElementById('admin-login-form');
    const errorBox = document.getElementById('admin-login-error');
    const submitButton = form?.querySelector('button[type="submit"]');

    if (!form || !submitButton) return undefined;

    const handleSubmit = async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const clave = formData.get('clave');
      submitButton.disabled = true;
      submitButton.textContent = 'Validando...';
      if (errorBox) {
        errorBox.classList.add('hidden');
        errorBox.textContent = '';
      }

      try {
        await loginAdmin(clave);
        navigate('/admin');
      } catch (error) {
        if (errorBox) {
          errorBox.textContent = error.payload?.message || 'Clave incorrecta';
          errorBox.classList.remove('hidden');
        }
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Ingresar';
        form.reset();
      }
    };

    form.addEventListener('submit', handleSubmit);
    return () => form.removeEventListener('submit', handleSubmit);
  };

  return {
    html,
    bodyClass: 'admin-body',
    title: 'Acceso administrador',
    setup,
  };
}
