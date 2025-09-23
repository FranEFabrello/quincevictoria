import { publicLayout } from '../components/public-layout.js';

export function renderMensaje({ titulo = 'Aviso', tituloH1, mensaje }) {
  const extraStyles = `
    main {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 25px;
      text-align: center;
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
      font-size: 2.1em;
      margin-bottom: 0.5em;
    }
    .card-mensaje-content p {
      font-size: 1.05em;
      line-height: 1.6;
      color: var(--color-dark);
    }
  `;

  const content = `
    <main>
      <div class="card-mensaje">
        <div class="card-mensaje-content">
          <h1>${tituloH1}</h1>
          <p>${mensaje}</p>
        </div>
      </div>
    </main>
  `;

  const layout = publicLayout({
    title: titulo,
    content,
    extraStyles,
  });

  return {
    ...layout,
  };
}
