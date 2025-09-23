const baseStyles = `
.public-shell {
  display: flex;
  justify-content: center;
  min-height: 100vh;
  width: 100%;
}

.public-shell .mobile-container {
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  position: relative;
  overflow-x: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  background-color: var(--color-bg, #fdfdfd);
}

.public-shell #parallax-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  overflow: hidden;
}

.public-shell .parallax-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-position: center top;
  background-repeat: no-repeat;
  background-size: cover;
  z-index: 0;
}

.public-shell #content-wrapper {
  position: relative;
  z-index: 2;
  background-color: transparent;
}
`;

export function publicLayout({ title, content, extraStyles = '' }) {
  const html = `
    <div class="public-shell">
      <style>
        :root {
          --font-titles: 'Playfair Display', serif;
          --font-text: 'Lato', sans-serif;
          --color-primary: #a7c7e7;
          --color-bg: #fdfdfd;
          --color-dark: #444;
          --color-light: #fff;
        }
        ${baseStyles}
        ${extraStyles}
      </style>
      <div class="mobile-container">
        <div id="parallax-container">
          <div class="parallax-layer" id="parallax-bg" style="background-image: url('/assets/fondo.svg');"></div>
        </div>
        <div id="content-wrapper">
          ${content}
        </div>
      </div>
    </div>
  `;

  return {
    html,
    bodyClass: 'public-body',
    title,
  };
}
