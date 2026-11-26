// =====================================================================
//  InovaBio · simulação do estojo (dados fictícios, sem Bluetooth real)
//
//  Limites copiados do firmware prototipo/firmware/estojo_v1/estojo_v1.ino:
//    LIMITE_ATENCAO = 28.0  -> amarelo
//    LIMITE_ALERTA  = 30.0  -> vermelho
//    LIMITE_FRIO    = 2.0   -> vermelho também
// =====================================================================

export const LIMITES = { atencao: 28, alerta: 30, frio: 2 };

export const DISPOSITIVO = {
  nome: 'InovaBio-Estojo',
  firmware: 'v1 · rev D (23/11/2026)',
  sensor: 'DS18B20 · leitura a cada 3 s',
  endereco: '3C:71:BF:4A:9E:12',
  alimentacao: 'USB-C 5 V',
};

/** 'seguro' | 'atencao' | 'fora' — mesma regra do firmware (loop()). */
export function statusDe(t) {
  if (t >= LIMITES.alerta || t <= LIMITES.frio) return 'fora';
  if (t >= LIMITES.atencao) return 'atencao';
  return 'seguro';
}

export const STATUS = {
  seguro:  { rotulo: 'Seguro',        icone: 'i-check',  led: 'verde' },
  atencao: { rotulo: 'Atenção',       icone: 'i-alerta', led: 'amarelo' },
  fora:    { rotulo: 'Fora da faixa', icone: 'i-octogono', led: 'vermelho' },
};

export function descricaoStatus(t) {
  const s = statusDe(t);
  if (s === 'seguro') return 'Abaixo de 28 °C. Sua insulina está protegida.';
  if (s === 'atencao') return 'Entre 28 e 30 °C. Leve o estojo para um lugar fresco ou ligue na tomada.';
  if (t <= LIMITES.frio) return 'Muito frio (2 °C ou menos). Tire o estojo de perto do gelo.';
  return '30 °C ou mais. Ligue o estojo na tomada e leve-o para a sombra.';
}

export const fmt = (t, casas = 1) => Number(t).toFixed(casas).replace('.', ',');
export const fmtHora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtHoraSeg = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ---------------------------------------------------------------------
//  Histórico: 7 dias com passo de 5 min, gerado por um modelo térmico
//  simples (1ª ordem) com ambiente diário, períodos na tomada e um
//  episódio fora da faixa (estojo esquecido no carro).
// ---------------------------------------------------------------------
function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PASSO_MIN = 5;
const MIN = 60 * 1000;

export function gerarHistorico(agora = new Date(), tempAtual = 24.6) {
  const rnd = aleatorio(20261125);
  const n = (7 * 24 * 60) / PASSO_MIN;              // 2016 pontos
  const fim = Math.floor(agora.getTime() / (PASSO_MIN * MIN)) * PASSO_MIN * MIN;
  const inicio = fim - (n - 1) * PASSO_MIN * MIN;

  // episódio principal: começa ~9h40 antes de agora e dura 45 min
  const epIni = fim - (9 * 60 + 40) * MIN;
  const epFim = epIni + 45 * MIN;
  // Bluetooth caiu por 12 min ~15 h atrás
  const bleIni = fim - (15 * 60 + 10) * MIN;
  const bleFim = bleIni + 12 * MIN;

  const desvioDia = Array.from({ length: 9 }, () => (rnd() - 0.45) * 2.2);
  const pontos = [];
  let T = 21.5;

  for (let i = 0; i < n; i++) {
    const ts = inicio + i * PASSO_MIN * MIN;
    const d = new Date(ts);
    const h = d.getHours() + d.getMinutes() / 60;
    const dia = Math.floor((ts - inicio) / (24 * 60 * MIN));
    const ambiente = 24.6 + desvioDia[dia] + 3.1 * Math.sin(((h - 9) / 24) * 2 * Math.PI);

    let tomada = !((h >= 7.5 && h < 12) || (h >= 13 && h < 18.5));
    let alvo;
    let tau;
    if (ts >= epIni && ts < epFim) {
      tomada = false; alvo = 32.6; tau = 26;            // dentro do carro
    } else if (ts >= epFim && ts < epFim + 150 * MIN) {
      tomada = true; alvo = ambiente - 5; tau = 30;      // chegou em casa e ligou
    } else if (tomada) {
      alvo = ambiente - 5; tau = 35;                     // Peltier: 4,5–5,5 °C abaixo
    } else {
      alvo = ambiente + 0.6; tau = 50;                   // na bolsa, só isolamento
    }
    T += (alvo - T) * (1 - Math.exp(-PASSO_MIN / tau));
    const ruido = (rnd() - 0.5) * 0.14;
    const conectado = !(ts >= bleIni && ts < bleFim);
    pontos.push({ t: ts, v: T + ruido, tomada, conectado });
  }

  // últimos 40 min convergem suavemente para a temperatura atual
  ajustarFinal(pontos, tempAtual);
  return { pontos, passoMin: PASSO_MIN };
}

export function ajustarFinal(pontos, tempAtual, minutos = 40) {
  const k = Math.round(minutos / PASSO_MIN);
  for (let j = 0; j <= k; j++) {
    const p = pontos[pontos.length - 1 - k + j];
    if (p.v_orig === undefined) p.v_orig = p.v;
    const f = j / k;
    const e = f * f * (3 - 2 * f);
    p.v = p.v_orig * (1 - e) + tempAtual * e;
  }
}

export function estatisticas(pontos) {
  let min = Infinity, max = -Infinity, soma = 0, ok = 0;
  for (const p of pontos) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
    soma += p.v;
    if (statusDe(p.v) === 'seguro') ok++;
  }
  return { min, max, media: soma / pontos.length, pctSeguro: (100 * ok) / pontos.length };
}

/** Eventos: tomada, Bluetooth e cruzamentos de limite. */
export function eventosDe(pontos) {
  const ev = [];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1], b = pontos[i];
    if (a.tomada !== b.tomada) {
      ev.push(b.tomada
        ? { t: b.t, tipo: 'tomada', titulo: 'Ligado na tomada', texto: 'Resfriamento ativo.', icone: 'i-plug', tom: 'neutro' }
        : { t: b.t, tipo: 'tomada', titulo: 'Tirado da tomada', texto: 'O isolamento segura a temperatura.', icone: 'i-plug-off', tom: 'neutro' });
    }
    if (a.conectado !== b.conectado) {
      ev.push(b.conectado
        ? { t: b.t, tipo: 'ble', titulo: 'Bluetooth conectou', texto: 'O celular voltou a receber os dados.', icone: 'i-bluetooth', tom: 'neutro' }
        : { t: b.t, tipo: 'ble', titulo: 'Bluetooth desconectou', texto: 'O celular ficou longe do estojo.', icone: 'i-bluetooth-off', tom: 'neutro' });
    }
    const sa = statusDe(a.v), sb = statusDe(b.v);
    if (sa !== 'fora' && sb === 'fora') {
      ev.push({ t: b.t, tipo: 'limite', titulo: 'Passou de 30 °C', texto: `Chegou a ${fmt(b.v)} °C.`, icone: 'i-octogono', tom: 'perigo' });
    } else if (sa === 'seguro' && sb === 'atencao') {
      ev.push({ t: b.t, tipo: 'limite', titulo: 'Passou de 28 °C', texto: 'Faixa de atenção.', icone: 'i-alerta', tom: 'atencao' });
    } else if (sa !== 'seguro' && sb === 'seguro') {
      ev.push({ t: b.t, tipo: 'normal', titulo: 'Voltou ao normal', texto: `Abaixo de 28 °C (${fmt(b.v)} °C).`, icone: 'i-check', tom: 'ok' });
    }
  }
  return ev.reverse();
}

/** Alertas a partir dos episódios fora da faixa / atenção. */
export function alertasDe(pontos) {
  const lista = [];
  let ini = null, pico = -Infinity, nivel = null;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    const s = statusDe(p.v);
    if (s !== 'seguro') {
      if (ini === null) { ini = p; pico = p.v; nivel = s; }
      if (p.v > pico) pico = p.v;
      if (s === 'fora') nivel = 'fora';
    } else if (ini !== null) {
      const dur = Math.round((p.t - ini.t) / MIN);
      lista.push({
        t: ini.t, fim: p.t, nivel, resolvido: true,
        titulo: nivel === 'fora' ? 'Insulina passou de 30 °C' : 'Temperatura em atenção',
        texto: `Máxima de ${fmt(pico)} °C · durou ${dur} min`,
      });
      ini = null; pico = -Infinity;
    }
  }
  const bleOff = pontos.find((p, i) => i > 0 && pontos[i - 1].conectado && !p.conectado);
  if (bleOff) lista.push({ t: bleOff.t, nivel: 'info', resolvido: true, titulo: 'Estojo longe do celular', texto: 'Ficou 12 min sem Bluetooth' });
  return lista.sort((a, b) => b.t - a.t);
}

// ---------------------------------------------------------------------
//  Estado compartilhado: o "dono" (página de apresentação, ou o próprio
//  app quando aberto sozinho) guarda o estado e avisa todas as telas
//  por BroadcastChannel.
// ---------------------------------------------------------------------
export const CANAL = 'inovabio-sim-v1';

export const ESTADO_INICIAL = {
  temp: 24.6,
  tomada: true,
  conectado: true,
  tema: 'claro',      // 'claro' | 'escuro' | 'auto'
};

export function criarSimulador(inicial = {}) {
  const canal = 'BroadcastChannel' in self ? new BroadcastChannel(CANAL) : null;
  const ouvintes = new Set();
  let estado = { ...ESTADO_INICIAL, ...inicial };

  const emitir = () => {
    canal?.postMessage({ tipo: 'estado', estado });
    ouvintes.forEach((f) => f(estado));
  };

  canal?.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.tipo === 'ola') canal.postMessage({ tipo: 'estado', estado });
    if (m.tipo === 'definir') sim.definir(m.patch, true);
  });

  const sim = {
    get estado() { return estado; },
    definir(patch, eco = true) {
      estado = { ...estado, ...patch };
      if (eco) emitir();
    },
    gerarAlerta() {
      if (estado.temp < LIMITES.alerta) sim.definir({ temp: 31.4, tomada: false });
      const alerta = { tipo: 'alerta', id: Date.now(), temp: estado.temp, minutos: 10 };
      canal?.postMessage(alerta);
      ouvintes.forEach((f) => f(estado, alerta));
    },
    ouvir(f) { ouvintes.add(f); f(estado); return () => ouvintes.delete(f); },
  };
  return sim;
}

/** Cliente: usado por cada tela/iframe para receber o estado. */
export function conectarCliente({ aoEstado, aoAlerta }) {
  const canal = 'BroadcastChannel' in self ? new BroadcastChannel(CANAL) : null;
  canal?.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.tipo === 'estado') aoEstado?.(m.estado);
    if (m.tipo === 'alerta') aoAlerta?.(m);
  });
  canal?.postMessage({ tipo: 'ola' });
  return {
    pedir: (patch) => canal?.postMessage({ tipo: 'definir', patch }),
  };
}

// ---------------------------------------------------------------------
//  Painel de controle de quem apresenta (fora das molduras).
// ---------------------------------------------------------------------
export function montarPainel(raiz, sim) {
  raiz.innerHTML = `
    <div class="painel-bloco">
      <div class="painel-linha">
        <label for="pn-temp">Temperatura da cavidade</label>
        <output id="pn-temp-saida" class="painel-valor">24,6 °C</output>
      </div>
      <input id="pn-temp" type="range" min="15" max="40" step="0.1" value="24.6" aria-describedby="pn-temp-dica">
      <div class="painel-escala" id="pn-temp-dica" aria-hidden="true"><span>15</span><span class="ok">28</span><span class="at">30</span><span>40 °C</span></div>
      <div class="painel-atalhos" role="group" aria-label="Estados prontos">
        <button type="button" data-t="24.6" class="atalho ok">Seguro · 24,6</button>
        <button type="button" data-t="29.1" class="atalho at">Atenção · 29,1</button>
        <button type="button" data-t="31.8" class="atalho pe">Fora · 31,8</button>
      </div>
    </div>
    <div class="painel-bloco painel-chaves">
      <button type="button" class="chave" id="pn-tomada" aria-pressed="true"><span class="chave-trilho"><span></span></span><span class="chave-texto"></span></button>
      <button type="button" class="chave" id="pn-ble" aria-pressed="true"><span class="chave-trilho"><span></span></span><span class="chave-texto"></span></button>
    </div>
    <div class="painel-bloco">
      <span class="painel-rotulo" id="pn-tema-rot">Tema</span>
      <div class="painel-seg" role="group" aria-labelledby="pn-tema-rot">
        <button type="button" data-tema="claro">Claro</button>
        <button type="button" data-tema="escuro">Escuro</button>
        <button type="button" data-tema="auto">Sistema</button>
      </div>
    </div>
    <button type="button" class="painel-alerta" id="pn-alerta">Gerar alerta</button>
    <p class="painel-nota">Os limites seguem o firmware do estojo: verde abaixo de 28 °C, amarelo de 28 a 30 °C, vermelho a partir de 30 °C.</p>`;

  const $ = (s) => raiz.querySelector(s);
  const faixa = $('#pn-temp');
  const saida = $('#pn-temp-saida');
  const tomada = $('#pn-tomada');
  const ble = $('#pn-ble');

  faixa.addEventListener('input', () => sim.definir({ temp: parseFloat(faixa.value) }));
  raiz.querySelectorAll('.atalho').forEach((b) => b.addEventListener('click', () => sim.definir({ temp: parseFloat(b.dataset.t) })));
  tomada.addEventListener('click', () => sim.definir({ tomada: !sim.estado.tomada }));
  ble.addEventListener('click', () => sim.definir({ conectado: !sim.estado.conectado }));
  raiz.querySelectorAll('[data-tema]').forEach((b) => b.addEventListener('click', () => sim.definir({ tema: b.dataset.tema })));
  $('#pn-alerta').addEventListener('click', () => sim.gerarAlerta());

  sim.ouvir((e) => {
    if (document.activeElement !== faixa) faixa.value = e.temp;
    saida.textContent = `${fmt(e.temp)} °C`;
    saida.dataset.status = statusDe(e.temp);
    tomada.setAttribute('aria-pressed', String(e.tomada));
    tomada.querySelector('.chave-texto').textContent = e.tomada ? 'Na tomada' : 'Fora da tomada';
    ble.setAttribute('aria-pressed', String(e.conectado));
    ble.querySelector('.chave-texto').textContent = e.conectado ? 'Bluetooth conectado' : 'Bluetooth desconectado';
    raiz.querySelectorAll('[data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === e.tema)));
  });
}
