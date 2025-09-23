import { API_BASE_URL } from './config.js';

async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return null;
}

async function handleResponse(response) {
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(data?.message || 'Error en la solicitud');
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function apiGet(path) {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse(response);
}

export async function apiPost(path, body) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export async function apiPut(path, body) {
  const response = await fetch(buildUrl(path), {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export async function apiDelete(path) {
  const response = await fetch(buildUrl(path), {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(response);
}

export async function apiUpload(path, formData) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return handleResponse(response);
}

export const getEstado = () => apiGet('/api/estado');
export const loginAdmin = clave => apiPost('/api/admin/login', { clave });
export const logoutAdmin = () => apiPost('/api/admin/logout', {});
export const obtenerInvitacion = id => apiGet(`/api/confirmar/${encodeURIComponent(id)}`);
export const enviarConfirmacion = (id, payload) => apiPost(`/api/confirmar/${encodeURIComponent(id)}`, payload);
export const obtenerInvitados = () => apiGet('/api/invitados');
export const actualizarInvitado = (id, payload) => apiPut(`/api/invitados/${encodeURIComponent(id)}`, payload);
export const borrarInvitados = () => apiDelete('/api/invitados');
export const subirInvitados = formData => apiUpload('/api/invitados/upload', formData);
export const exportarLinks = () => apiGet('/api/invitados/export/links');
export const exportarConfirmaciones = () => apiGet('/api/invitados/export/confirmaciones');
