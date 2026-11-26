// =====================================================================
//  Estojo InovaBio em 3D (three.js)
//
//  Se existir assets/estojo.glb, .gltf ou .stl, esse arquivo é usado.
//  Senão, o estojo é modelado aqui com as medidas reais (mm):
//    caixa 186 × 80 × 40 (corpo 38 + tampa 2), cantos arredondados
//    3 LEDs Ø5,4 na face longa da frente: verde, amarelo, vermelho
//    fendas na tampa e na face dos LEDs, entrada USB-C na ponta
//    cavidade 172 × 24 × 24 com uma caneta de insulina dentro
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SIMBOLO, PALAVRA, LOGO, CORES } from './marca.js';

const MM = 0.01;                 // 1 unidade da cena = 100 mm
const CAIXA = { c: 186, l: 80, corpo: 38, tampa: 2, r: 11 };
const CAV = { c: 172, l: 24, a: 24, z: 13 };   // z = centro da cavidade (frente = +40)
const LED_Y = 21;
const LEDS = [
  { nome: 'verde',    x: 54, cor: 0x22c55e, apagado: 0x1d3b28 },
  { nome: 'amarelo',  x: 65, cor: 0xffb020, apagado: 0x4a3a12 },
  { nome: 'vermelho', x: 76, cor: 0xff3b30, apagado: 0x4a1714 },
];
const LED_DO_STATUS = { seguro: 'verde', atencao: 'amarelo', fora: 'vermelho' };

// ------------------------------------------------------------------ util
function contornoArredondado(caminho, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  caminho.moveTo(x + r, y);
  caminho.lineTo(x + w - r, y);
  caminho.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  caminho.lineTo(x + w, y + h - r);
  caminho.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  caminho.lineTo(x + r, y + h);
  caminho.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  caminho.lineTo(x, y + r);
  caminho.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return caminho;
}

/** Extrusão "deitada": forma no plano XZ (y da forma = -z do mundo), altura em +Y. */
function extrusaoPlana(forma, altura, chanfro = 0, seg = 3) {
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: Math.max(altura - 2 * chanfro, 0.01),
    bevelEnabled: chanfro > 0,
    bevelThickness: chanfro,
    bevelSize: chanfro,
    bevelSegments: seg,
    curveSegments: 14,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, chanfro, 0);
  return g;
}

function texturaBrilho(tamanho = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = tamanho;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(tamanho / 2, tamanho / 2, 0, tamanho / 2, tamanho / 2, tamanho / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tamanho, tamanho);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function texturaSombra() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(22px)';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(70, 70, 372, 116, 40); ctx.fill();
  ctx.filter = 'blur(7px)';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect(98, 88, 316, 80, 22); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Logo Nimblit (versão escura: símbolo ciano + palavra branca) como textura. */
function texturaLogo() {
  const escala = 6;                                // px por unidade do SVG
  const c = document.createElement('canvas');
  c.width = Math.ceil(LOGO.w * escala); c.height = Math.ceil(LOGO.h * escala);
  const ctx = c.getContext('2d');
  ctx.scale(escala, escala);
  ctx.fillStyle = CORES.ciano;
  ctx.fill(new Path2D(SIMBOLO.d));
  ctx.translate(SIMBOLO.w + LOGO.gap, LOGO.dy);
  ctx.fillStyle = '#ffffff';
  ctx.fill(new Path2D(PALAVRA.d), 'evenodd');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------ o modelo
function construirEstojo() {
  const raiz = new THREE.Group();
  raiz.name = 'estojo';

  // cores da identidade Nimblit: corpo navy, tampa no tom claro
  const matCorpo = new THREE.MeshPhysicalMaterial({ color: 0x0d2a4d, roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.45 });
  const matTampa = new THREE.MeshPhysicalMaterial({ color: 0xe3ecf5, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const matEscuro = new THREE.MeshStandardMaterial({ color: 0x0b1416, roughness: 0.8 });
  const matIsopor = new THREE.MeshStandardMaterial({ color: 0xd9e3e7, roughness: 0.95, emissive: 0x5ed8ef, emissiveIntensity: 0 });
  const matFundoCav = new THREE.MeshStandardMaterial({ color: 0xc9d6dc, roughness: 0.9, emissive: 0x5ed8ef, emissiveIntensity: 0 });

  // corpo com o furo da cavidade (paredes de isopor entram nele)
  const formaCorpo = contornoArredondado(new THREE.Shape(), CAIXA.c - 2, CAIXA.l - 2, CAIXA.r - 1);
  const furo = contornoArredondado(new THREE.Path(), CAV.c + 10, CAV.l + 10, 3, 0, -CAV.z);
  formaCorpo.holes.push(furo);
  const corpo = new THREE.Mesh(extrusaoPlana(formaCorpo, CAIXA.corpo, 1, 3), matCorpo);
  raiz.add(corpo);

  // isopor em volta da cavidade + fundo
  const formaIso = contornoArredondado(new THREE.Shape(), CAV.c + 7, CAV.l + 7, 2.5, 0, -CAV.z);
  formaIso.holes.push(contornoArredondado(new THREE.Path(), CAV.c, CAV.l, 1.5, 0, -CAV.z));
  const iso = new THREE.Mesh(extrusaoPlana(formaIso, CAV.a), matIsopor);
  iso.position.y = CAIXA.corpo - CAV.a - 0.6;
  raiz.add(iso);
  const fundo = new THREE.Mesh(new THREE.PlaneGeometry(CAV.c + 9, CAV.l + 9), matFundoCav);
  fundo.rotation.x = -Math.PI / 2;
  fundo.position.set(0, CAIXA.corpo - CAV.a - 0.55, CAV.z);
  raiz.add(fundo);

  // recesso escuro sob as fendas da tampa (dissipador)
  const recesso = new THREE.Mesh(new THREE.PlaneGeometry(44, 36), matEscuro);
  recesso.rotation.x = -Math.PI / 2;
  recesso.position.set(67, CAIXA.corpo + 0.12, -20);
  raiz.add(recesso);

  // fendas na face dos LEDs (frente), perto da outra ponta
  const formaFendaV = contornoArredondado(new THREE.Shape(), 2.6, 17, 1.3);
  const geoFendaV = new THREE.ExtrudeGeometry(formaFendaV, { depth: 1, bevelEnabled: false, curveSegments: 6 });
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(geoFendaV, matEscuro);
    f.position.set(-80 + i * 6.2, 20, CAIXA.l / 2 - 0.85);
    raiz.add(f);
  }

  // logo na face da frente, no espaço entre as fendas (até x ≈ −54) e os LEDs (a partir de x ≈ 51)
  const larguraLogo = 70;                                   // mm
  const alturaLogo = (larguraLogo * LOGO.h) / LOGO.w;       // ≈ 12,9 mm
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(larguraLogo, alturaLogo),
    new THREE.MeshStandardMaterial({
      map: texturaLogo(), transparent: true, roughness: 0.55, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  );
  logo.position.set(-1.5, LED_Y - 0.5, CAIXA.l / 2 + 0.06);
  raiz.add(logo);

  // LEDs Ø5,4 com aro escuro
  const leds = {};
  const geoCorpoLed = new THREE.CylinderGeometry(2.7, 2.7, 1.6, 28);
  geoCorpoLed.rotateX(Math.PI / 2);
  const geoDomo = new THREE.SphereGeometry(2.7, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  geoDomo.rotateX(Math.PI / 2);
  const geoAro = new THREE.TorusGeometry(3.15, 0.45, 10, 32);
  const texBrilho = texturaBrilho();
  for (const L of LEDS) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: L.apagado, emissive: L.cor, emissiveIntensity: 0,
      roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    });
    const g = new THREE.Group();
    g.position.set(L.x, LED_Y, CAIXA.l / 2);
    const c = new THREE.Mesh(geoCorpoLed, mat); c.position.z = 0.8;
    const d = new THREE.Mesh(geoDomo, mat); d.position.z = 1.6;
    const aro = new THREE.Mesh(geoAro, matEscuro); aro.position.z = 0.2;
    const brilho = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texBrilho, color: L.cor, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    brilho.scale.set(22, 22, 1);
    brilho.position.z = 3.6;
    g.add(c, d, aro, brilho);
    raiz.add(g);
    leds[L.nome] = { mat, brilho, cor: new THREE.Color(L.cor), apagado: new THREE.Color(L.apagado), atual: 0 };
  }

  // entrada USB-C na ponta direita, embaixo
  const usb = new THREE.Mesh(new THREE.CapsuleGeometry(1.65, 5.7, 6, 16), matEscuro);
  usb.rotation.x = Math.PI / 2;          // eixo da cápsula ao longo de Z
  usb.scale.set(0.5, 1, 1);              // achatada em X: formato "estádio"
  usb.position.set(CAIXA.c / 2 - 0.2, 8, -18);
  raiz.add(usb);
  const lingueta = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x9aa4a8, metalness: 0.8, roughness: 0.3 }));
  lingueta.position.set(CAIXA.c / 2 + 0.05, 8, -18);
  raiz.add(lingueta);

  // cabo USB-C (só aparece na tomada)
  const cabo = new THREE.Group();
  const matCabo = new THREE.MeshStandardMaterial({ color: 0xf3f5f6, roughness: 0.55 });
  const plugue = new THREE.Mesh(new RoundedBoxGeometry(15, 6.4, 10, 3, 2.4), matCabo);
  plugue.position.set(CAIXA.c / 2 + 7.5, 8, -18);
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CAIXA.c / 2 + 14, 8, -18),
    new THREE.Vector3(CAIXA.c / 2 + 26, 7.5, -18),
    new THREE.Vector3(CAIXA.c / 2 + 36, 3, -6),
    new THREE.Vector3(CAIXA.c / 2 + 40, 1.6, 14),
    new THREE.Vector3(CAIXA.c / 2 + 42, 1.6, 44),
    new THREE.Vector3(CAIXA.c / 2 + 46, 1.6, 78),
  ]);
  const fio = new THREE.Mesh(new THREE.TubeGeometry(curva, 60, 1.7, 10, false), matCabo);
  cabo.add(plugue, fio);
  raiz.add(cabo);

  // caneta de insulina (≈158 mm, Ø17) deitada na cavidade
  const caneta = construirCaneta();
  caneta.position.set(0, CAIXA.corpo - CAV.a + 8.9, CAV.z);
  raiz.add(caneta);

  // luz fria do resfriamento dentro da cavidade
  const luzFria = new THREE.PointLight(0x5ed8ef, 0, 160, 1.6);
  luzFria.position.set(0, CAIXA.corpo + 6, CAV.z);
  raiz.add(luzFria);
  const nevoa = new THREE.Mesh(
    new THREE.PlaneGeometry(CAV.c + 20, CAV.l + 26),
    new THREE.MeshBasicMaterial({ map: texBrilho, color: 0x5ed8ef, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  nevoa.rotation.x = -Math.PI / 2;
  nevoa.position.set(0, CAIXA.corpo - 6, CAV.z);
  raiz.add(nevoa);

  // tampa com dobradiça na borda de trás
  const formaTampa = contornoArredondado(new THREE.Shape(), CAIXA.c - 1, CAIXA.l - 1, CAIXA.r - 0.5);
  for (let i = 0; i < 5; i++) {
    const z = -34 + i * 6.8;
    formaTampa.holes.push(contornoArredondado(new THREE.Path(), 34, 3.2, 1.6, 67, -z));
  }
  const tampa = new THREE.Mesh(extrusaoPlana(formaTampa, CAIXA.tampa, 0.5, 2), matTampa);
  const dobradica = new THREE.Group();
  dobradica.position.set(0, CAIXA.corpo + 0.3, -CAIXA.l / 2);
  tampa.position.set(0, 0, CAIXA.l / 2);
  dobradica.add(tampa);
  raiz.add(dobradica);

  raiz.scale.setScalar(MM);
  return { raiz, leds, dobradica, cabo, luzFria, nevoa, matIsopor, matFundoCav };
}

function construirCaneta() {
  const g = new THREE.Group();
  const branco = new THREE.MeshPhysicalMaterial({ color: 0x9fb0bd, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const cinza = new THREE.MeshStandardMaterial({ color: 0x5d6c78, roughness: 0.45 });
  const azul = new THREE.MeshPhysicalMaterial({ color: 0x2c62c9, roughness: 0.35, clearcoat: 0.5 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0xffe9b0, roughness: 0.1, transmission: 0.4, thickness: 2, transparent: true, opacity: 0.9 });

  const cil = (r, comp, mat, x, seg = 32) => {
    const geo = new THREE.CylinderGeometry(r, r, comp, seg);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.x = x + comp / 2;
    g.add(m);
    return m;
  };
  // da esquerda (botão de dose) para a direita (tampa da caneta)
  cil(4.6, 4, azul, -79);
  cil(7.4, 13, cinza, -75);
  cil(8.2, 64, branco, -62);
  cil(8.32, 24, azul, -44);
  cil(7.6, 9, visor, -16);              // janela do refil
  cil(8.6, 76, branco, 2);              // tampa da caneta
  const ponta = new THREE.Mesh(new THREE.SphereGeometry(8.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), branco);
  ponta.rotation.z = -Math.PI / 2;
  ponta.scale.set(1, 0.32, 1);
  ponta.position.x = 78;
  g.add(ponta);
  const clipe = new THREE.Mesh(new RoundedBoxGeometry(40, 2.4, 3, 2, 1), cinza);
  clipe.position.set(46, 8.9, 0);
  g.add(clipe);
  return g;
}

// ------------------------------------------------------------ carregar
async function tentarArquivoExterno() {
  for (const ext of ['glb', 'gltf', 'stl']) {
    const url = `assets/estojo.${ext}`;
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) continue;
      let obj;
      if (ext === 'stl') {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        const geo = await new STLLoader().loadAsync(url);
        geo.computeVertexNormals();
        obj = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x163a63, roughness: 0.45, clearcoat: 0.3 }));
        obj.rotation.x = -Math.PI / 2; // STL costuma vir com Z para cima
      } else {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        obj = (await new GLTFLoader().loadAsync(url)).scene;
      }
      const grupo = new THREE.Group();
      grupo.add(obj);
      const caixa = new THREE.Box3().setFromObject(grupo);
      const tam = caixa.getSize(new THREE.Vector3());
      const escala = (CAIXA.c * MM) / Math.max(tam.x, tam.y, tam.z);
      grupo.scale.setScalar(escala);
      const c2 = new THREE.Box3().setFromObject(grupo);
      const centro = c2.getCenter(new THREE.Vector3());
      grupo.position.set(-centro.x, -c2.min.y, -centro.z);
      const raiz = new THREE.Group();
      raiz.add(grupo);
      return raiz;
    } catch { /* tenta o próximo formato */ }
  }
  return null;
}

// ------------------------------------------------------------ cena
export function criarEstojo3D(container, { status = 'seguro', tomada = true, sondarArquivo = true, captura = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: captura });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environmentIntensity = 0.85;

  const luz = new THREE.DirectionalLight(0xffffff, 1.4);
  luz.position.set(-2, 4, 3);
  cena.add(luz);
  cena.add(new THREE.HemisphereLight(0xeaf6ff, 0xb9c6cc, 0.5));

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  const alvo = new THREE.Vector3(0, 0.1, 0);

  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.copy(alvo);
  controles.enableZoom = false;
  controles.enablePan = false;
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.7;
  controles.minPolarAngle = 0.35;
  controles.maxPolarAngle = 1.32;
  controles.autoRotate = true;
  controles.autoRotateSpeed = 1.1;

  // sombra de contato
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false, opacity: 0.75 }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.001;
  cena.add(sombra);

  const m = construirEstojo();
  cena.add(m.raiz);
  let externo = false;

  if (sondarArquivo) {
    tentarArquivoExterno().then((obj) => {
      if (!obj) return;
      cena.remove(m.raiz);
      cena.add(obj);
      externo = true;
      container.dataset.modelo = 'arquivo';
    });
  }

  // ---- estado
  let ledAtivo = LED_DO_STATUS[status];
  let naTomada = tomada;
  let tampaAlvo = 0, tampaT = 0;
  let frio = tomada ? 1 : 0;

  const enquadrar = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // distância que cabe o estojo (com o cabo) girando, em qualquer proporção
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const raioH = 1.32, raioV = 0.7;
    const d = Math.max(raioH / Math.tan(hfov / 2), raioV / Math.tan(vfov / 2)) * 1.1;
    const dir = camera.position.clone().sub(controles.target);
    if (dir.lengthSq() < 1e-6) dir.setFromSphericalCoords(1, 0.98, 0.62);
    dir.setLength(d);
    camera.position.copy(controles.target).add(dir);
    camera.updateProjectionMatrix();
  };
  camera.position.setFromSphericalCoords(1, 0.98, 0.62).add(alvo);
  enquadrar();
  new ResizeObserver(enquadrar).observe(container);

  // ---- girar sozinho só quando ninguém mexe
  let retomar = null;
  controles.addEventListener('start', () => { controles.autoRotate = false; clearTimeout(retomar); });
  controles.addEventListener('end', () => { clearTimeout(retomar); retomar = setTimeout(() => (controles.autoRotate = true), 2500); });

  // ---- tocar no estojo abre/fecha a tampa
  const ray = new THREE.Raycaster();
  let toque = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { toque = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!toque) return;
    const mov = Math.hypot(e.clientX - toque.x, e.clientY - toque.y);
    const dt = performance.now() - toque.t;
    toque = null;
    if (mov > 8 || dt > 450) return;
    const r = renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const alvoRaio = externo ? cena : m.raiz;
    if (ray.intersectObject(alvoRaio, true).length) api.alternarTampa();
  });

  // ---- loop (pausa quando a tela não aparece)
  let visivel = true;
  new IntersectionObserver(([en]) => { visivel = en.isIntersecting; }).observe(container);
  const relogio = new THREE.Clock();
  let ultimo = 0;

  function quadro() {
    requestAnimationFrame(quadro);
    if (!visivel || document.hidden) { relogio.getDelta(); return; }
    const dt = Math.min(relogio.getDelta(), 0.05);
    ultimo += dt;

    // tampa
    const vel = dt / 0.75;
    tampaT = tampaAlvo > tampaT ? Math.min(tampaAlvo, tampaT + vel) : Math.max(tampaAlvo, tampaT - vel);
    const e = tampaT < 0.5 ? 4 * tampaT ** 3 : 1 - (-2 * tampaT + 2) ** 3 / 2;
    m.dobradica.rotation.x = -1.92 * e;

    // LEDs (o halo some quando a face dos LEDs fica de lado ou de costas)
    const frente = THREE.MathUtils.smoothstep(camera.position.z / camera.position.length(), 0.05, 0.45);
    for (const [nome, L] of Object.entries(m.leds)) {
      const alvoL = nome === ledAtivo ? 1 : 0;
      L.atual += (alvoL - L.atual) * Math.min(1, dt * 8);
      const pulso = 0.92 + 0.08 * Math.sin(ultimo * 2.4);
      L.mat.emissiveIntensity = 2.6 * L.atual * pulso;
      L.mat.color.copy(L.apagado).lerp(L.cor, L.atual * 0.7);
      L.brilho.material.opacity = 0.85 * L.atual * pulso * frente;
    }

    // brilho frio na cavidade quando está na tomada
    frio += ((naTomada ? 1 : 0) - frio) * Math.min(1, dt * 3);
    const resp = 0.8 + 0.2 * Math.sin(ultimo * 1.3);
    m.matFundoCav.emissiveIntensity = 0.3 * frio * resp;
    m.matIsopor.emissiveIntensity = 0.1 * frio * resp;
    m.luzFria.intensity = 0.25 * frio * e * resp;
    m.nevoa.material.opacity = 0.16 * frio * e * resp;
    m.cabo.visible = naTomada;

    controles.update(dt);
    renderer.render(cena, camera);
  }
  quadro();

  const api = {
    definirStatus(s) { ledAtivo = LED_DO_STATUS[s] || 'verde'; },
    definirTomada(b) { naTomada = !!b; },
    alternarTampa(abrir) {
      tampaAlvo = typeof abrir === 'boolean' ? (abrir ? 1 : 0) : (tampaAlvo ? 0 : 1);
      container.dataset.tampa = tampaAlvo ? 'aberta' : 'fechada';
      container.dispatchEvent(new CustomEvent('tampa', { detail: { aberta: !!tampaAlvo } }));
      return !!tampaAlvo;
    },
    get tampaAberta() { return !!tampaAlvo; },
  };
  return api;
}
