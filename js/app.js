// =====================================================================
//  InovaBio · app do estojo — lógica das telas (protótipo, dados simulados)
// =====================================================================
import {
  LIMITES, STATUS, statusDe, descricaoStatus, fmt, fmtHora, fmtHoraSeg,
  gerarHistorico, ajustarFinal, estatisticas, eventosDe, alertasDe,
  criarSimulador, conectarCliente, montarPainel, ESTADO_INICIAL, DISPOSITIVO,
} from './sim.js';
import { SIMBOLO, PALAVRA, LOGO } from './marca.js';

// logo Nimblit inline: as cores seguem o tema (variáveis --logo-*)
export function logoSVG({ simbolo = 'var(--logo-simbolo)', palavra = 'var(--logo-palavra)' } = {}) {
  return `<svg class="logo" viewBox="0 0 ${LOGO.w} ${LOGO.h}" role="img" aria-label="Nimblit">
    <path style="fill:${simbolo}" d="${SIMBOLO.d}"/>
    <path style="fill:${palavra}" fill-rule="evenodd" transform="translate(${SIMBOLO.w + LOGO.gap} ${LOGO.dy})" d="${PALAVRA.d}"/></svg>`;
}
document.querySelectorAll('[data-logo]').forEach((el) => { el.innerHTML = logoSVG(); });
{
  // logo impressa na frente da caixa, na ilustração do pareamento (versão escura)
  const g = document.getElementById('par-logo');
  if (g) g.innerHTML = `<path fill="#5ED8EF" d="${SIMBOLO.d}"/><path fill="#FFFFFF" fill-rule="evenodd" transform="translate(${SIMBOLO.w + LOGO.gap} ${LOGO.dy})" d="${PALAVRA.d}"/>`;
}

const P = new URLSearchParams(location.search);
const emFrame = window.self !== window.top;
const limpo = P.has('limpo') || emFrame;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const DIA = 864e5;

// ------------------------------------------------------------ preferências
function ler(chave, padrao) {
  try { return { ...padrao, ...JSON.parse(localStorage.getItem(chave) || '{}') }; } catch { return { ...padrao }; }
}
function gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado */ } }
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ajustes = ler('inovabio-ajustes', {
  limite: 30, 'n-temp': true, 'n-ble': true, 'n-caneta': true, 'n-tomada': false, 'n-cuidador': true,
});
const caneta = ler('inovabio-caneta', { tipo: 'FlexPen', abertura: isoDia(new Date(Date.now() - 11 * DIA)), prazo: 28 });

// ------------------------------------------------------------ estado inicial
const inicial = { ...ESTADO_INICIAL };
if (P.has('temp')) inicial.temp = parseFloat(P.get('temp'));
if (P.has('tomada')) inicial.tomada = P.get('tomada') !== '0';
if (P.has('conectado')) inicial.conectado = P.get('conectado') !== '0';
if (P.has('tema')) inicial.tema = P.get('tema');

let estado = { ...inicial };
let leitura = { temp: estado.temp, hora: new Date() };    // última leitura recebida por Bluetooth
const hist = gerarHistorico(new Date(), estado.temp);
const pontos = hist.pontos;
const eventosVivos = [];
const alertasVivos = [];
let naoLidos = 0;

// ------------------------------------------------------------ navegação
const TELAS = ['inicio', 'historico', 'alertas', 'caneta', 'ajustes', 'pareamento'];
let telaAtual = null;

function mostrarTela(nome, { rolarTopo = true } = {}) {
  if (!TELAS.includes(nome)) nome = 'inicio';
  if (nome === telaAtual) return;
  telaAtual = nome;
  app.dataset.tela = nome;
  $$('.tela').forEach((t) => {
    const ativa = t.dataset.tela === nome;
    t.classList.toggle('ativa', ativa);
    if (ativa && rolarTopo) t.scrollTop = 0;
  });
  $$('.barra [data-ir]').forEach((b) => {
    if (b.dataset.ir === nome) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (!emFrame) history.replaceState(null, '', `${location.pathname}${location.search}#${nome}`);
  if (nome === 'inicio') { iniciar3D(); desenharMini(); }
  if (nome === 'historico') desenharHistorico();
  if (nome === 'alertas') { naoLidos = 0; atualizarBadge(); desenharAlertas(); }
  if (nome === 'caneta') desenharCaneta();
  if (nome === 'ajustes') desenharAjustes();
}

document.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-ir]');
  if (alvo) mostrarTela(alvo.dataset.ir);
});

// ------------------------------------------------------------ relógio e saudação
function relogio() {
  const agora = new Date();
  $('#relogio').textContent = agora.toLocaleTimeString('pt-BR', { hour: 'numeric', minute: '2-digit' });
  $('#bl-hora').textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#bl-data').textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}
relogio();
setInterval(relogio, 15000);

// ------------------------------------------------------------ 3D
let estojo = null;
let tentou3D = false;
async function iniciar3D() {
  if (tentou3D) return;
  tentou3D = true;
  const palco = $('#palco');
  try {
    const { criarEstojo3D } = await import('./estojo3d.js');
    estojo = criarEstojo3D(palco, { status: statusDe(estado.temp), tomada: estado.tomada, captura: P.has('captura') });
    if (P.get('tampa') === 'aberta') estojo.alternarTampa(true);
    palco.addEventListener('tampa', (e) => {
      $('#palco-dica span').textContent = e.detail.aberta ? 'Toque para fechar a tampa' : 'Arraste para girar · toque para abrir';
    });
  } catch (err) {
    console.warn('3D indisponível:', err);
    const f = document.createElement('div');
    f.className = 'palco-falha';
    f.textContent = 'Não foi possível mostrar o estojo em 3D neste aparelho.';
    palco.append(f);
    $('#palco-dica').hidden = true;
  }
}
$('#palco').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && estojo) { e.preventDefault(); estojo.alternarTampa(); }
});

// ------------------------------------------------------------ temperatura animada
let tempExibida = null;
let rafTemp = 0;
function animarTemp(alvo) {
  const el = $('#temp-num');
  if (tempExibida === null || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    tempExibida = alvo; el.textContent = fmt(alvo); return;
  }
  const de = tempExibida;
  if (Math.abs(de - alvo) < 0.05) { el.textContent = fmt(alvo); tempExibida = alvo; return; }
  const t0 = performance.now(), dur = 650;
  cancelAnimationFrame(rafTemp);
  el.classList.remove('pulso'); void el.offsetWidth; el.classList.add('pulso');
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    tempExibida = de + (alvo - de) * e;
    el.textContent = fmt(tempExibida);
    if (k < 1) rafTemp = requestAnimationFrame(passo);
  };
  rafTemp = requestAnimationFrame(passo);
}

// ------------------------------------------------------------ início
function desenharInicio() {
  const t = leitura.temp;
  const s = statusDe(t);
  const info = STATUS[s];
  const card = $('#c-temp');
  card.dataset.status = s;
  animarTemp(t);
  const selo = $('#selo');
  selo.innerHTML = `<svg class="ic"><use href="#${info.icone}"/></svg><span>${info.rotulo}</span>`;
  $('#temp-desc').textContent = estado.conectado
    ? descricaoStatus(t)
    : `Sem conexão com o estojo. Mostrando a última leitura, das ${fmtHora(leitura.hora)}.`;
  card.style.opacity = estado.conectado ? '' : '.78';

  // energia
  $('#energia-tit').textContent = estado.tomada ? 'Na tomada' : 'Fora da tomada';
  $('#energia-txt').textContent = estado.tomada ? 'Resfriando' : 'Isolamento segurando';
  $('#energia-ic').innerHTML = `<svg class="ic"><use href="#${estado.tomada ? 'i-floco' : 'i-plug-off'}"/></svg>`;
  $('#energia-ic').classList.toggle('cinza', !estado.tomada);

  // bluetooth
  $('#ble-tit').textContent = estado.conectado ? 'Conectado' : 'Desconectado';
  $('#ble-txt').textContent = estado.conectado ? `Atualizado às ${fmtHoraSeg(leitura.hora)}` : `Última leitura às ${fmtHora(leitura.hora)}`;
  $('#ble-ic').innerHTML = `<svg class="ic"><use href="#${estado.conectado ? 'i-bluetooth' : 'i-bluetooth-off'}"/></svg>`;
  $('#ble-ic').classList.toggle('cinza', !estado.conectado);
  $('#chip-ble').dataset.on = String(estado.conectado);
  $('#chip-ble-txt').textContent = estado.conectado ? 'Conectado' : 'Sem sinal';
}

// a cada 3 s chega uma leitura nova (igual ao loop do firmware)
setInterval(() => {
  if (!estado.conectado) return;
  leitura = { temp: estado.temp, hora: new Date() };
  $('#ble-txt').textContent = `Atualizado às ${fmtHoraSeg(leitura.hora)}`;
}, 3000);

// ------------------------------------------------------------ gráficos
let idGraf = 0;
function grafico(el, pts, { compacto = false, marca = 'h' } = {}) {
  const id = `g${++idGraf}`;
  const W = Math.max(260, Math.round(el.clientWidth || 340));
  const H = compacto ? 132 : 230;
  const pad = { l: 2, r: 34, t: 12, b: 24 };
  const vals = pts.map((p) => p.v);
  const lo = Math.min(16, Math.floor(Math.min(...vals) - 1));
  const hi = Math.max(33, Math.ceil(Math.max(...vals) + 1));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (i / (pts.length - 1)) * iw;
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;

  const passo = Math.max(1, Math.floor(pts.length / (W * 1.2)));
  let d = '';
  for (let i = 0; i < pts.length; i += passo) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)} ${y(pts[i].v).toFixed(1)}`;
  const ult = pts.length - 1;
  d += `L${x(ult).toFixed(1)} ${y(pts[ult].v).toFixed(1)}`;
  const area = `${d}L${x(ult).toFixed(1)} ${pad.t + ih}L${pad.l} ${pad.t + ih}Z`;

  const y28 = y(LIMITES.atencao), y30 = y(LIMITES.alerta), yBase = pad.t + ih;
  // marcas do eixo X
  const marcas = [];
  for (let i = 0; i < pts.length; i++) {
    const dt = new Date(pts[i].t);
    if (dt.getMinutes() !== 0) continue;
    const h = dt.getHours();
    if (marca === 'd' && h === 0) marcas.push({ i, txt: dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') });
    if (marca === 'h' && h % 6 === 0) marcas.push({ i, txt: `${String(h).padStart(2, '0')}h` });
    if (marca === 'h2' && h % 2 === 0) marcas.push({ i, txt: `${String(h).padStart(2, '0')}h` });
  }

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfico de temperatura. Mínima ${fmt(Math.min(...vals))} °C, máxima ${fmt(Math.max(...vals))} °C.">
    <defs>
      <clipPath id="${id}-ok"><rect x="0" y="${y28}" width="${W}" height="${H}"/></clipPath>
      <clipPath id="${id}-at"><rect x="0" y="${y30}" width="${W}" height="${Math.max(0, y28 - y30)}"/></clipPath>
      <clipPath id="${id}-pe"><rect x="0" y="0" width="${W}" height="${y30}"/></clipPath>
      <linearGradient id="${id}-ar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:var(--prim);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--prim);stop-opacity:0"/>
      </linearGradient>
    </defs>
    <rect x="${pad.l}" y="${y28}" width="${iw}" height="${yBase - y28}" style="fill:var(--ok-ponto);opacity:.09"/>
    <rect x="${pad.l}" y="${y30}" width="${iw}" height="${y28 - y30}" style="fill:var(--at-ponto);opacity:.16"/>
    <rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${y30 - pad.t}" style="fill:var(--pe-ponto);opacity:.1"/>
    ${marcas.map((m) => `<line x1="${x(m.i)}" x2="${x(m.i)}" y1="${pad.t}" y2="${yBase}" style="stroke:var(--linha);stroke-width:1"/>
      <text class="eixo" x="${x(m.i)}" y="${H - 6}" text-anchor="middle">${m.txt}</text>`).join('')}
    <line x1="${pad.l}" x2="${pad.l + iw}" y1="${y28}" y2="${y28}" style="stroke:var(--at-ponto);stroke-width:1.5;stroke-dasharray:4 4"/>
    <line x1="${pad.l}" x2="${pad.l + iw}" y1="${y30}" y2="${y30}" style="stroke:var(--pe-ponto);stroke-width:1.5;stroke-dasharray:4 4"/>
    <text class="rot-lim" x="${W - 2}" y="${y28 + 4}" text-anchor="end" style="fill:var(--at)">28°</text>
    <text class="rot-lim" x="${W - 2}" y="${y30 - 2}" text-anchor="end" style="fill:var(--pe)">30°</text>
    <text class="eixo" x="${W - 2}" y="${yBase}" text-anchor="end">${lo}°</text>
    <path d="${area}" style="fill:url(#${id}-ar)"/>
    <path d="${d}" clip-path="url(#${id}-ok)" style="fill:none;stroke:var(--prim);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round"/>
    <path d="${d}" clip-path="url(#${id}-at)" style="fill:none;stroke:var(--at-ponto);stroke-width:2.8;stroke-linejoin:round;stroke-linecap:round"/>
    <path d="${d}" clip-path="url(#${id}-pe)" style="fill:none;stroke:var(--pe-ponto);stroke-width:2.8;stroke-linejoin:round;stroke-linecap:round"/>
    <circle cx="${x(ult)}" cy="${y(pts[ult].v)}" r="9" style="fill:var(--prim);opacity:.18"/>
    <circle cx="${x(ult)}" cy="${y(pts[ult].v)}" r="4.5" style="fill:var(--prim);stroke:var(--sup);stroke-width:2"/>
    <g class="cursor" style="display:none">
      <line y1="${pad.t}" y2="${yBase}" style="stroke:var(--tinta-3);stroke-width:1.2"/>
      <circle r="5" style="fill:var(--sup);stroke:var(--tinta);stroke-width:2.4"/>
    </g>
    <rect class="captura" x="${pad.l}" y="0" width="${iw}" height="${H}" style="fill:transparent"/>
  </svg>`;

  if (compacto) return;
  const svg = el.querySelector('svg');
  const cursor = svg.querySelector('.cursor');
  let dica = el.querySelector('.dica');
  if (!dica) { dica = document.createElement('div'); dica.className = 'dica'; dica.hidden = true; el.append(dica); }
  const mover = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(ult, Math.round(((px - pad.l) / iw) * ult)));
    const p = pts[i];
    cursor.style.display = '';
    cursor.querySelector('line').setAttribute('x1', x(i));
    cursor.querySelector('line').setAttribute('x2', x(i));
    cursor.querySelector('circle').setAttribute('cx', x(i));
    cursor.querySelector('circle').setAttribute('cy', y(p.v));
    const dt = new Date(p.t);
    const quando = marca === 'd' ? `${dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${fmtHora(dt)}` : fmtHora(dt);
    dica.textContent = `${quando} · ${fmt(p.v)} °C`;
    dica.hidden = false;
    const left = (x(i) / W) * r.width;
    dica.style.left = `${Math.max(60, Math.min(r.width - 60, left))}px`;
    dica.style.top = '-34px';
  };
  const sair = () => { cursor.style.display = 'none'; dica.hidden = true; };
  const cap = svg.querySelector('.captura');
  cap.addEventListener('pointermove', mover);
  cap.addEventListener('pointerdown', mover);
  cap.addEventListener('pointerleave', sair);
}

const ultimos = (horas) => pontos.slice(-Math.round((horas * 60) / hist.passoMin));

function desenharMini() {
  const el = $('#g-6h');
  if (!el.clientWidth) return;
  const pts = ultimos(6);
  grafico(el, pts, { compacto: true, marca: 'h2' });
  const st = estatisticas(pts);
  $('#m6-min').textContent = `${fmt(st.min)} °C`;
  $('#m6-max').textContent = `${fmt(st.max)} °C`;
}

// ------------------------------------------------------------ histórico
let periodo = '24h';
let mostrarTodos = false;
$$('[data-periodo]').forEach((b) => b.addEventListener('click', () => {
  periodo = b.dataset.periodo;
  mostrarTodos = false;
  $$('[data-periodo]').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
  desenharHistorico();
}));

function rotuloDia(t) {
  const d = new Date(t); const hoje = new Date();
  const zero = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((zero(hoje) - zero(d)) / DIA);
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function itemEvento(ev, novo = false) {
  return `<li class="item${novo ? ' novo' : ''}" data-tom="${ev.tom}">
    <div class="item-ic"><svg class="ic"><use href="#${ev.icone}"/></svg></div>
    <div class="item-corpo"><b>${ev.titulo}</b><span>${ev.texto}</span></div>
    <span class="item-hora">${fmtHora(new Date(ev.t))}</span>
  </li>`;
}

function desenharHistorico() {
  const el = $('#g-hist');
  if (!el.clientWidth) return;
  const pts = periodo === '24h' ? ultimos(24) : pontos.filter((_, i) => i % 3 === 0 || i === pontos.length - 1);
  grafico(el, pts, { marca: periodo === '24h' ? 'h' : 'd' });
  const st = estatisticas(periodo === '24h' ? pts : pontos);
  $('#h-min').textContent = `${fmt(st.min)}°`;
  $('#h-med').textContent = `${fmt(st.media)}°`;
  $('#h-max').textContent = `${fmt(st.max)}°`;
  $('#h-pct').textContent = `${Math.round(st.pctSeguro)}%`;
  const base = periodo === '24h' ? pts : pontos;
  const n = base.length;
  const c = { seguro: 0, atencao: 0, fora: 0 };
  base.forEach((p) => c[statusDe(p.v)]++);
  $('#h-barra').innerHTML = `<i style="width:${(100 * c.seguro) / n}%;background:var(--ok-ponto)"></i><i style="width:${(100 * c.atencao) / n}%;background:var(--at-ponto)"></i><i style="width:${(100 * c.fora) / n}%;background:var(--pe-ponto)"></i>`;

  // eventos
  const limiteT = Date.now() - (periodo === '24h' ? 1 : 7) * DIA;
  let lista = [...eventosVivos, ...eventosDe(pontos)].filter((e) => e.t >= limiteT);
  if (periodo === '7d') lista = lista.filter((e) => e.tipo !== 'tomada');
  const total = lista.length;
  if (!mostrarTodos) lista = lista.slice(0, 10);
  let html = ''; let diaAtual = '';
  for (const ev of lista) {
    const dia = rotuloDia(ev.t);
    if (dia !== diaAtual) { if (html) html += '</ul>'; html += `<p class="dia">${dia}</p><ul class="lista">`; diaAtual = dia; }
    html += itemEvento(ev, ev.vivo && Date.now() - ev.t < 4000);
  }
  if (html) html += '</ul>';
  if (total > lista.length) html += `<button type="button" class="btn btn-sec btn-largo" id="mais-ev" style="margin-top:12px">Mostrar mais ${total - lista.length} eventos</button>`;
  if (!total) html = '<p class="nota">Nenhum evento no período.</p>';
  $('#eventos').innerHTML = html;
  $('#mais-ev')?.addEventListener('click', () => { mostrarTodos = true; desenharHistorico(); });
}

// ------------------------------------------------------------ alertas
function quando(t) {
  const d = new Date(t);
  const dia = rotuloDia(t);
  return `${dia}, ${fmtHora(d)}`;
}
function desenharAlertas() {
  const base = alertasDe(pontos).map((a) => ({ ...a }));
  const todos = [...alertasVivos, ...base];
  $('#lista-alertas').innerHTML = todos.map((a) => {
    const ic = a.nivel === 'fora' ? 'i-octogono' : a.nivel === 'atencao' ? 'i-alerta' : 'i-bluetooth-off';
    const etiqueta = a.resolvido
      ? '<span class="etiqueta"><svg class="ic" style="width:14px;height:14px"><use href="#i-check"/></svg>Resolvido</span>'
      : '<span class="etiqueta ativo"><svg class="ic" style="width:14px;height:14px"><use href="#i-alerta"/></svg>Ativo agora</span>';
    return `<li class="item${a.novo ? ' novo' : ''}" data-nivel="${a.nivel}">
      <div class="item-ic"><svg class="ic"><use href="#${ic}"/></svg></div>
      <div class="item-corpo"><b>${a.titulo}</b><span>${a.texto}</span><span style="font-size:14px;color:var(--tinta-3);margin-top:2px">${quando(a.t)}</span>${etiqueta}</div>
    </li>`;
  }).join('');
  alertasVivos.forEach((a) => (a.novo = false));
}
$('#marcar-lidos').addEventListener('click', () => { naoLidos = 0; atualizarBadge(); });
function atualizarBadge() {
  const b = $('#badge');
  b.hidden = naoLidos === 0;
  b.textContent = naoLidos;
  b.closest('button').setAttribute('aria-label', naoLidos ? `Alertas, ${naoLidos} novo${naoLidos > 1 ? 's' : ''}` : 'Alertas');
}

let tempoPush = 0;
function mostrarPush(titulo, texto) {
  $('#push-titulo').textContent = titulo;
  $('#push-texto').textContent = texto;
  $('#push').classList.add('visivel');
  clearTimeout(tempoPush);
  tempoPush = setTimeout(() => $('#push').classList.remove('visivel'), 7000);
}
$('#push-fechar').addEventListener('click', () => $('#push').classList.remove('visivel'));
$('#push-ver').addEventListener('click', () => { $('#push').classList.remove('visivel'); mostrarTela('alertas'); });

function novoAlerta({ titulo, texto }) {
  alertasVivos.unshift({ t: Date.now(), nivel: 'fora', resolvido: false, titulo, texto, novo: true, vivo: true });
  if (telaAtual !== 'alertas') naoLidos++;
  atualizarBadge();
  if (telaAtual === 'alertas') desenharAlertas();
}
function resolverAlertas() {
  let mudou = false;
  alertasVivos.forEach((a) => { if (!a.resolvido) { a.resolvido = true; mudou = true; } });
  if (mudou && telaAtual === 'alertas') desenharAlertas();
}

// ------------------------------------------------------------ minha caneta
function desenharCaneta() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [a, m, d] = caneta.abertura.split('-').map(Number);
  const ab = new Date(a, m - 1, d);
  const dias = Math.max(1, Math.round((hoje - ab) / DIA) + 1);
  const resta = caneta.prazo - dias;
  $('#dias-num').textContent = `${dias}º`;
  $('#dias-aberta').textContent = `Aberta em ${ab.toLocaleDateString('pt-BR')}`;
  const prog = $('#dias-prog');
  prog.querySelector('i').style.width = `${Math.min(100, (100 * dias) / caneta.prazo)}%`;
  prog.setAttribute('aria-valuemax', caneta.prazo);
  prog.setAttribute('aria-valuenow', Math.min(dias, caneta.prazo));
  prog.dataset.fim = String(resta <= 2);
  $('#dias-resta').textContent = resta > 1 ? `Faltam ${resta} dias para o prazo que você definiu`
    : resta === 1 ? 'Falta 1 dia para o prazo que você definiu'
      : resta === 0 ? 'Hoje é o último dia do prazo que você definiu'
        : `Passou ${-resta} dia${resta < -1 ? 's' : ''} do prazo que você definiu`;
  $('#prazo').textContent = `${caneta.prazo} dias`;
  const inp = $('#data-abertura');
  inp.value = caneta.abertura;
  inp.max = isoDia(new Date());
  $$('#tipos .opcao').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.tipo === caneta.tipo)));
  $('#caneta-faixa').style.fill = caneta.tipo === 'KwikPen' ? '#8a5cc7' : caneta.tipo === 'Outra' ? '#3c8f6e' : 'url(#ga)';
}
$$('#tipos .opcao').forEach((o) => o.addEventListener('click', () => { caneta.tipo = o.dataset.tipo; gravar('inovabio-caneta', caneta); desenharCaneta(); }));
$('#tipos').addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const ops = $$('#tipos .opcao');
  const i = ops.findIndex((o) => o.dataset.tipo === caneta.tipo);
  const j = (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + ops.length) % ops.length;
  ops[j].click(); ops[j].focus(); e.preventDefault();
});
$('#data-abertura').addEventListener('change', (e) => { if (e.target.value) { caneta.abertura = e.target.value; gravar('inovabio-caneta', caneta); desenharCaneta(); } });
$('#prazo-menos').addEventListener('click', () => { caneta.prazo = Math.max(1, caneta.prazo - 1); gravar('inovabio-caneta', caneta); desenharCaneta(); });
$('#prazo-mais').addEventListener('click', () => { caneta.prazo = Math.min(90, caneta.prazo + 1); gravar('inovabio-caneta', caneta); desenharCaneta(); });
$('#nova-caneta').addEventListener('click', () => { caneta.abertura = isoDia(new Date()); gravar('inovabio-caneta', caneta); desenharCaneta(); });

// ------------------------------------------------------------ ajustes
function desenharAjustes() {
  $('#limite').textContent = `${fmt(ajustes.limite)} °C`;
  $('#lim-mais').disabled = ajustes.limite >= 30;
  $('#lim-menos').disabled = ajustes.limite <= 25;
  $$('[data-pref]').forEach((s) => s.setAttribute('aria-checked', String(!!ajustes[s.dataset.pref])));
  $$('#seg-tema [data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === estado.tema)));
  $('#d-nome').textContent = DISPOSITIVO.nome;
  $('#d-fw').textContent = DISPOSITIVO.firmware;
  $('#d-sinal').innerHTML = estado.conectado
    ? '<span class="sinal" aria-hidden="true"><i style="height:6px"></i><i style="height:10px"></i><i style="height:14px"></i><i style="height:18px" class="off"></i></span>−58 dBm · bom'
    : 'Sem sinal';
}
$('#lim-menos').addEventListener('click', () => { ajustes.limite = Math.max(25, ajustes.limite - 0.5); gravar('inovabio-ajustes', ajustes); desenharAjustes(); });
$('#lim-mais').addEventListener('click', () => { ajustes.limite = Math.min(30, ajustes.limite + 0.5); gravar('inovabio-ajustes', ajustes); desenharAjustes(); });
$$('[data-pref]').forEach((s) => s.addEventListener('click', () => {
  ajustes[s.dataset.pref] = !ajustes[s.dataset.pref];
  gravar('inovabio-ajustes', ajustes);
  desenharAjustes();
}));
$$('#seg-tema [data-tema]').forEach((b) => b.addEventListener('click', () => pedir({ tema: b.dataset.tema })));
$('#esquecer').addEventListener('click', () => { definirPasso('inicio'); mostrarTela('pareamento'); });

// ------------------------------------------------------------ pareamento
let timerPar = 0;
function definirPasso(passo) {
  clearTimeout(timerPar);
  $('#par').dataset.passo = passo;
  $$('#par [data-mostrar]').forEach((el) => { el.hidden = el.dataset.mostrar !== passo; });
  const ilustra = $('.par-ilustra');
  ilustra.querySelector('.feito')?.remove();
  if (passo === 'pronto') {
    const f = document.createElement('div');
    f.className = 'feito';
    f.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
    ilustra.append(f);
  }
  if (passo === 'buscando') timerPar = setTimeout(() => definirPasso('encontrado'), 2600);
  if (passo === 'conectando') timerPar = setTimeout(() => definirPasso('pronto'), 1800);
}
$('#par-buscar').addEventListener('click', () => definirPasso('buscando'));
$('#par-conectar').addEventListener('click', () => definirPasso('conectando'));
$('#par-ir').addEventListener('click', () => mostrarTela('inicio'));

// ------------------------------------------------------------ estado ao vivo
let timerStatus = 0;
let statusConfirmado = statusDe(estado.temp);
let acimaLimite = estado.temp >= ajustes.limite;

function registrarEvento(ev) {
  eventosVivos.unshift({ ...ev, t: Date.now(), vivo: true });
  if (telaAtual === 'historico') desenharHistorico();
}

function confirmarMudanca({ manual = false } = {}) {
  clearTimeout(timerStatus);
  const t = estado.temp;
  const s = statusDe(t);
  if (s !== statusConfirmado) {
    if (s === 'fora') registrarEvento({ tipo: 'limite', titulo: t <= LIMITES.frio ? 'Ficou muito frio' : 'Passou de 30 °C', texto: `Chegou a ${fmt(t)} °C.`, icone: 'i-octogono', tom: 'perigo' });
    else if (s === 'atencao') registrarEvento({ tipo: 'limite', titulo: statusConfirmado === 'fora' ? 'Baixou para atenção' : 'Passou de 28 °C', texto: `${fmt(t)} °C · faixa de atenção.`, icone: 'i-alerta', tom: 'atencao' });
    else registrarEvento({ tipo: 'normal', titulo: 'Voltou ao normal', texto: `Abaixo de 28 °C (${fmt(t)} °C).`, icone: 'i-check', tom: 'ok' });
    statusConfirmado = s;
  }
  const acima = t >= ajustes.limite;
  if (acima && !acimaLimite && !manual) {
    novoAlerta({ titulo: `Insulina passou de ${fmt(ajustes.limite)} °C`, texto: `Agora: ${fmt(t)} °C. Ligue o estojo na tomada e leve-o para a sombra.` });
    if (ajustes['n-temp']) mostrarPush('Atenção à temperatura', `Sua insulina passou de ${fmt(ajustes.limite)} °C. Agora está em ${fmt(t)} °C.`);
  }
  if (!acima && acimaLimite) resolverAlertas();
  acimaLimite = acima;
}

let quadroPend = 0;
function redesenharGraficos() {
  cancelAnimationFrame(quadroPend);
  quadroPend = requestAnimationFrame(() => {
    if (telaAtual === 'inicio') desenharMini();
    if (telaAtual === 'historico') desenharHistorico();
  });
}

function aplicarEstado(novo) {
  const ant = estado;
  estado = { ...estado, ...novo };
  document.documentElement.dataset.tema = estado.tema;

  if (estado.conectado) leitura = { temp: estado.temp, hora: ant.conectado ? new Date() : new Date() };
  if (estado.temp !== ant.temp && estado.conectado) {
    ajustarFinal(pontos, estado.temp);
    redesenharGraficos();
    clearTimeout(timerStatus);
    timerStatus = setTimeout(() => confirmarMudanca(), 700);
  }
  if (estado.tomada !== ant.tomada) {
    registrarEvento(estado.tomada
      ? { tipo: 'tomada', titulo: 'Ligado na tomada', texto: 'Resfriamento ativo.', icone: 'i-plug', tom: 'neutro' }
      : { tipo: 'tomada', titulo: 'Tirado da tomada', texto: 'O isolamento segura a temperatura.', icone: 'i-plug-off', tom: 'neutro' });
    if (!estado.tomada && ajustes['n-tomada']) mostrarPush('Estojo fora da tomada', 'O isolamento segura a temperatura por algumas horas.');
  }
  if (estado.conectado !== ant.conectado) {
    registrarEvento(estado.conectado
      ? { tipo: 'ble', titulo: 'Bluetooth conectou', texto: 'O celular voltou a receber os dados.', icone: 'i-bluetooth', tom: 'neutro' }
      : { tipo: 'ble', titulo: 'Bluetooth desconectou', texto: 'O celular ficou longe do estojo.', icone: 'i-bluetooth-off', tom: 'neutro' });
    if (!estado.conectado && ajustes['n-ble']) mostrarPush('Estojo longe do celular', 'Aproxime o celular do estojo para voltar a ver a temperatura.');
    if (estado.conectado) { ajustarFinal(pontos, estado.temp); redesenharGraficos(); timerStatus = setTimeout(() => confirmarMudanca(), 300); }
  }
  // o estojo (LEDs) reage sempre; o app só quando há conexão
  estojo?.definirStatus(statusDe(estado.temp));
  estojo?.definirTomada(estado.tomada);
  desenharInicio();
  if (telaAtual === 'ajustes') desenharAjustes();
}

function receberAlerta(m) {
  confirmarMudanca({ manual: true });
  novoAlerta({ titulo: 'Insulina passou de 30 °C', texto: `Há ${m.minutos} min. Agora: ${fmt(m.temp)} °C. Ligue o estojo na tomada e leve-o para a sombra.` });
  mostrarPush('Atenção à temperatura', `Sua insulina passou de 30 °C há ${m.minutos} min.`);
}

// dono do estado: a página de apresentação (iframe) ou o próprio app (sozinho)
let pedir;
if (emFrame) {
  // a primeira sincronização só copia o estado, sem gerar eventos nem avisos
  let sincronizado = false;
  const sincronizar = (e) => {
    if (sincronizado) return aplicarEstado(e);
    sincronizado = true;
    estado = { ...estado, ...e };
    leitura = { temp: estado.temp, hora: new Date() };
    statusConfirmado = statusDe(estado.temp);
    acimaLimite = estado.temp >= ajustes.limite;
    ajustarFinal(pontos, estado.temp);
    aplicarEstado({});
    redesenharGraficos();
  };
  const cli = conectarCliente({ aoEstado: sincronizar, aoAlerta: receberAlerta });
  pedir = (patch) => { aplicarEstado(patch); cli.pedir(patch); };
} else {
  const sim = criarSimulador(inicial);
  sim.ouvir((e, alerta) => { if (alerta) receberAlerta(alerta); else aplicarEstado(e); });
  pedir = (patch) => sim.definir(patch);
  if (!limpo) montarBotaoSimulacao(sim);
}

function montarBotaoSimulacao(sim) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'sim-botao';
  botao.innerHTML = '<svg class="ic"><use href="#i-ajustes"/></svg>Simular';
  botao.setAttribute('aria-expanded', 'false');
  const folha = document.createElement('div');
  folha.className = 'sim-folha';
  folha.setAttribute('role', 'dialog');
  folha.setAttribute('aria-label', 'Simulação para apresentação');
  folha.innerHTML = '<div class="sim-folha-topo"><h2>Simulação</h2><button type="button" class="btn-voltar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div><div class="painel"></div>';
  montarPainel(folha.querySelector('.painel'), sim);
  const alternar = (abrir) => {
    folha.classList.toggle('aberta', abrir);
    botao.setAttribute('aria-expanded', String(abrir));
    botao.hidden = abrir;
  };
  botao.addEventListener('click', () => alternar(true));
  folha.querySelector('.btn-voltar').addEventListener('click', () => alternar(false));
  app.append(botao, folha);
}

// ------------------------------------------------------------ partida
aplicarEstado({});
definirPasso(P.get('passo') || 'inicio');
mostrarTela(P.get('tela') || location.hash.slice(1) || 'inicio');
window.addEventListener('resize', redesenharGraficos);
document.fonts?.ready.then(redesenharGraficos);
