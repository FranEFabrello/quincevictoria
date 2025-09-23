import {
  obtenerInvitados,
  subirInvitados,
  exportarLinks,
  exportarConfirmaciones,
  borrarInvitados,
  actualizarInvitado,
  logoutAdmin,
} from '../api.js';

function createCsv(headers, rows) {
  const csvRows = [headers.join(',')];
  rows.forEach(row => {
    const values = row.map(value => {
      const stringValue = value == null ? '' : String(value);
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  });
  return csvRows.join('\n');
}

function downloadFile(filename, content, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function renderAdminPanel() {
  const html = `
    <div class="admin-panel">
      <style>
        .admin-panel {
          max-width: 1200px;
          margin: 40px auto;
          background: #ffffff;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
        }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .admin-header h1 {
          margin: 0;
          color: #007bff;
        }
        .admin-header button {
          background: #dc3545;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          cursor: pointer;
          font-weight: bold;
        }
        .admin-section {
          margin-top: 32px;
        }
        .admin-section h2 {
          margin-bottom: 12px;
          color: #0f172a;
        }
        .admin-section p {
          margin-top: 0;
          color: #475569;
        }
        #estado-texto {
          font-size: 1.05em;
          font-weight: 500;
        }
        .upload-form,
        .admin-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: center;
        }
        .upload-form input[type="file"] {
          padding: 10px;
          border: 1px solid #cbd5f5;
          border-radius: 8px;
        }
        .upload-form button,
        .admin-actions button,
        .downloads button {
          padding: 12px 16px;
          border-radius: 8px;
          border: none;
          background: #007bff;
          color: #fff;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .upload-form button:disabled,
        .downloads button:disabled,
        .admin-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .admin-actions .danger {
          background: #dc3545;
        }
        .downloads {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 20px;
          margin-top: 12px;
        }
        .stat-card {
          background: #f8fafc;
          padding: 18px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
        }
        .stat-card h3 {
          margin: 0;
          font-size: 0.9em;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-card p {
          font-size: 2em;
          margin: 8px 0 0;
          color: #0f172a;
          font-weight: bold;
        }
        .table-container {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          margin-top: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 640px;
        }
        th, td {
          padding: 14px 16px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
        }
        th {
          background: #0f172a;
          color: #fff;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .status-chip {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.85em;
          color: #fff;
        }
        .status-chip.pendiente { background: #6c757d; }
        .status-chip.confirmado { background: #28a745; }
        .status-chip.rechazado { background: #dc3545; }
        .table-actions button {
          padding: 8px 12px;
          background: #ffc107;
          color: #212529;
          border-radius: 6px;
        }
        .feedback {
          margin-top: 12px;
          color: #0f172a;
          font-weight: 500;
        }
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }
        .modal-backdrop.hidden {
          display: none;
        }
        .modal-card {
          background: #fff;
          padding: 24px 28px;
          border-radius: 12px;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
        }
        .modal-card h3 {
          margin-top: 0;
          color: #0f172a;
        }
        .modal-card form {
          display: grid;
          gap: 14px;
        }
        .modal-card label {
          display: flex;
          flex-direction: column;
          font-weight: 600;
          color: #0f172a;
          text-align: left;
        }
        .modal-card input,
        .modal-card select {
          margin-top: 6px;
          padding: 10px 12px;
          border: 1px solid #cbd5f5;
          border-radius: 8px;
          font-size: 1em;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 12px;
        }
        .modal-actions button {
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
        }
        .modal-actions .save {
          background: #28a745;
          color: #fff;
          font-weight: bold;
        }
        .modal-actions .cancel {
          background: #e2e8f0;
          color: #0f172a;
        }
      </style>

      <div class="admin-header">
        <h1>Gestor de invitaciones</h1>
        <button id="logout-btn">Cerrar sesión</button>
      </div>

      <section class="admin-section">
        <p id="estado-texto">Cargando estado...</p>
        <p class="feedback" id="panel-feedback"></p>
      </section>

      <section class="admin-section">
        <h2>1. Subir Excel y generar links</h2>
        <form id="upload-form" class="upload-form">
          <input type="file" name="excel" accept=".xlsx,.xls" required />
          <button type="submit">Subir invitados</button>
        </form>
      </section>

      <section class="admin-section downloads">
        <div>
          <h2>2. Descargar archivos</h2>
          <button id="btn-links" disabled>Descargar lista de links</button>
          <button id="btn-confirmaciones" disabled>Descargar confirmaciones</button>
        </div>
      </section>

      <section class="admin-section admin-actions">
        <button id="btn-refrescar">Actualizar listado</button>
        <button id="btn-borrar" class="danger">Borrar todos los invitados</button>
      </section>

      <section class="admin-section">
        <h2>Resumen</h2>
        <div class="stats-grid" id="stats-grid">
          <!-- stats here -->
        </div>
      </section>

      <section class="admin-section">
        <h2>Listado de invitados</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Apellido</th>
                <th>Invitados</th>
                <th>Asistirán</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="tabla-invitados">
              <tr><td colspan="6" style="text-align:center; padding:20px;">Cargando invitados...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="modal-backdrop hidden" id="modal-editar">
      <div class="modal-card">
        <h3>Editar invitado</h3>
        <form id="form-editar">
          <label>Nombre
            <input type="text" name="nombre" required />
          </label>
          <label>Apellido
            <input type="text" name="apellido" />
          </label>
          <label>Cantidad invitada
            <input type="number" name="cantidad" min="0" required />
          </label>
          <label>Asistirán
            <input type="number" name="confirmados" min="0" required />
          </label>
          <label>Estado
            <select name="estado">
              <option value="pendiente">Pendiente</option>
              <option value="confirmado">Confirmado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </label>
          <div class="modal-actions">
            <button type="button" class="cancel" id="cancelar-edicion">Cancelar</button>
            <button type="submit" class="save">Guardar cambios</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const setup = ({ navigate }) => {
    const estadoTexto = document.getElementById('estado-texto');
    const feedback = document.getElementById('panel-feedback');
    const uploadForm = document.getElementById('upload-form');
    const linksBtn = document.getElementById('btn-links');
    const confirmacionesBtn = document.getElementById('btn-confirmaciones');
    const refrescarBtn = document.getElementById('btn-refrescar');
    const borrarBtn = document.getElementById('btn-borrar');
    const logoutBtn = document.getElementById('logout-btn');
    const tabla = document.getElementById('tabla-invitados');
    const statsGrid = document.getElementById('stats-grid');
    const modal = document.getElementById('modal-editar');
    const editarForm = document.getElementById('form-editar');
    const cancelarEdicion = document.getElementById('cancelar-edicion');

    let invitadosCache = [];
    let invitadoEnEdicion = null;

    const setFeedback = message => {
      if (feedback) {
        feedback.textContent = message || '';
      }
    };

    const actualizarStats = resumen => {
      if (!statsGrid) return;
      statsGrid.innerHTML = `
        <div class="stat-card">
          <h3>Invitaciones (grupos)</h3>
          <p>${resumen.grupos}</p>
        </div>
        <div class="stat-card">
          <h3>Invitados (personas)</h3>
          <p>${resumen.totalInvitados}</p>
        </div>
        <div class="stat-card">
          <h3>Asistentes confirmados</h3>
          <p>${resumen.confirmados}</p>
        </div>
        <div class="stat-card">
          <h3>Pendientes</h3>
          <p>${resumen.pendientes}</p>
        </div>
        <div class="stat-card">
          <h3>Rechazados</h3>
          <p>${resumen.rechazados}</p>
        </div>
      `;
    };

    const renderTabla = invitados => {
      if (!tabla) return;
      if (!invitados.length) {
        tabla.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No hay invitados cargados todavía.</td></tr>';
        return;
      }
      tabla.innerHTML = invitados.map(invitado => `
        <tr data-id="${invitado.id}">
          <td>${invitado.nombre || '-'}</td>
          <td>${invitado.apellido || '-'}</td>
          <td>${invitado.cantidad}</td>
          <td>${invitado.confirmados}</td>
          <td><span class="status-chip ${invitado.estado.toLowerCase()}">${invitado.estado}</span></td>
          <td class="table-actions"><button type="button" data-editar="${invitado.id}">Editar</button></td>
        </tr>
      `).join('');
    };

    const mostrarModal = invitado => {
      invitadoEnEdicion = invitado;
      if (!modal || !editarForm) return;
      modal.classList.remove('hidden');
      editarForm.nombre.value = invitado.nombre || '';
      editarForm.apellido.value = invitado.apellido || '';
      editarForm.cantidad.value = invitado.cantidad || 0;
      editarForm.confirmados.value = invitado.confirmados || 0;
      editarForm.estado.value = invitado.estado || 'pendiente';
    };

    const ocultarModal = () => {
      if (!modal) return;
      modal.classList.add('hidden');
      invitadoEnEdicion = null;
      editarForm?.reset();
    };

    const cargarInvitados = async () => {
      setFeedback('');
      try {
        const data = await obtenerInvitados();
        invitadosCache = data.invitados || [];
        actualizarStats(data.resumen);
        renderTabla(invitadosCache);
        if (estadoTexto) {
          const total = data.resumen.grupos;
          estadoTexto.textContent = total > 0
            ? `🎉 Ya hay ${total} invitaciones cargadas.`
            : '🔄 Aún no se cargaron invitaciones.';
        }
        if (linksBtn) linksBtn.disabled = invitadosCache.length === 0;
        if (confirmacionesBtn) confirmacionesBtn.disabled = invitadosCache.length === 0;
      } catch (error) {
        if (error.status === 401) {
          navigate('/admin/login');
          return;
        }
        setFeedback(error.payload?.message || 'No se pudo obtener el listado.');
        renderTabla([]);
      }
    };

    const handleUpload = async event => {
      event.preventDefault();
      if (!uploadForm) return;
      const input = uploadForm.querySelector('input[type="file"]');
      const submitButton = uploadForm.querySelector('button[type="submit"]');
      if (!input || !submitButton) return;
      if (!input.files?.length) {
        setFeedback('Seleccioná un archivo antes de subir.');
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = 'Subiendo...';
      setFeedback('Procesando archivo...');
      const formData = new FormData();
      formData.append('excel', input.files[0]);
      try {
        const respuesta = await subirInvitados(formData);
        setFeedback(`Se importaron ${respuesta.insertados || 0} invitados.`);
        uploadForm.reset();
        await cargarInvitados();
      } catch (error) {
        setFeedback(error.payload?.message || 'No se pudo procesar el archivo.');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Subir invitados';
      }
    };

    const handleDescargarLinks = async () => {
      try {
        const data = await exportarLinks();
        const rows = data.links || [];
        if (!rows.length) {
          setFeedback('No hay links para descargar.');
          return;
        }
        const csv = createCsv(['Nombre', 'Apellido', 'Link'], rows.map(item => [item.nombre || '', item.apellido || '', item.link]));
        downloadFile('links_invitados.csv', csv);
      } catch (error) {
        setFeedback(error.payload?.message || 'No se pudieron generar los links.');
      }
    };

    const handleDescargarConfirmaciones = async () => {
      try {
        const data = await exportarConfirmaciones();
        const rows = data.confirmaciones || [];
        if (!rows.length) {
          setFeedback('No hay confirmaciones registradas.');
          return;
        }
        const csv = createCsv(['Nombre', 'Apellido', 'Estado', 'Confirmados'], rows.map(item => [item.nombre || '', item.apellido || '', item.estado || '', item.confirmados || 0]));
        downloadFile('confirmaciones.csv', csv);
      } catch (error) {
        setFeedback(error.payload?.message || 'No se pudieron generar las confirmaciones.');
      }
    };

    const handleBorrar = async () => {
      if (!window.confirm('¿Seguro que querés borrar todos los invitados?')) return;
      try {
        await borrarInvitados();
        setFeedback('Todos los registros fueron eliminados.');
        await cargarInvitados();
      } catch (error) {
        setFeedback(error.payload?.message || 'No se pudo borrar la información.');
      }
    };

    const handleTablaClick = event => {
      const editarId = event.target.getAttribute('data-editar');
      if (!editarId) return;
      const invitado = invitadosCache.find(item => item.id === editarId);
      if (invitado) {
        mostrarModal(invitado);
      }
    };

    const handleEditar = async event => {
      event.preventDefault();
      if (!invitadoEnEdicion) return;
      const formData = new FormData(editarForm);
      const payload = {
        nombre: formData.get('nombre'),
        apellido: formData.get('apellido'),
        cantidad: formData.get('cantidad'),
        confirmados: formData.get('confirmados'),
        estado: formData.get('estado'),
      };
      try {
        await actualizarInvitado(invitadoEnEdicion.id, payload);
        setFeedback('Invitado actualizado correctamente.');
        ocultarModal();
        await cargarInvitados();
      } catch (error) {
        setFeedback(error.payload?.message || 'No se pudo actualizar el invitado.');
      }
    };

    const handleLogout = async () => {
      try {
        await logoutAdmin();
      } catch (error) {
        console.error(error);
      }
      navigate('/admin/login');
    };

    uploadForm?.addEventListener('submit', handleUpload);
    linksBtn?.addEventListener('click', handleDescargarLinks);
    confirmacionesBtn?.addEventListener('click', handleDescargarConfirmaciones);
    refrescarBtn?.addEventListener('click', cargarInvitados);
    borrarBtn?.addEventListener('click', handleBorrar);
    logoutBtn?.addEventListener('click', handleLogout);
    tabla?.addEventListener('click', handleTablaClick);
    editarForm?.addEventListener('submit', handleEditar);
    cancelarEdicion?.addEventListener('click', ocultarModal);
    const handleModalClick = event => {
      if (event.target === modal) {
        ocultarModal();
      }
    };
    modal?.addEventListener('click', handleModalClick);

    cargarInvitados();

    return () => {
      uploadForm?.removeEventListener('submit', handleUpload);
      linksBtn?.removeEventListener('click', handleDescargarLinks);
      confirmacionesBtn?.removeEventListener('click', handleDescargarConfirmaciones);
      refrescarBtn?.removeEventListener('click', cargarInvitados);
      borrarBtn?.removeEventListener('click', handleBorrar);
      logoutBtn?.removeEventListener('click', handleLogout);
      tabla?.removeEventListener('click', handleTablaClick);
      editarForm?.removeEventListener('submit', handleEditar);
      cancelarEdicion?.removeEventListener('click', ocultarModal);
      modal?.removeEventListener('click', handleModalClick);
    };
  };

  return {
    html,
    bodyClass: 'admin-body',
    title: 'Panel de administración',
    setup,
  };
}
