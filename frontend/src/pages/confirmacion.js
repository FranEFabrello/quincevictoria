import 'swiper/css/bundle';
import { obtenerInvitacion, enviarConfirmacion } from '../api.js';
import { renderMensaje } from './mensaje.js';

const COUNTDOWN_TARGET = new Date('November 29, 2025 22:00:00').getTime();

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invitacionTemplate(invitado) {
  const nombre = escapeHtml(invitado.nombre || '');
  const apellido = invitado.apellido ? ` ${escapeHtml(invitado.apellido)}` : '';
  const cantidad = Number(invitado.cantidad) || 0;
  const opciones = Array.from({ length: cantidad }, (_, index) => {
    const valor = index + 1;
    return `<option value="${valor}">${valor}</option>`;
  }).join('');

  return `
    <div class="invitacion-page">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@300;400&display=swap');

        :root {
          --font-titles: 'Playfair Display', serif;
          --font-text: 'Lato', sans-serif;
          --color-primary: #a7c7e7;
          --color-bg: #fdfdfd;
          --color-dark: #444;
          --color-light: #fff;
        }

        body.public-body {
          display: flex;
          justify-content: center;
          margin: 0;
          padding: 0;
          text-align: center;
        }

        .invitacion-page .mobile-container {
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          position: relative;
          overflow-x: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          background-color: var(--color-bg, #fdfdfd);
        }

        .invitacion-page #parallax-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: -1;
          overflow: hidden;
        }

        .invitacion-page .parallax-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-position: center top;
          background-repeat: no-repeat;
          background-size: cover;
          transition: background-position 0.3s;
          z-index: 0;
        }

        .invitacion-page #content-wrapper {
          position: relative;
          z-index: 2;
          background-color: transparent;
        }

        .invitacion-page #welcome-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(40, 60, 90, 0.85);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .invitacion-page #welcome-modal .modal-card {
          background: #fff;
          padding: 32px 24px;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
          text-align: center;
          max-width: 90vw;
        }

        .invitacion-page #welcome-modal h2 {
          color: #70A0C8;
          margin-bottom: 0.7em;
          font-family: var(--font-titles);
        }

        .invitacion-page #welcome-modal button {
          margin-top: 1.2em;
          background: #70A0C8;
          color: #fff;
          padding: 12px 32px;
          border: none;
          border-radius: 8px;
          font-size: 1.1em;
          cursor: pointer;
        }

        .invitacion-page .hero {
          position: relative;
          height: 100vh;
          width: 100%;
          background-image: url('/assets/arbol.svg');
          background-repeat: no-repeat;
          background-position: center top;
          background-size: cover;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .invitacion-page .hero-box {
          padding: 1.1em 0.7em;
          max-width: 100%;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 20vh !important;
        }

        .invitacion-page .hero-box h1 {
          color: #70A0C8;
          font-size: clamp(2.4em, 8vw, 4em);
          font-family: var(--font-titles);
          letter-spacing: 0.05em;
          margin-bottom: 0.12em;
        }

        .invitacion-page .hero-box p {
          color: #364b6e;
          margin: 0.12em 0;
          line-height: 1.18;
          font-size: 1.1em;
        }

        .invitacion-page .arbusto-section,
        .invitacion-page .arbusto2-section,
        .invitacion-page .arbusto3-section,
        .invitacion-page .arbusto-felino2,
        .invitacion-page .arbusto-felino3 {
          width: 100%;
          min-width: 100%;
          background-repeat: no-repeat;
          background-position: center bottom;
          background-size: cover;
          display: block;
          position: relative;
          z-index: 10;
          overflow: visible;
          border: none;
          background-color: transparent;
        }

        .invitacion-page .arbusto-section {
          aspect-ratio: 4911 / 3099;
          background-image: url('/assets/felino.svg');
          margin-top: -55% !important;
        }

        .invitacion-page .arbusto2-section {
          height: 175px;
          background-image: url('/assets/separador.svg');
          margin-top: -5vh;
        }

        .invitacion-page .arbusto3-section {
          height: 175px;
          background-image: url('/assets/separador.svg');
          margin-top: -5vh;
        }

        .invitacion-page .arbusto-felino2 {
          height: 330px;
          background-image: url('/assets/felino2.svg');
          margin-top: -19vh;
        }

        .invitacion-page .arbusto-felino3 {
          height: 330px;
          background-image: url('/assets/felino3.svg');
          margin-top: -19vh;
        }

        .invitacion-page main {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.95));
          padding-bottom: 60px;
        }

        .invitacion-page .section {
          padding: 40px 30px;
          position: relative;
        }

        .invitacion-page .section h2 {
          font-family: var(--font-titles);
          font-size: 2.2em;
          margin-bottom: 0.4em;
          color: #70A0C8;
        }

        .invitacion-page .section p {
          font-size: 1.05em;
          line-height: 1.6;
          color: #364b6e;
          margin: 0 auto 1em;
        }

        .invitacion-page .section .card {
          background: rgba(255, 255, 255, 0.9);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.1);
        }

        .invitacion-page #countdown {
          display: grid;
          grid-template-columns: repeat(2, minmax(120px, 1fr));
          gap: 16px;
          justify-items: center;
          margin-top: 20px;
        }

        .invitacion-page #countdown div {
          background: rgba(255,255,255,0.2);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px;
          min-width: 120px;
          color: var(--color-light);
        }

        .invitacion-page #countdown span {
          font-size: 2.4em;
          display: block;
          font-weight: bold;
        }

        .invitacion-page .swiper {
          width: 100%;
          padding-bottom: 60px;
        }

        .invitacion-page .swiper-slide {
          background-position: center;
          background-size: cover;
          width: 260px;
          height: 320px;
          border-radius: 16px;
          overflow: hidden;
        }

        .invitacion-page .swiper-slide img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .invitacion-page .swiper-navigation-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
        }

        .invitacion-page .swiper-button-next,
        .invitacion-page .swiper-button-prev {
          color: #fff;
        }

        .invitacion-page .swiper-pagination-bullet-active {
          background: #fff;
        }

        .invitacion-page iframe {
          border: none;
          border-radius: 12px;
          width: 100%;
          height: 320px;
        }

        .invitacion-page #music-player {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
        }

        .invitacion-page #music-player button {
          background: rgba(112, 160, 200, 0.9);
          color: #fff;
          border: none;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          font-size: 1.2em;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }

        .invitacion-page .decision-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .invitacion-page .decision-buttons label {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.8);
          border-radius: 12px;
          padding: 12px;
          border: 1px solid rgba(112,160,200,0.2);
          cursor: pointer;
        }

        .invitacion-page .decision-buttons input[type="radio"] {
          accent-color: #70A0C8;
          width: 20px;
          height: 20px;
        }

        .invitacion-page #cantidad-group {
          margin-bottom: 20px;
          text-align: left;
        }

        .invitacion-page select,
        .invitacion-page button[type="submit"] {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(112,160,200,0.3);
          font-size: 1em;
        }

        .invitacion-page button[type="submit"] {
          background: linear-gradient(135deg, #70A0C8, #A7C7E7);
          color: #fff;
          border: none;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .invitacion-page button[type="submit"]:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(112, 160, 200, 0.3);
        }

        .invitacion-page .form-error {
          color: #c0392b;
          font-weight: bold;
          margin-bottom: 12px;
        }

        .invitacion-page #leaves-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1;
        }

        .invitacion-page .leaf {
          position: absolute;
          width: 60px;
          height: 60px;
          background-repeat: no-repeat;
          background-size: contain;
          animation: fall 10s linear infinite;
        }

        .invitacion-page .leaf-1 { background-image: url('/assets/hoja1.svg'); }
        .invitacion-page .leaf-2 { background-image: url('/assets/hoja2.svg'); }
        .invitacion-page .leaf-3 { background-image: url('/assets/hoja3.svg'); }
        .invitacion-page .leaf-4 { background-image: url('/assets/hoja4.svg'); }

        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
      </style>

      <div id="welcome-modal">
        <div class="modal-card">
          <h2>¡Hola ${nombre}!</h2>
          <p>Bienvenido a la invitación de Victoria.<br>¡Te esperamos para celebrar sus 15 años!</p>
          <button id="welcome-accept">Aceptar</button>
        </div>
      </div>

      <div id="parallax-container">
        <div class="parallax-layer" id="parallax-bg" style="background-image: url('/assets/fondo.svg');"></div>
      </div>

      <div id="content-wrapper">
        <div id="music-player">
          <audio id="background-music" src="https://iswrdjaneaucntznqyjh.supabase.co/storage/v1/object/public/victoria//musica%20invitacion%203m.mp3" loop></audio>
          <button id="music-toggle" aria-label="Controlar Música"><i class="fas fa-play"></i></button>
        </div>

        <header class="hero">
          <div class="hero-box">
            <div class="blur-fade">
              <h1>VICTORIA</h1>
              <p>Te invito a celebrar</p>
              <p>Mis 15 Años</p>
            </div>
          </div>
        </header>

        <div class="arbusto-section"></div>

        <main>
          <section class="section countdown-section">
            <h2>Comienza la cuenta regresiva</h2>
            <div id="countdown">
              <div><span id="days">00</span><small>Días</small></div>
              <div><span id="hours">00</span><small>Horas</small></div>
              <div><span id="minutes">00</span><small>Minutos</small></div>
              <div><span id="seconds">00</span><small>Segundos</small></div>
            </div>
          </section>

          <div class="arbusto2-section"></div>

          <section class="section">
            <div class="section-content">
              <h2>La Fiesta</h2>
              <p>Tengo el agrado de invitarte <br> a la celebración de mis quince años.<br>¡Quiero que seas parte de mi noche soñada!</p>
              <p><strong>SÁBADO, 29 <br> DE NOVIEMBRE DE 2025</strong></p>
              <p><strong>22:00 hs</strong></p>
              <p><strong>Club Citricultores</strong></p>
            </div>
          </section>

          <div class="arbusto-felino2" style="transform: scaleX(-1);"></div>

          <section class="section">
            <h2>Un pequeño recuerdo</h2>
            <div class="swiper">
              <div class="swiper-wrapper">
                <div class="swiper-slide"><img src="https://images.unsplash.com/photo-1613924457768-4c1f46f43d11?q=80&w=1171&auto=format&fit=crop" alt="Foto de Victoria 1"></div>
                <div class="swiper-slide"><img src="https://images.unsplash.com/photo-1613789599680-e95673ca7d80?q=80&w=687&auto=format&fit=crop" alt="Foto de Victoria 2"></div>
                <div class="swiper-slide"><img src="https://images.unsplash.com/photo-1527345925176-fbb4fd90033e?q=80&w=2070&auto=format&fit=crop" alt="Foto de Victoria 3"></div>
                <div class="swiper-slide"><img src="https://images.unsplash.com/photo-1562346531-6fd51e998566?q=80&w=709&auto=format&fit=crop" alt="Foto de Victoria 4"></div>
                <div class="swiper-slide"><img src="https://images.unsplash.com/photo-1542370773-ae6d54f6748d?q=80&w=687&auto=format&fit=crop" alt="Foto de Victoria 5"></div>
                <div class="swiper-slide"><img src="https://images.unsplash.com/photo-1513597607252-a125b383749a?q=80&w=1170&auto=format&fit=crop" alt="Foto de Victoria 6"></div>
              </div>
              <div class="swiper-navigation-container">
                <div class="swiper-button-prev"></div>
                <div class="swiper-pagination"></div>
                <div class="swiper-button-next"></div>
              </div>
            </div>
          </section>

          <div class="arbusto2-section"></div>

          <section class="section">
            <h2>Regalos</h2>
            <p>Tu presencia es el mejor regalo que puedo recibir.<br>Si deseas hacerme un obsequio, habrá un buzón disponible en la fiesta.</p>
          </section>

          <div class="arbusto-felino3" style="transform: scaleX(-1);"></div>

          <section class="section">
            <div class="section-content">
              <h2>Dress Code</h2>
              <p>Vestimenta sugerida: <strong>Elegante</strong>.<br>¡Sentite libre de brillar y disfrutar la noche!</p>
            </div>
          </section>

          <div class="arbusto3-section"></div>

          <section class="section">
            <div class="section-content">
              <h2>Ubicación</h2>
              <p><strong>Club Citricultores</strong></p>
              <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3445.183410153992!2d-57.67156042473693!3d-30.28883984265238!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95ad2847b19e059b%3A0xb3af2f0a44da8b29!2sClub%20Citricultores!5e0!3m2!1ses!2sar!4v1754266494672!5m2!1ses!2sar" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            </div>
          </section>

          <div class="arbusto3-section" style="transform: scaleX(-1);"></div>

          <section class="section">
            <h2>Confirmar Asistencia</h2>
            <div class="card">
              <h3>¡Hola, ${nombre}${apellido}!</h3>
              <p>Tu invitación es válida para <strong>${cantidad} persona(s)</strong>.</p>
              <p>Por favor, confirma tu asistencia antes del 10 de Noviembre.</p>
              <form id="confirm-form">
                <div class="form-group decision-buttons">
                  <label>
                    <input type="radio" id="asistencia_si" name="decision" value="confirmado" checked>
                    <span><i class="fas fa-check"></i> Sí, asistiré</span>
                  </label>
                  <label>
                    <input type="radio" id="asistencia_no" name="decision" value="rechazado">
                    <span><i class="fas fa-times"></i> No podré asistir</span>
                  </label>
                </div>
                <div id="cantidad-group" class="form-group">
                  <label for="cantidad">¿Cuántos de los ${cantidad} asistirán?</label>
                  <select id="cantidad" name="confirmados" required>
                    ${opciones}
                  </select>
                </div>
                <p class="form-error hidden" id="form-error"></p>
                <button type="submit">Enviar Confirmación</button>
              </form>
            </div>
          </section>
        </main>
      </div>

      <div id="leaves-container"></div>
    </div>
  `;
}

function createConfirmacionSetup(invitado) {
  return ({ navigate }) => {
    const page = document.querySelector('.invitacion-page');
    if (!page) return undefined;

    const cleanupCallbacks = [];

    const countdownIds = page.querySelectorAll('#days, #hours, #minutes, #seconds');

    const updateCountdown = () => {
      const now = new Date().getTime();
      const gap = COUNTDOWN_TARGET - now;
      const second = 1000;
      const minute = second * 60;
      const hour = minute * 60;
      const day = hour * 24;
      const textDay = Math.max(0, Math.floor(gap / day));
      const textHour = Math.max(0, Math.floor((gap % day) / hour));
      const textMinute = Math.max(0, Math.floor((gap % hour) / minute));
      const textSecond = Math.max(0, Math.floor((gap % minute) / second));

      const values = [textDay, textHour, textMinute, textSecond].map(value => String(value).padStart(2, '0'));
      countdownIds.forEach((element, index) => {
        element.textContent = values[index];
      });
    };

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);
    cleanupCallbacks.push(() => clearInterval(countdownInterval));

    const bgLayer = page.querySelector('#parallax-bg');
    const onScroll = () => {
      const docHeight = document.body.scrollHeight - window.innerHeight;
      const scrollY = window.scrollY;
      const percent = docHeight === 0 ? 0 : scrollY / docHeight;
      if (bgLayer) {
        bgLayer.style.backgroundPosition = `center ${percent * 100}%`;
      }
    };
    window.addEventListener('scroll', onScroll);
    cleanupCallbacks.push(() => window.removeEventListener('scroll', onScroll));

    const leavesContainer = page.querySelector('#leaves-container');
    const createLeaf = () => {
      if (!leavesContainer) return;
      const leaf = document.createElement('div');
      const leafTypes = 4;
      const randomLeafType = Math.floor(Math.random() * leafTypes) + 1;
      leaf.classList.add('leaf', `leaf-${randomLeafType}`);
      leaf.style.left = `${Math.random() * 100}vw`;
      leaf.style.animationDuration = `${Math.random() * 5 + 8}s`;
      leaf.style.animationDelay = `${Math.random() * 5}s`;
      leavesContainer.appendChild(leaf);
      const removeTimeout = setTimeout(() => leaf.remove(), 13000);
      cleanupCallbacks.push(() => clearTimeout(removeTimeout));
    };

    const leavesInterval = setInterval(createLeaf, 800);
    cleanupCallbacks.push(() => clearInterval(leavesInterval));

    const music = page.querySelector('#background-music');
    const musicBtn = page.querySelector('#music-toggle');
    const musicIcon = musicBtn?.querySelector('i');
    let hasInteracted = false;

    const updateMusicIcon = () => {
      if (!musicIcon || !music) return;
      musicIcon.className = music.paused ? 'fas fa-play' : 'fas fa-pause';
    };

    const toggleMusic = () => {
      if (!music) return;
      hasInteracted = true;
      if (music.paused) {
        music.play().then(updateMusicIcon).catch(() => {});
      } else {
        music.pause();
        updateMusicIcon();
      }
    };

    if (musicBtn) {
      musicBtn.addEventListener('click', toggleMusic);
      cleanupCallbacks.push(() => musicBtn.removeEventListener('click', toggleMusic));
    }

    const onBodyClick = () => {
      if (!hasInteracted && music && music.paused) {
        music.play().then(() => {
          hasInteracted = true;
          updateMusicIcon();
        }).catch(() => {});
      }
    };

    document.body.addEventListener('click', onBodyClick, { once: true });
    cleanupCallbacks.push(() => document.body.removeEventListener('click', onBodyClick));

    const welcomeButton = page.querySelector('#welcome-accept');
    const welcomeModal = page.querySelector('#welcome-modal');
    if (welcomeButton && welcomeModal) {
      const closeModal = () => {
        welcomeModal.style.display = 'none';
        if (music) {
          music.play().then(updateMusicIcon).catch(() => {});
        }
      };
      welcomeButton.addEventListener('click', closeModal);
      cleanupCallbacks.push(() => welcomeButton.removeEventListener('click', closeModal));
    }

    import('swiper/bundle').then(({ default: Swiper }) => {
      const swiperElement = page.querySelector('.swiper');
      if (swiperElement) {
        // eslint-disable-next-line no-new
        new Swiper(swiperElement, {
          effect: 'coverflow',
          grabCursor: true,
          centeredSlides: true,
          slidesPerView: 'auto',
          coverflowEffect: {
            rotate: 50,
            stretch: 0,
            depth: 100,
            modifier: 1,
            slideShadows: true,
          },
          loop: true,
          autoplay: {
            delay: 5000,
            disableOnInteraction: false,
          },
          pagination: {
            el: '.swiper-pagination',
            clickable: true,
          },
          navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
          },
        });
      }
    }).catch(() => {});

    const decisionInputs = page.querySelectorAll('input[name="decision"]');
    const cantidadGroup = page.querySelector('#cantidad-group');
    const cantidadSelect = page.querySelector('#cantidad');

    const updateCantidadVisibility = () => {
      const decision = page.querySelector('input[name="decision"]:checked')?.value;
      const showCantidad = decision !== 'rechazado';
      if (cantidadGroup) {
        cantidadGroup.style.display = showCantidad ? 'block' : 'none';
      }
      if (cantidadSelect) {
        cantidadSelect.required = showCantidad;
      }
    };

    decisionInputs.forEach(input => {
      input.addEventListener('change', updateCantidadVisibility);
      cleanupCallbacks.push(() => input.removeEventListener('change', updateCantidadVisibility));
    });
    updateCantidadVisibility();

    const form = page.querySelector('#confirm-form');
    const errorBox = page.querySelector('#form-error');
    const submitButton = form?.querySelector('button[type="submit"]');

    const handleSubmit = async event => {
      event.preventDefault();
      if (!form || !submitButton) return;

      const formData = new FormData(form);
      const decision = formData.get('decision');
      let confirmados = formData.get('confirmados');
      if (decision === 'rechazado') {
        confirmados = '0';
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Enviando...';
      if (errorBox) {
        errorBox.classList.add('hidden');
        errorBox.textContent = '';
      }

      try {
        await enviarConfirmacion(invitado.id, { decision, confirmados });
        navigate('/gracias');
      } catch (error) {
        if (errorBox) {
          errorBox.textContent = error.payload?.message || 'No se pudo guardar la confirmación.';
          errorBox.classList.remove('hidden');
        }
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar Confirmación';
      }
    };

    if (form) {
      form.addEventListener('submit', handleSubmit);
      cleanupCallbacks.push(() => form.removeEventListener('submit', handleSubmit));
    }

    return () => {
      cleanupCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          // ignore
        }
      });
    };
  };
}

export async function renderConfirmacion(id) {
  try {
    const data = await obtenerInvitacion(id);
    if (!data?.ok) {
      return renderMensaje({
        titulo: 'Invitación no encontrada',
        tituloH1: 'Invitación no encontrada',
        mensaje: 'El enlace que utilizaste no parece ser válido. Por favor, verifica el link o contacta a los organizadores.',
      });
    }

    if (!data.puedeResponder) {
      return renderMensaje({
        titulo: 'Invitación ya respondida',
        tituloH1: '¡Gracias por tu respuesta!',
        mensaje: 'Ya hemos registrado tu respuesta para esta invitación. Si necesitás hacer algún cambio, por favor contactá a los organizadores.',
      });
    }

    const html = invitacionTemplate(data.invitado);
    return {
      html,
      bodyClass: 'public-body',
      title: 'Confirmar invitación',
      setup: createConfirmacionSetup(data.invitado),
    };
  } catch (error) {
    return renderMensaje({
      titulo: 'Error',
      tituloH1: 'Ocurrió un problema',
      mensaje: 'No pudimos cargar tu invitación en este momento. Inténtalo nuevamente más tarde.',
    });
  }
}
