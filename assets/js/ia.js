// Recursos de IA (Claude) com a chave da própria pessoa, direto do navegador.
// A chave nunca passa por um servidor nosso: o navegador fala direto com a API da Anthropic.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm';
export const MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const KEY_STORAGE = 'anthropic-api-key';

let sessionKey = null;
let sdkPromise = null;

function readStored() { try { return localStorage.getItem(KEY_STORAGE); } catch { return null; } }
function writeStored(v) { try { v ? localStorage.setItem(KEY_STORAGE, v) : localStorage.removeItem(KEY_STORAGE); } catch { /* sem armazenamento */ } }

export function getKey() { return sessionKey || readStored(); }
export function hasKey() { return !!getKey(); }
export function setKey(key, remember) {
  sessionKey = key || null;
  writeStored(remember ? key : null);
  document.dispatchEvent(new CustomEvent('iakeychange'));
}

async function sdk() {
  if (!sdkPromise) sdkPromise = import(SDK_URL).then(m => m.default || m.Anthropic);
  return sdkPromise;
}

export async function client() {
  const key = getKey();
  if (!key) throw new Error('Informe sua chave da API da Anthropic para usar a IA.');
  const Anthropic = await sdk();
  return { Anthropic, client: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) };
}

// Parâmetros comuns: modelo atual + fallback automático em caso de recusa por política.
export function baseParams() {
  return { model: MODEL, betas: [FALLBACK_BETA], fallbacks: 'default' };
}

export async function explainError(err) {
  let A = null;
  try { A = await sdk(); } catch { /* SDK não carregou */ }
  if (A) {
    if (err instanceof A.AuthenticationError) return 'Chave da API inválida ou revogada. Confira a chave e tente de novo.';
    if (err instanceof A.PermissionDeniedError) return 'Esta chave não tem permissão para este modelo ou recurso.';
    if (err instanceof A.NotFoundError) return 'Modelo ou recurso não encontrado para a sua conta.';
    if (err instanceof A.RateLimitError) return 'Limite de uso da API atingido. Espere um pouco e tente de novo.';
    if (err instanceof A.BadRequestError) return `A API recusou a requisição: ${err.message}`;
    if (err instanceof A.InternalServerError) return 'A API da Anthropic está instável no momento. Tente de novo em instantes.';
    if (err instanceof A.APIConnectionError) return 'Não foi possível conectar à API da Anthropic. Verifique sua internet.';
    if (err instanceof A.APIError) return `Erro da API (${err.status ?? '?'}): ${err.message}`;
  }
  if (String(err?.message || '').includes('import')) return 'Não foi possível carregar a biblioteca da Anthropic (verifique sua conexão ou bloqueadores).';
  return err?.message || String(err);
}

export function refusalMessage(msg) {
  const cat = msg?.stop_details?.category;
  return `O modelo recusou esta solicitação${cat ? ` (categoria: ${cat})` : ''}. Reformule o pedido.`;
}

// Painel para informar, lembrar ou apagar a chave.
export function mountKeyPanel(el) {
  const esc = window.LT.esc;
  function render() {
    const k = getKey();
    const lembrada = !!readStored();
    el.innerHTML = k ? `
      <div class="row" style="align-items:center">
        <p style="margin:0">Chave conectada: <code>${esc(k.slice(0, 10))}…${esc(k.slice(-4))}</code> ${lembrada ? '<span class="tag">lembrada neste navegador</span>' : '<span class="tag">só nesta aba</span>'}</p>
        <div style="flex:0 0 auto"><button class="btn secondary" type="button" data-act="sair">Remover chave</button></div>
      </div>` : `
      <label for="ia-key">Chave da API da Anthropic <span class="hint">(começa com sk-ant-)</span></label>
      <div class="row">
        <input type="password" id="ia-key" placeholder="sk-ant-..." autocomplete="off" spellcheck="false">
        <div style="flex:0 0 auto"><button class="btn" type="button" data-act="salvar">Conectar</button></div>
      </div>
      <label class="check"><input type="checkbox" id="ia-lembrar"> Lembrar neste navegador</label>
      <p class="muted" style="font-size:.85rem;margin:.4rem 0 0">A chave fica só no seu navegador e vai direto para a API da Anthropic. O uso é cobrado na sua conta da Anthropic. Crie uma chave em <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Não use em computadores compartilhados.</p>`;
  }
  el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'salvar') {
      const v = el.querySelector('#ia-key').value.trim();
      if (!v) return;
      setKey(v, el.querySelector('#ia-lembrar').checked);
    } else if (act === 'sair') {
      setKey(null, false);
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ia-key') { e.preventDefault(); el.querySelector('[data-act="salvar"]').click(); } });
  document.addEventListener('iakeychange', render);
  render();
}
