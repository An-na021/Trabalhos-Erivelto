const unavailable = 'O servidor de salas não está disponível neste endereço. Confira a configuração da publicação ou reinicie o servidor local da competição.';

export const onlineMode = Boolean(import.meta.env?.VITE_API_URL?.trim());

export function apiUrl(path, base = import.meta.env?.VITE_API_URL || '') {
  return base.trim().replace(/\/+$/, '') + path;
}

export async function requestApi(path, body, credential, fetcher = fetch, method = body === undefined ? 'GET' : 'POST') {
  let response;
  try {
    response = await fetcher(apiUrl(path), {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Confira sua conexão. Se estiver jogando localmente, verifique se o terminal da competição continua aberto.');
  }
  let result;
  try {
    const text = await response.text();
    if (!response.headers.get('content-type')?.includes('application/json') || !text.trim()) throw new Error();
    result = JSON.parse(text);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
  } catch {
    const error = new Error(unavailable);
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(typeof result.error === 'string' ? result.error : 'Não foi possível concluir a solicitação. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function deleteApi(path, credential) {
  return requestApi(path, undefined, credential, fetch, 'DELETE');
}
