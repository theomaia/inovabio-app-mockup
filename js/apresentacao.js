// Página de apresentação: monta as molduras, o painel e o modal em tamanho real.
import { criarSimulador, montarPainel } from './sim.js';
import { SIMBOLO, PALAVRA, LOGO } from './marca.js';

document.querySelectorAll('[data-logo]').forEach((el) => {
  el.innerHTML = `<svg class="logo" viewBox="0 0 ${LOGO.w} ${LOGO.h}" role="img" aria-label="Nimblit">
    <path style="fill:var(--logo-simbolo)" d="${SIMBOLO.d}"/>
    <path style="fill:var(--logo-palavra)" fill-rule="evenodd" transform="translate(${SIMBOLO.w + LOGO.gap} ${LOGO.dy})" d="${PALAVRA.d}"/></svg>`;
});

const TELAS = [
  { id: 'inicio', nome: 'Início', desc: 'Estojo em 3D, temperatura, status e últimas 6 horas' },
  { id: 'historico', nome: 'Histórico', desc: 'Gráfico de 24 h ou 7 dias, faixas e eventos' },
  { id: 'alertas', nome: 'Alertas', desc: 'Aviso na tela de bloqueio e lista de alertas' },
  { id: 'caneta', nome: 'Minha caneta', desc: 'Tipo, data de abertura e dias de uso' },
  { id: 'ajustes', nome: 'Ajustes', desc: 'Limite, notificações, cuidador e dispositivo' },
  { id: 'pareamento', nome: 'Pareamento', desc: 'Primeira abertura: busca e conexão', extra: '&passo=encontrado' },
];

const $ = (s) => document.querySelector(s);
const grade = $('#grade');
const raiz = document.documentElement;

// estado compartilhado com todas as telas (BroadcastChannel)
const sim = criarSimulador();
montarPainel($('#painel'), sim);
sim.ouvir((e) => { raiz.dataset.tema = e.tema; });

function telefone(src, titulo) {
  const t = document.createElement('div');
  t.className = 'ap-telefone';
  t.innerHTML = `<div class="vidro"><iframe src="${src}" title="${titulo}" loading="lazy"></iframe></div><span class="ilha" aria-hidden="true"></span>`;
  return t;
}

TELAS.forEach((tela, i) => {
  const fig = document.createElement('figure');
  fig.className = 'ap-tela';
  fig.style.margin = '0';
  const captura = new URLSearchParams(location.search).has('captura') ? '&captura=1' : '';
  const tel = telefone(`app.html?tela=${tela.id}${tela.extra || ''}${captura}`, `Tela ${tela.nome}`);
  tel.querySelector('iframe').tabIndex = -1;
  tel.querySelector('iframe').style.pointerEvents = 'none';
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'ap-abrir';
  abrir.setAttribute('aria-label', `Abrir ${tela.nome} em tamanho real`);
  abrir.innerHTML = '<span>Abrir protótipo</span>';
  abrir.addEventListener('click', () => abrirModal(tela, abrir));
  tel.append(abrir);
  const leg = document.createElement('figcaption');
  leg.innerHTML = `<b>${i + 1} · ${tela.nome}</b><span>${tela.desc}</span>`;
  fig.append(tel, leg);
  grade.append(fig);
});

function ajustarEscala() {
  const W = grade.clientWidth;
  let cols = 3, s = 0.6;
  for (cols = 3; cols >= 1; cols--) {
    s = ((W - (cols - 1) * 26) / cols - 22) / 390;
    if (s >= 0.56 || cols === 1) break;
  }
  s = Math.max(0.4, Math.min(s, 0.8));
  grade.style.setProperty('--colunas', cols);
  grade.style.setProperty('--s', s.toFixed(3));
}
ajustarEscala();
new ResizeObserver(ajustarEscala).observe(grade);

// ------------------------------------------------------------ modal
const modal = $('#modal');
let origem = null;

function abrirModal(tela, botao) {
  if (window.innerWidth < 600) { location.href = `app.html#${tela.id}`; return; }
  origem = botao;
  $('#modal-tit').textContent = tela.nome;
  $('#modal-aba').href = `app.html#${tela.id}`;
  const lugar = $('#modal-telefone');
  lugar.innerHTML = '';
  const t = telefone(`app.html?tela=${tela.id}`, `Protótipo: ${tela.nome}`);
  t.querySelector('iframe').removeAttribute('loading');
  lugar.replaceWith(t);
  t.id = 'modal-telefone';
  t.classList.add('ap-telefone-grande');
  const s = Math.min(1, (window.innerHeight - 110) / (844 + 22));
  t.style.setProperty('--s', s.toFixed(3));
  $('#modal-lado').append($('#painel-caixa'));
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.ap-fechar').focus();
}

function fecharModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  $('#lado').append($('#painel-caixa'));
  $('#modal-telefone').innerHTML = '';
  origem?.focus();
}

modal.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fecharModal(); });
document.addEventListener('keydown', (e) => {
  if (modal.hidden) return;
  if (e.key === 'Escape') fecharModal();
  if (e.key === 'Tab') {
    // mantém o foco dentro do modal (o iframe e o painel incluídos)
    const focaveis = [...modal.querySelectorAll('a[href], button:not([disabled]), input, iframe')];
    const pri = focaveis[0], ult = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  }
});
