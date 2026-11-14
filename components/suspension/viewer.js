import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';

// Subsystems: colours are shared by the callout labels, the legend and the highlight.
const SUBSYSTEMS = {
  wheels:   { name: 'Rims & tyres',              color: '#4f5b6b', groups: ['wheels'] },
  hubs:     { name: 'Hubs & uprights',           color: '#2d6aa8', groups: ['hubs'] },
  arms:     { name: 'Control arms & rods',       color: '#3b7a5b', groups: ['arms'] },
  dampers:  { name: 'Springs & dampers',         color: '#b25b23', groups: ['dampers'] },
  arbsteer: { name: 'Anti-roll bars & steering', color: '#6b4c9e', groups: ['arb', 'steering'] },
  brakes:   { name: 'Brakes',                    color: '#b2363e', groups: ['brakes'] }
};

// Callout labels. `match` picks the CAD parts the label stands for (all are highlighted).
// `at` places the callout per view: '<section> <side>' for the complete view, '<side>' for front/rear,
// where side is L (car left, +x), R (car right, -x) or C (centre). Views without an entry show no callout.
// On narrow screens the complete view keeps only the `core` callouts.
const LABELS = [
  { name: 'Tyre & rim', core: true,       sub: 'wheels',   match: /Hoosier|^Rim /, anchor: /Hoosier/, top: true, at: { all: 'front R', front: 'R', rear: 'R' } },
  { name: 'Upright & hub', core: true,    sub: 'hubs',     match: /(Left|Right) (Upright|Hub)$/, anchor: /Upright$/, at: { all: 'rear R', front: 'L', rear: 'L' } },
  { name: 'Wishbones', core: true,        sub: 'arms',     match: /(Upper|Lower) (Leading|Trailing) Steel Rod/, anchor: /Upper Leading Steel Rod/, at: { all: 'rear L', front: 'R', rear: 'R' } },
  { name: 'Pushrod',          sub: 'arms',     match: /Push Rod.*Steel Rod/,                        at: { all: 'front L', front: 'L', rear: 'L' } },
  { name: 'Rocker',           sub: 'arms',     match: /(Left|Right) Rocker$/,                       at: { front: 'R', rear: 'L' } },
  { name: 'Coilover damper', core: true,  sub: 'dampers',  match: /Ohlins TTX25 (Damper|Hyperco)/, anchor: /Hyperco/, at: { all: 'rear R', front: 'L', rear: 'R' } },
  { name: 'Anti-roll bar', core: true,    sub: 'arbsteer', match: /ARB (Torsion Tube|Blade|Carbon Tube|Droplink)/, anchor: /ARB Torsion Tube/, at: { all: 'front C', front: 'C', rear: 'C' } },
  { name: 'Steering tie rod', sub: 'arbsteer', match: /Front Steering Rod Steel Rod/,               at: { all: 'front R', front: 'R' } },
  { name: 'Toe link',         sub: 'arbsteer', match: /Rear Toe Steel Rod/,                         at: { rear: 'R' } },
  { name: 'Brake rotor',      sub: 'brakes',   match: /Brake Rotor/,                                at: { all: 'front L', front: 'L', rear: 'R' } },
  { name: 'Brake caliper', core: true,    sub: 'brakes',   match: /caliper/i,                                   at: { all: 'rear L', front: 'R', rear: 'L' } }
];

const SVG = 'http://www.w3.org/2000/svg';
const host = document.querySelector('[data-suspension-viewer]');
if (host) setup(host);

function setup(host) {
  const stage = host.querySelector('.sv-stage');
  const status = host.querySelector('.sv-status');
  const labelLayer = host.querySelector('.sv-labels');
  const tooltip = host.querySelector('.sv-tooltip');
  const legend = document.querySelectorAll('[data-sv-subsystem]');

  let renderer, scene, camera, controls, draco, root;
  const meshes = [];
  let labels = [], leaders = null, visibleBox = new THREE.Box3();
  let view = 'all';
  let hover = null;   // { meshes:Set, color } from pointer hover
  let pinned = null;  // { key, meshes:Set, color } from click / tap
  let active = false, started = false, raf = 0, dirty = true;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerEvent = null;

  const subOf = mesh => Object.keys(SUBSYSTEMS).find(k => SUBSYSTEMS[k].groups.includes(mesh.userData.group));
  const inView = mesh => view === 'all' || mesh.userData.section === view;
  const shortName = n => String(n || '').split(' · ')[0];

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
      renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the R27e suspension');

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7785, 2.4));
      for (const [x, y, z, i] of [[3, 5, 4, 3.6], [-4, 2, -3, 2.2], [0, 4, -4, 1.6]]) {
        const light = new THREE.DirectionalLight(0xffffff, i);
        light.position.set(x, y, z);
        scene.add(light);
      }

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.maxDistance = 12;
      controls.addEventListener('change', () => { dirty = true; });

      draco = new DRACOLoader();
      draco.setDecoderPath(new URL('./vendor/draco/gltf/', import.meta.url).href);
      const gltf = await new GLTFLoader().setDRACOLoader(draco)
        .loadAsync(new URL('../../assets/models/r27e-suspension.glb', import.meta.url).href);
      root = gltf.scene;
      scene.add(root);
      root.traverse(obj => {
        if (!obj.isMesh) return;
        if (!obj.userData.partName) {
          let p = obj.parent;
          while (p && !p.userData.partName) p = p.parent;
          if (p) obj.userData = { ...p.userData, ...obj.userData };
        }
        obj.material = obj.material.clone();
        obj.userData.base = { color: obj.material.color.clone() };
        meshes.push(obj);
      });
      root.updateMatrixWorld(true);

      stage.prepend(renderer.domElement);
      host.classList.add('sv-loaded');
      status.textContent = '';
      new ResizeObserver(() => { resize(); dirty = true; }).observe(stage);
      resize();
      fit();
      makeLabels();
      bindPointer();
      host.querySelectorAll('.sv-controls button').forEach(b => { b.disabled = false; });
      if (!raf) tick();
    } catch (error) {
      console.error('Suspension viewer:', error);
      status.textContent = 'The 3D model could not load, so the assembly image is shown instead.';
      renderer?.domElement.remove();
      renderer?.dispose();
      renderer = null;
      draco?.dispose();
    }
  }

  function resize() {
    if (!renderer || !stage.clientWidth) return;
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
  }

  // Frame the visible assembly from a three-quarter view above the car (front is +z, left is +x).
  const VIEW_DIRECTIONS = { all: [1.1, 1.55, 1.0], front: [0.95, 0.75, 1.3], rear: [0.95, 0.85, -1.3] };
  function fit() {
    const box = new THREE.Box3();
    meshes.filter(inView).forEach(m => box.expandByObject(m));
    visibleBox = box.clone();
    const center = box.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    let distance = box.getSize(new THREE.Vector3()).length() * 1.5;
    controls.target.copy(center);
    // Two passes: measure how much of the frame the box fills, then scale the distance to suit.
    for (let i = 0; i < 3; i++) {
      camera.position.copy(center).addScaledVector(dir, distance);
      camera.near = distance / 200; camera.far = distance * 20;
      camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      // Leave side room for the label columns when the stage is wide enough.
      const xRoom = camera.aspect > 1.3 ? 0.72 : 0.9;
      let extent = 0;
      for (const c of corners) { const p = c.clone().project(camera); extent = Math.max(extent, Math.abs(p.x) / xRoom, (Math.abs(p.y) + 0.06) / 0.86); }
      distance *= extent;
    }
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.updateProjectionMatrix();
    controls.update();
    dirty = true;
  }

  function makeLabels() {
    labelLayer.replaceChildren();
    leaders = document.createElementNS(SVG, 'svg');
    leaders.classList.add('sv-leaders');
    labelLayer.append(leaders);
    labels = [];
    for (const spec of LABELS) {
      const all = meshes.filter(m => inView(m) && spec.match.test(m.userData.partName));
      if (!all.length) continue;
      const where = spec.at[view];
      if (!where || (view === 'all' && !spec.core && stage.clientWidth < 600)) continue;
      const [section, side] = view === 'all' ? where.split(' ') : [view, where];
      const centre = m => {
        const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3());
        if (spec.top) c.y = b.max.y; // e.g. a dot on the tyre tread rather than hidden at the axle
        return c;
      };
      const anchors = all
        .filter(m => m.userData.section === section && (!spec.anchor || spec.anchor.test(m.userData.partName)))
        .map(m => ({ m, p: centre(m) }))
        .sort((a, b) => side === 'C' ? Math.abs(a.p.x) - Math.abs(b.p.x) : side === 'L' ? b.p.x - a.p.x : a.p.x - b.p.x);
      if (!anchors.length) continue;
      const anchor = anchors[0];
      const sub = SUBSYSTEMS[spec.sub];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sv-label';
      const line = document.createElementNS(SVG, 'line');
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', '4.5');
      line.style.stroke = dot.style.fill = sub.color;
      leaders.append(line, dot);
      el.style.setProperty('--c', sub.color);
      el.innerHTML = '<strong></strong><small></small>';
      el.querySelector('strong').textContent = spec.name;
      el.querySelector('small').textContent = sub.name;
      el.setAttribute('aria-label', `Highlight ${spec.name} (${sub.name})`);
      const set = new Set(all);
      const key = 'label:' + spec.name;
      el.addEventListener('pointerenter', () => setHover({ meshes: set, color: sub.color }));
      el.addEventListener('pointerleave', () => setHover(null));
      el.addEventListener('focus', () => setHover({ meshes: set, color: sub.color }));
      el.addEventListener('blur', () => setHover(null));
      el.addEventListener('click', () => togglePin(key, set, sub.color));
      labelLayer.append(el);
      labels.push({ el, line, dot, point: anchor.p, mesh: anchor.m, key });
    }
    dirty = true;
  }

  // Callouts sit in a column either side of the model, joined to their part by a leader line.
  // Each column is spread vertically so boxes never overlap.
  function updateLabels() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const effective = hover || pinned;
    const project = v => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, z: p.z }; };
    let left = Infinity, right = -Infinity;
    const { min, max } = visibleBox;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      const p = project(new THREE.Vector3(x, y, z)); left = Math.min(left, p.x); right = Math.max(right, p.x);
    }
    const mid = (left + right) / 2;
    const columns = { L: [], R: [] };
    for (const label of labels) {
      const a = project(label.point);
      label.a = a;
      label.w = label.el.offsetWidth; label.h = label.el.offsetHeight;
      const onScreen = a.z < 1 && a.x > 0 && a.x < w && a.y > 0 && a.y < h;
      label.shown = onScreen;
      if (onScreen) columns[a.x < mid ? 'L' : 'R'].push(label);
    }
    const top = 54, bottom = h - 10, gap = 8;
    for (const [side, list] of Object.entries(columns)) {
      list.sort((p, q) => p.a.y - q.a.y);
      // Push down to clear the box above, then pull back up from the bottom edge.
      let y = top;
      for (const l of list) { l.y = Math.max(l.a.y - l.h / 2, y); y = l.y + l.h + gap; }
      let limit = bottom;
      for (const l of [...list].reverse()) { l.y = Math.min(l.y, limit - l.h); limit = l.y - gap; }
      for (const l of list) {
        if (l.y < 8) { l.shown = false; continue; }
        l.x = side === 'L' ? Math.max(10, Math.min(left - 22, l.a.x - 40) - l.w) : Math.min(w - l.w - 10, Math.max(right + 22, l.a.x + 40));
        l.el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)`;
        const ex = side === 'L' ? l.x + l.w : l.x, ey = l.y + l.h / 2;
        l.line.setAttribute('x1', ex); l.line.setAttribute('y1', ey);
        l.line.setAttribute('x2', l.a.x); l.line.setAttribute('y2', l.a.y);
        l.dot.setAttribute('cx', l.a.x); l.dot.setAttribute('cy', l.a.y);
      }
    }
    for (const label of labels) {
      const dim = !!effective && !effective.meshes.has(label.mesh);
      label.el.classList.toggle('is-hidden', !label.shown);
      label.el.classList.toggle('is-active', !!(pinned && pinned.key === label.key));
      label.el.classList.toggle('is-dim', dim);
      for (const part of [label.line, label.dot]) {
        part.style.display = label.shown ? '' : 'none';
        part.style.opacity = dim ? 0.3 : 1;
      }
    }
  }

  function paint() {
    const effective = hover || pinned;
    const tint = effective ? new THREE.Color(effective.color) : null;
    for (const m of meshes) {
      const mat = m.material;
      m.visible = inView(m);
      const lit = effective && effective.meshes.has(m);
      const dim = effective && !lit;
      mat.color.copy(m.userData.base.color);
      if (lit) mat.color.lerp(tint, 0.55);
      mat.transparent = !!dim;
      mat.opacity = dim ? 0.1 : 1;
      mat.depthWrite = !dim;
      mat.emissive.copy(lit ? tint : new THREE.Color(0));
      mat.emissiveIntensity = lit ? 0.35 : 0;
    }
    legend.forEach(item => item.classList.toggle('is-active', !!pinned && pinned.key === 'sub:' + item.dataset.svSubsystem));
    dirty = true;
  }

  function setHover(next) { hover = next; paint(); }
  function togglePin(key, set, color) {
    pinned = pinned && pinned.key === key ? null : { key, meshes: set, color };
    paint();
  }
  const subsystemSet = key => new Set(meshes.filter(m => inView(m) && SUBSYSTEMS[key].groups.includes(m.userData.group)));

  legend.forEach(item => {
    const key = item.dataset.svSubsystem;
    const color = SUBSYSTEMS[key].color;
    item.style.setProperty('--c', color);
    item.addEventListener('pointerenter', () => renderer && setHover({ meshes: subsystemSet(key), color }));
    item.addEventListener('pointerleave', () => renderer && setHover(null));
    item.addEventListener('focus', () => renderer && setHover({ meshes: subsystemSet(key), color }));
    item.addEventListener('blur', () => renderer && setHover(null));
    item.addEventListener('click', () => renderer && togglePin('sub:' + key, subsystemSet(key), color));
  });

  function bindPointer() {
    const canvas = renderer.domElement;
    let down = null;
    canvas.addEventListener('pointermove', e => { pointerEvent = e; });
    canvas.addEventListener('pointerleave', () => {
      pointerEvent = null;
      tooltip.hidden = true;
      if (hover && hover.fromModel) setHover(null);
    });
    canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || e.button !== 0) return;
      const hit = pick(e);
      if (!hit) { pinned = null; paint(); return; }
      const sub = subOf(hit);
      togglePin('part:' + hit.uuid, new Set([hit]), SUBSYSTEMS[sub]?.color || '#19558a');
      if (e.pointerType !== 'mouse') showTooltip(hit, e);
    });
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      status.textContent = 'The 3D view was paused by your browser. Reload the page to restore it.';
    });
  }

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const effective = hover && !hover.fromModel ? hover : pinned;
    const candidates = meshes.filter(m => m.visible && (!effective || effective.meshes.has(m)));
    return raycaster.intersectObjects(candidates, false)[0]?.object || null;
  }

  function showTooltip(mesh, e) {
    const rect = stage.getBoundingClientRect();
    const sub = SUBSYSTEMS[subOf(mesh)];
    tooltip.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = shortName(mesh.userData.partName || mesh.name);
    const small = document.createElement('small');
    small.textContent = `${mesh.userData.section === 'rear' ? 'Rear' : 'Front'} · ${sub ? sub.name : 'Mounting hardware'}`;
    tooltip.append(strong, small);
    tooltip.style.setProperty('--c', sub ? sub.color : '#66758a');
    tooltip.style.transform = `translate(${Math.min(e.clientX - rect.left + 14, rect.width - 220)}px, ${e.clientY - rect.top + 14}px)`;
    tooltip.hidden = false;
  }

  // Hover over the model: name the part under the pointer (mouse only; touch uses tap).
  function updateHover() {
    if (!pointerEvent || pointerEvent.pointerType !== 'mouse' || pointerEvent.buttons) return;
    const e = pointerEvent;
    pointerEvent = null;
    const hit = pick(e);
    if (!hit) {
      tooltip.hidden = true;
      if (hover && hover.fromModel) setHover(null);
      return;
    }
    showTooltip(hit, e);
    if (pinned) return; // keep a pinned highlight steady; the tooltip still names the part
    if (!hover || !hover.fromModel || !hover.meshes.has(hit)) {
      setHover({ meshes: new Set([hit]), color: SUBSYSTEMS[subOf(hit)]?.color || '#19558a', fromModel: true });
    }
  }

  function tick() {
    raf = 0;
    if (!renderer || !active) return;
    controls.update();
    updateHover();
    if (dirty) {
      renderer.render(scene, camera);
      updateLabels();
      dirty = false;
    }
    raf = requestAnimationFrame(tick);
  }

  host.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view;
    host.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    hover = null; pinned = null; tooltip.hidden = true;
    paint(); fit(); makeLabels();
  }));
  host.querySelector('[data-reset]').addEventListener('click', () => {
    hover = null; pinned = null; tooltip.hidden = true;
    paint(); fit(); makeLabels();
  });
  window.addEventListener('pagehide', e => {
    if (e.persisted) return;
    cancelAnimationFrame(raf);
    controls?.dispose(); renderer?.dispose(); draco?.dispose();
  });
}
