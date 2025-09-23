import { renderMensaje } from './mensaje.js';

export function renderGracias() {
  return renderMensaje({
    titulo: 'Confirmación enviada',
    tituloH1: '¡Respuesta enviada!',
    mensaje: 'Muchas gracias por tu confirmación. ¡Te esperamos para celebrar!',
  });
}
