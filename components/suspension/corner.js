import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';

// Rear left brake corner, isolated from the full R27e suspension model and labelled by part.
const SVG = 'http://www.w3.org/2000/svg';
const COLORS = { brakes: '#b2363e', hubs: '#2d6aa8' };
// `at` is a point inside the part's bounding box (0–1 on each axis) where the callout dot sits.
const LABELS = [
  { name: 'Brake rotor',   group: 'brakes', match: /Rear Brake Rotor/,       at: [1, 0.78, 0.12], surface: [0, 1, 0.35] },
  { name: 'Brake caliper', group: 'brakes', match: /Rear brake caliper/,     at: [1, 0.5, 0.5] },
  { name: 'Brake button',  group: 'brakes', match: /Brake Floating Button/,  at: [1, 0.5, 0.5], pick: 'top' },
  { name: 'Hub',           group: 'hubs',   match: /Rear Left Hub/,          at: [1, 0.22, 0.5] },
  { name: 'Wheel locknut', group: 'hubs',   match: /Wheel Lock Nut/,         at: [1, 0.5, 0.5] },
  { name: 'Upright',       group: 'hubs',   match: /Rear Left Upright/,      at: [0.5, 0.97, 0.5], surface: [0.3, 1, 0] }
];

const host = document.querySelector('[data-corner-viewer]');
if (host) setup(host);

function setup(host) {
  const stage = host.querySelector('.sv-stage');
  const status = host.querySelector('.sv-status');
  const labelLayer = host.querySelector('.sv-labels');
  let renderer, scene, camera, controls, draco;
  const meshes = [];
  let labels = [], leaders = null, box = new THREE.Box3();
  let active = false, started = false, raf = 0, dirty = true, highlight = null;

  new IntersectionObserver(entries => {
    active = entries[0].isIntersecting;
    if (active && !started) { started = true; init(); }
    if (active && renderer && !raf) tick();
  }, { rootMargin: '200px' }).observe(host);

  async function init() {
    status.textContent = 'Loading 3D model…';
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0xf3f5f8);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, 1, 0.001, 50);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7785, 2.4));
      for (const [x, y, z, i] of [[3, 4, 2, 3.4], [-2, 2, -3, 1.8], [2, -1, 3, 1.2]]) {
        const l = new THREE.DirectionalLight(0xffffff, i); l.position.set(x, y, z); scene.add(l);
      }
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.addEventListener('change', () => { dirty = true; });
      draco = new DRACOLoader();
      draco.setDecoderPath(new URL('./vendor/draco/gltf/', import.meta.url).href);
      const gltf = await new GLTFLoader().setDRACOLoader(draco)
        .loadAsync(new URL('../../assets/models/r27e-suspension.glb', import.meta.url).href);
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      // Keep only the rear left corner's hub, brake and hardware parts (left is +x, rear is −z).
      const keep = [];
      root.traverse(o => {
        if (!o.isMesh) return;
        let p = o; while (p && !p.userData.partName) p = p.parent;
        const ud = p ? p.userData : {};
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        if (ud.section === 'rear' && c.x > 0.36 && ['hubs', 'brakes', 'hardware'].includes(ud.group) && !/WSS|Wheel Speed|ELPM|Potentiometer|G Sensor/i.test(ud.partName || '')) {
          o.userData = { ...ud, ...o.userData };
          keep.push(o);
        }
      });
      root.traverse(o => { if (o.isMesh) o.visible = keep.includes(o); });
      for (const m of keep) {
        m.material = m.material.clone();
        m.userData.base = m.material.color.clone();
        meshes.push(m);
        box.expandByObject(m);
      }
      scene.add(root);
      stage.prepend(renderer.domElement);
      host.classList.add('sv-loaded');
      status.textContent = '';
      new ResizeObserver(() => { resize(); dirty = true; }).observe(stage);
      resize(); fit(); makeLabels();
      host.querySelector('[data-reset]').disabled = false;
      if (!raf) tick();
    } catch (error) {
      console.error('Corner viewer:', error);
      status.textContent = 'The 3D model could not load.';
      renderer?.domElement.remove(); renderer = null;
    }
  }

  function resize() {
    if (!renderer || !stage.clientWidth) return;
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
  }

  // View from outboard, slightly above and behind, like looking at the wheel face.
  function fit() {
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(1, 0.28, -0.32).normalize();
    const xRoom = camera.aspect > 1.3 ? 0.62 : 0.85;
    const dist = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.min(1, camera.aspect * xRoom) * 0.95;
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
    controls.target.copy(center); controls.update(); dirty = true;
  }

  function makeLabels() {
    labelLayer.replaceChildren();
    leaders = document.createElementNS(SVG, 'svg'); leaders.classList.add('sv-leaders'); labelLayer.append(leaders);
    labels = [];
    for (const spec of LABELS) {
      let parts = meshes.filter(m => spec.match.test(m.userData.partName || ''));
      if (!parts.length) continue;
      const set = new Set(parts);
      if (spec.pick === 'top') parts = [parts.sort((a, b) => new THREE.Box3().setFromObject(b).max.y - new THREE.Box3().setFromObject(a).max.y)[0]];
      const b = new THREE.Box3(); parts.forEach(m => b.expandByObject(m));
      const point = new THREE.Vector3(...spec.at.map((f, i) => b.min.getComponent(i) + f * (b.max.getComponent(i) - b.min.getComponent(i))));
      if (spec.surface) {
        // Put the dot on a real vertex of the part: the one furthest in the given direction.
        const dir = new THREE.Vector3(...spec.surface).normalize(), v = new THREE.Vector3();
        let best = -Infinity;
        for (const m of parts) {
          const pos = m.geometry.attributes.position;
          for (let i = 0; i < pos.count; i += 3) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            const d = v.dot(dir); if (d > best) { best = d; point.copy(v); }
          }
        }
      }
      const color = COLORS[spec.group];
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sv-label'; el.style.setProperty('--c', color);
      el.innerHTML = '<strong></strong>'; el.querySelector('strong').textContent = spec.name;
      el.setAttribute('aria-label', 'Highlight ' + spec.name);
      const line = document.createElementNS(SVG, 'line'); const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', '4.5'); line.style.stroke = dot.style.fill = color; leaders.append(line, dot);
      const on = () => { highlight = { set, color }; paint(); };
      const off = () => { highlight = null; paint(); };
      el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off);
      el.addEventListener('focus', on); el.addEventListener('blur', off);
      labelLayer.append(el);
      labels.push({ el, line, dot, point, set });
    }
  }

  function paint() {
    const tint = highlight ? new THREE.Color(highlight.color) : null;
    for (const m of meshes) {
      const lit = highlight && highlight.set.has(m), dim = highlight && !lit;
      m.material.color.copy(m.userData.base); if (lit) m.material.color.lerp(tint, 0.55);
      m.material.transparent = !!dim; m.material.opacity = dim ? 0.12 : 1; m.material.depthWrite = !dim;
      m.material.emissive.copy(lit ? tint : new THREE.Color(0)); m.material.emissiveIntensity = lit ? 0.35 : 0;
    }
    labels.forEach(l => l.el.classList.toggle('is-dim', !!highlight && highlight.set !== l.set));
    dirty = true;
  }

  function updateLabels() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const project = v => { const p = v.clone().project(camera); return { x: (p.x * .5 + .5) * w, y: (-p.y * .5 + .5) * h, z: p.z }; };
    let left = Infinity, right = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = project(new THREE.Vector3(x, y, z)); left = Math.min(left, p.x); right = Math.max(right, p.x);
    }
    const mid = (left + right) / 2, cols = { L: [], R: [] };
    for (const l of labels) {
      l.a = project(l.point); l.w = l.el.offsetWidth; l.h = l.el.offsetHeight;
      l.shown = l.a.z < 1 && l.a.x > 0 && l.a.x < w && l.a.y > 0 && l.a.y < h;
      if (l.shown) cols[l.a.x < mid ? 'L' : 'R'].push(l);
    }
    for (const [side, list] of Object.entries(cols)) {
      list.sort((p, q) => p.a.y - q.a.y);
      let y = 50; for (const l of list) { l.y = Math.max(l.a.y - l.h / 2, y); y = l.y + l.h + 10; }
      let lim = h - 10; for (const l of [...list].reverse()) { l.y = Math.min(l.y, lim - l.h); lim = l.y - 10; }
      for (const l of list) {
        l.x = side === 'L' ? Math.max(10, Math.min(left - 24, l.a.x - 50) - l.w) : Math.min(w - l.w - 10, Math.max(right + 24, l.a.x + 50));
        l.el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)`;
        const ex = side === 'L' ? l.x + l.w : l.x, ey = l.y + l.h / 2;
        l.line.setAttribute('x1', ex); l.line.setAttribute('y1', ey); l.line.setAttribute('x2', l.a.x); l.line.setAttribute('y2', l.a.y);
        l.dot.setAttribute('cx', l.a.x); l.dot.setAttribute('cy', l.a.y);
      }
    }
    for (const l of labels) {
      l.el.classList.toggle('is-hidden', !l.shown);
      l.line.style.display = l.dot.style.display = l.shown ? '' : 'none';
    }
  }

  function tick() {
    raf = 0; if (!renderer || !active) return;
    controls.update();
    if (dirty) { renderer.render(scene, camera); updateLabels(); dirty = false; }
    raf = requestAnimationFrame(tick);
  }
  host.querySelector('[data-reset]').addEventListener('click', () => { highlight = null; paint(); fit(); });
}
