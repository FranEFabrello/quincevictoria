import { publicLayout } from '../components/public-layout.js';

export function renderHome() {
  const extraStyles = `
    main {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 25px;
    }
    .card-mensaje-content {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.15);
      max-width: 90%;
    }
    .card-mensaje-content h1 {
      font-family: var(--font-titles);
      color: #70A0C8;
      font-size: 2.2em;
      margin-bottom: 0.5em;
    }
    .card-mensaje-content p {
      font-size: 1.1em;
      line-height: 1.6;
      color: var(--color-dark);
    }
  `;

  const content = `
    <main>
      <div class="card-mensaje">
        <div class="card-mensaje-content">
          <h1>Bienvenido</h1>
          <p>Este es el portal para la confirmación de asistencia a los 15 años de Victoria.</p>
          <p>Si recibiste un enlace de invitación, por favor úsalo para acceder.</p>
        </div>
      </div>
    </main>
  `;

  const layout = publicLayout({
    title: 'Bienvenido',
    content,
    extraStyles,
  });

  return {
    ...layout,
  };
}
