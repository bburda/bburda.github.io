import * as THREE from 'three';

/**
 * A vehicle becomes a humanoid as the timeline scrolls: the newest role reads as a robot, the
 * oldest as a car. Nothing about the diagnostic model depends on which body it is.
 *
 * Only rigid transforms interpolate. Every part is drawn once as a box or a cylinder and is never
 * reshaped. A part carries a start pose and an end pose, and the code blends position and rotation
 * between them. Blending vertex positions instead gives mush at every value in between.
 */

const INK = 0x0f1a2e;
const HAIRLINE = 0x9aa6b6;
const D = Math.PI / 180;

type Xf = readonly [number, number, number, number, number, number];
type Span = readonly [number, number];
type Shape = { box: readonly [number, number, number]; cyl?: undefined } | { cyl: readonly [number, number]; box?: undefined };
type Part = { n: string; car: Xf; rob: Xf; s: Span } & Shape;

// car / rob: [x,y,z, rx,ry,rz] in degrees.  s: the slice of global progress this part travels in.
//
// The stagger runs bottom-up: feet, legs, pelvis, torso, arms, head. The spread is small on
// purpose. Every span is 0.85 wide and the starts cover only 0.15. With wide spans, say 0.5 wide
// and starting anywhere from 0.04 to 0.50, the torso is already finished and vertical at head
// height while the hood and the doors have not moved at all. That splits the body in two, with a
// hole between the halves.
const PARTS: readonly Part[] = [
  { n: 'floorL', box: [2.2, 0.55, 0.75], car: [0, 0.7, -0.375, 0, 0, 0], rob: [-0.32, 3.8, 0, 0, 0, 90], s: [0.09, 0.94] },
  { n: 'floorR', box: [2.2, 0.55, 0.75], car: [0, 0.7, 0.375, 0, 0, 0], rob: [0.32, 3.8, 0, 0, 0, 90], s: [0.09, 0.94] },
  { n: 'cabin', box: [1.0, 0.7, 1.2], car: [-0.15, 1.32, 0, 0, 0, 0], rob: [0, 5.25, 0, 0, 90, 0], s: [0.15, 1.0] },
  { n: 'hood', box: [1.3, 0.35, 1.5], car: [1.68, 0.72, 0, 0, 0, 0], rob: [0, 4.0, 0.55, 90, 0, 0], s: [0.14, 0.99] },
  { n: 'trunk', box: [1.1, 0.4, 1.5], car: [-1.62, 0.75, 0, 0, 0, 0], rob: [0, 2.5, 0, 0, 90, 0], s: [0.06, 0.91] },
  { n: 'bumpL', box: [0.4, 0.3, 0.65], car: [2.36, 0.6, -0.42, 0, 0, 0], rob: [-0.45, 0.15, 0.18, 0, 0, 0], s: [0.0, 0.85] },
  { n: 'bumpR', box: [0.4, 0.3, 0.65], car: [2.36, 0.6, 0.42, 0, 0, 0], rob: [0.45, 0.15, 0.18, 0, 0, 0], s: [0.0, 0.85] },
  { n: 'fendRL', box: [1.0, 0.45, 0.4], car: [-1.45, 0.62, -0.78, 0, 0, 0], rob: [-0.45, 0.8, 0, 0, 0, 90], s: [0.015, 0.865] },
  { n: 'fendRR', box: [1.0, 0.45, 0.4], car: [-1.45, 0.62, 0.78, 0, 0, 0], rob: [0.45, 0.8, 0, 0, 0, 90], s: [0.015, 0.865] },
  { n: 'fendFL', box: [1.0, 0.45, 0.4], car: [1.45, 0.62, -0.78, 0, 0, 0], rob: [-0.45, 1.8, 0, 0, 0, 90], s: [0.045, 0.895] },
  { n: 'fendFR', box: [1.0, 0.45, 0.4], car: [1.45, 0.62, 0.78, 0, 0, 0], rob: [0.45, 1.8, 0, 0, 0, 90], s: [0.045, 0.895] },
  { n: 'doorL', box: [1.4, 0.55, 0.4], car: [0, 0.72, -0.62, 0, 0, 0], rob: [-0.95, 3.8, 0, 0, 0, 90], s: [0.11, 0.96] },
  { n: 'doorR', box: [1.4, 0.55, 0.4], car: [0, 0.72, 0.62, 0, 0, 0], rob: [0.95, 3.8, 0, 0, 0, 90], s: [0.11, 0.96] },
  { n: 'skirtL', box: [1.1, 0.4, 0.45], car: [0, 0.32, -0.62, 0, 0, 0], rob: [-0.95, 2.5, 0.1, 0, 0, 90], s: [0.075, 0.925] },
  { n: 'skirtR', box: [1.1, 0.4, 0.45], car: [0, 0.32, 0.62, 0, 0, 0], rob: [0.95, 2.5, 0.1, 0, 0, 90], s: [0.075, 0.925] },
  { n: 'wheelFL', cyl: [0.42, 0.3], car: [1.45, 0.42, -0.85, 90, 0, 0], rob: [-0.45, 1.3, 0, 90, 0, 0], s: [0.03, 0.88] },
  { n: 'wheelFR', cyl: [0.42, 0.3], car: [1.45, 0.42, 0.85, 90, 0, 0], rob: [0.45, 1.3, 0, 90, 0, 0], s: [0.03, 0.88] },
  { n: 'wheelRL', cyl: [0.42, 0.3], car: [-1.45, 0.42, -0.85, 90, 0, 0], rob: [-0.95, 4.55, 0, 90, 0, 0], s: [0.125, 0.975] },
  { n: 'wheelRR', cyl: [0.42, 0.3], car: [-1.45, 0.42, 0.85, 90, 0, 0], rob: [0.95, 4.55, 0, 90, 0, 0], s: [0.125, 0.975] },
];

const clamp = (v: number): number => (!(v > 0) ? 0 : v > 1 ? 1 : v);
// smoothstep, not ease-in-out-cubic. Cubic is twice as steep in the middle, so a small stagger
// between two parts turns into a big gap in where they actually are.
const ease = (u: number): number => u * u * (3 - 2 * u);
const drive = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const euler = (r: Xf): THREE.Quaternion =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(r[3] * D, r[4] * D, r[5] * D, 'XYZ'));

export interface Rig {
  apply(progress: number): void;
  resize(): void;
  probe(progress: number): { ndcX: number; ndcY: number; size: [number, number, number] };
  /** Part centres at a given progress. The test sweeps these to prove nothing floats free. */
  parts(progress: number): { n: string; x: number; y: number; z: number }[];
  dispose(): void;
}

declare global {
  interface Window {
    /** Test hook for the banner acceptance check; see MorphStage.astro. */
    __morph?: Rig;
  }
}

function build(stage: HTMLElement): Rig {
  const w = stage.clientWidth || 600;
  const h = stage.clientHeight || 520;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, w / h, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc6cfdb, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(6, 11, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const shadowCam = key.shadow.camera;
  shadowCam.left = -8; shadowCam.right = 8; shadowCam.top = 10; shadowCam.bottom = -3;
  shadowCam.near = 1; shadowCam.far = 40;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-7, 4, -5);
  scene.add(fill);

  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const body = new THREE.Group();
  scene.add(body);

  // a hairline with dashes, so "driving" is legible while the vehicle stays in frame
  const road = new THREE.Group();
  const roadMat = new THREE.MeshBasicMaterial({ color: HAIRLINE });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(60, 0.012, 0.02), roadMat);
  rail.position.y = 0.006;
  road.add(rail);
  const dashGeo = new THREE.BoxGeometry(0.5, 0.012, 0.02);
  for (let i = -22; i <= 22; i++) {
    const dash = new THREE.Mesh(dashGeo, roadMat);
    dash.position.set(i * 1.4, 0.006, 1.25);
    road.add(dash);
  }
  scene.add(road);

  const mat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.62, metalness: 0.05, flatShading: true });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xf5f7fa, transparent: true, opacity: 0.5 });

  const nodes = PARTS.map((p) => {
    const group = new THREE.Group();
    const geo = p.box
      ? new THREE.BoxGeometry(p.box[0], p.box[1], p.box[2])
      : new THREE.CylinderGeometry(p.cyl[0], p.cyl[0], p.cyl[1], 28);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    group.add(mesh);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));
    body.add(group);
    // Parts travel on a quadratic arc, not a straight line. The control point pulls each part
    // toward the body axis and a little up, so halfway through the machine folds into itself
    // instead of every part sliding through open space on its own line.
    const ctrl = new THREE.Vector3(
      ((p.car[0] + p.rob[0]) / 2) * 0.22,
      (p.car[1] + p.rob[1]) / 2 + 0.4,
      ((p.car[2] + p.rob[2]) / 2) * 0.55,
    );
    return {
      p, group, mesh, ctrl,
      a: new THREE.Vector3(p.car[0], p.car[1], p.car[2]),
      b: new THREE.Vector3(p.rob[0], p.rob[1], p.rob[2]),
      qa: euler(p.car), qb: euler(p.rob), spin: p.n.startsWith('wheel'),
    };
  });

  const bbox = new THREE.Box3();
  const bcenter = new THREE.Vector3();
  const bsize = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const corner = new THREE.Vector3();

  function frameCamera(progress: number): void {
    // frame whatever the machine currently is: fit its own bounding box
    bbox.setFromObject(body);
    bbox.getCenter(bcenter);
    bbox.getSize(bsize);
    const vfov = camera.fov * D;
    const dh = (bsize.y * 1.46) / (2 * Math.tan(vfov / 2));
    const dw = (Math.max(bsize.x, bsize.z) * 1.46) / (2 * Math.tan(vfov / 2) * camera.aspect);
    const dist = Math.max(dh, dw, 6);
    const e = ease(progress);
    dir.set(lerp(0.86, 0.46, e), lerp(0.44, 0.3, e), 1).normalize();
    camera.position.copy(bcenter).addScaledVector(dir, dist);
    camera.lookAt(bcenter);
    // one corrective pass: perspective makes the near corners bigger than the fit assumes
    camera.updateMatrixWorld();
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      corner
        .set(i & 1 ? bbox.max.x : bbox.min.x, i & 2 ? bbox.max.y : bbox.min.y, i & 4 ? bbox.max.z : bbox.min.z)
        .project(camera);
      worst = Math.max(worst, Math.abs(corner.x), Math.abs(corner.y));
    }
    if (worst > 0.88) {
      camera.position.copy(bcenter).addScaledVector(dir, dist * (worst / 0.88));
      camera.lookAt(bcenter);
    }
  }

  function apply(progress: number): void {
    const P = clamp(progress);
    for (const n of nodes) {
      const u = ease(clamp((P - n.p.s[0]) / (n.p.s[1] - n.p.s[0])));
      const k = 1 - u;
      n.group.position
        .copy(n.a).multiplyScalar(k * k)
        .addScaledVector(n.ctrl, 2 * k * u)
        .addScaledVector(n.b, u * u);
      n.group.quaternion.copy(n.qa).slerp(n.qb, u);
      if (n.spin) {
        const q = 1 - P;
        n.mesh.rotation.y = -q * 26 * Math.min(1, Math.max(0, (q - 0.5) / 0.3));
      }
    }
    // the road slides under it, so the vehicle drives without leaving the frame
    road.position.x = lerp(0, -12.6, drive(clamp((1 - P) / 0.72)));
    frameCamera(P);
    renderer.render(scene, camera);
  }

  function resize(): void {
    const ww = stage.clientWidth || 600;
    const hh = stage.clientHeight || 520;
    renderer.setSize(ww, hh);
    camera.aspect = ww / hh;
    camera.updateProjectionMatrix();
  }

  // the acceptance check from the banner spec: at t = 0.25 / 0.5 / 0.75 the machine must still be
  // one connected object inside the frame. ndcX/ndcY > 1 means a part has left the viewport.
  function probe(progress: number): { ndcX: number; ndcY: number; size: [number, number, number] } {
    apply(progress);
    bbox.setFromObject(body);
    let mx = 0;
    let my = 0;
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3(
        i & 1 ? bbox.max.x : bbox.min.x,
        i & 2 ? bbox.max.y : bbox.min.y,
        i & 4 ? bbox.max.z : bbox.min.z,
      ).project(camera);
      mx = Math.max(mx, Math.abs(v.x));
      my = Math.max(my, Math.abs(v.y));
    }
    bbox.getSize(bsize);
    return { ndcX: +mx.toFixed(2), ndcY: +my.toFixed(2), size: [+bsize.x.toFixed(2), +bsize.y.toFixed(2), +bsize.z.toFixed(2)] };
  }

  function parts(progress: number): { n: string; x: number; y: number; z: number }[] {
    apply(progress);
    return nodes.map((n) => ({ n: n.p.n, x: n.group.position.x, y: n.group.position.y, z: n.group.position.z }));
  }

  function dispose(): void {
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { apply, resize, probe, parts, dispose };
}

function markActiveRole(rows: readonly HTMLElement[]): void {
  if (rows.length === 0) return;
  const aim = window.innerHeight * 0.42;
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    const distance = Math.abs(box.top + box.height / 2 - aim);
    if (distance < bestDistance) { bestDistance = distance; best = row; }
  }
  for (const row of rows) row.dataset.on = String(row === best);
}

export function startMorph(stage: HTMLElement): Rig | null {
  let rig: Rig;
  try {
    rig = build(stage);
  } catch {
    return null; // no WebGL: the prose fallback in the stage stays visible
  }
  stage.classList.add('is-live');

  const roadmap = document.querySelector<HTMLElement>('[data-roadmap]');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-role]'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function progress(): number {
    if (!roadmap) return 1;
    const box = roadmap.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    // newest role sits at the top: present = humanoid, the further back, the more it is a vehicle
    return 1 - clamp((vh * 0.45 - box.top) / Math.max(1, box.height - vh * 0.55));
  }

  // under reduced motion the rig holds the humanoid end state at every scroll and resize; the
  // caption and the stage prose carry the same claim in text either way
  let queued = false;
  const frame = (): void => { queued = false; rig.apply(reduced ? 1 : progress()); markActiveRole(rows); };
  const kick = (): void => { if (!queued) { queued = true; requestAnimationFrame(frame); } };

  if (!reduced) window.addEventListener('scroll', kick, { passive: true });
  kick();
  window.addEventListener('resize', () => { rig.resize(); kick(); }, { passive: true });
  new ResizeObserver(() => { rig.resize(); kick(); }).observe(stage);
  return rig;
}
