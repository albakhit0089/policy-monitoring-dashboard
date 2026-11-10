// 3D policy network: countries on a glowing inner ring, linked items on a surrounding sphere.
// Three.js is loaded on demand so other pages stay light.

const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const CONTROLS_URL = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}
export function loadThree() {
  loading ||= (window.THREE ? Promise.resolve() : loadScript(THREE_URL)).then(() => window.THREE.OrbitControls ? null : loadScript(CONTROLS_URL)).catch((error) => { loading = null; throw error; });
  return loading;
}
export function webglAvailable() {
  try { const canvas = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))); } catch { return false; }
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let glowTexture = null;
function glow(THREE) {
  if (glowTexture) return glowTexture;
  const size = 128, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d"), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.25, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}
// Text label drawn at 2x resolution on a dark glass pill so it stays legible over bright nodes and links.
// screen = label height as a fraction of the viewport height (constant on screen, not shrinking with distance).
export function label(THREE, text, { color = "#eef4f8", size = 30, weight = 600, accent = null, screen = .036 } = {}) {
  const ratio = 2, canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  const font = `${weight} ${size * ratio}px "IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif`;
  ctx.font = font;
  const padX = 16 * ratio, padY = 9 * ratio;
  const width = Math.ceil(ctx.measureText(text).width) + padX * 2, height = size * ratio + padY * 2;
  canvas.width = width; canvas.height = height;
  const r = height / 2;
  ctx.beginPath(); ctx.moveTo(r, 1); ctx.arcTo(width - 1, 1, width - 1, height - 1, r); ctx.arcTo(width - 1, height - 1, 1, height - 1, r); ctx.arcTo(1, height - 1, 1, 1, r); ctx.arcTo(1, 1, width - 1, 1, r); ctx.closePath();
  ctx.fillStyle = "rgba(6,22,36,.78)"; ctx.fill();
  ctx.lineWidth = 2 * ratio; ctx.strokeStyle = accent || "rgba(255,255,255,.22)"; ctx.stroke();
  ctx.font = font; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  ctx.fillText(text, padX, height / 2 + ratio);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  sprite.renderOrder = 10;
  sprite.scale.set(screen * width / height, screen, 1);
  return sprite;
}
// Evenly spread points on a sphere (Fibonacci lattice).
function spherePoint(i, n, radius) {
  const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), theta = Math.PI * (3 - Math.sqrt(5)) * i;
  return [Math.cos(theta) * r * radius, y * radius * .78, Math.sin(theta) * r * radius];
}

/**
 * Mount the scene. graph = { centers: [{ id, name, color, size }], items: [{ id, name, count, selected }],
 * links: [{ from, to, value }] }. handlers = { onItem(name), onCenter(name), tooltip(node) }.
 * Returns { select(name), dispose() }.
 */
export function mountNetwork3D(host, graph, handlers) {
  const THREE = window.THREE;
  const width = host.clientWidth || 800, height = host.clientHeight || 560;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1f30, .0016);
  const camera = new THREE.PerspectiveCamera(48, width / height, 1, 4000);
  // Narrow screens need the camera further back so the whole sphere fits.
  camera.position.set(0, 340, width < 560 ? 760 : 540);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 220, maxDistance: 900, autoRotate: !reduceMotion(), autoRotateSpeed: .55, rotateSpeed: .6 });

  scene.add(new THREE.AmbientLight(0x9fc4dc, .55));
  const key = new THREE.PointLight(0x6cb9ee, 1.4, 1400); key.position.set(180, 260, 300); scene.add(key);
  const warm = new THREE.PointLight(0xe2b84f, .9, 1200); warm.position.set(-260, -120, -200); scene.add(warm);

  // Faint star dust for depth
  const dust = new THREE.BufferGeometry(), dustCount = 420, positions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) { const r = 380 + Math.random() * 520, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); positions.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * .6, r * Math.sin(p) * Math.sin(t)], i * 3); }
  dust.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(dust, new THREE.PointsMaterial({ color: 0x9fc4dc, size: 1.6, transparent: true, opacity: .45, depthWrite: false })));

  // Orbit guide rings
  const ring = (radius, color, opacity) => { const geometry = new THREE.RingGeometry(radius - .6, radius + .6, 160); const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })); mesh.rotation.x = Math.PI / 2; scene.add(mesh); return mesh; };
  ring(graph.centers.length > 1 ? 140 : 36, 0xe2b84f, .4);
  ring(255, 0x6cb9ee, .12);

  const pickable = [], nodes = new Map();
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  function addNode(id, name, color, radius, position, kind, labelColor) {
    const group = new THREE.Group();
    group.position.set(...position);
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, metalness: .25, roughness: .3 });
    const mesh = new THREE.Mesh(sphereGeo, material);
    mesh.scale.setScalar(radius);
    mesh.userData = { id, name, kind };
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(THREE), color, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(radius * 5.2);
    const text = kind === "center"
      ? label(THREE, name, { color: "#ffffff", weight: 700, screen: .04, accent: `#${new THREE.Color(color).getHexString()}` })
      : label(THREE, name.length > 30 ? `${name.slice(0, 29)}…` : name, { color: labelColor, screen: .031 });
    text.position.set(0, radius + 5, 0);
    group.add(halo, mesh, text);
    scene.add(group);
    pickable.push(mesh);
    nodes.set(id, { group, mesh, halo, material, color: new THREE.Color(color), radius, kind, name });
    return group;
  }

  const centerRadius = graph.centers.length > 1 ? 140 : 0;
  graph.centers.forEach((center, i) => {
    const angle = (i / graph.centers.length) * Math.PI * 2;
    addNode(center.id, center.name, center.color, center.size, [Math.cos(angle) * centerRadius, 0, Math.sin(angle) * centerRadius], "center", "#ffffff");
  });
  const maxCount = Math.max(1, ...graph.items.map((item) => item.count));
  graph.items.forEach((item, i) => addNode(item.id, item.name, 0x5aaee8, 4 + Math.sqrt(item.count / maxCount) * 8, spherePoint(i, graph.items.length, 255), "item", "#eef4f8"));

  // Curved links with brightness by weight
  const maxValue = Math.max(1, ...graph.links.map((link) => link.value));
  const linkObjects = graph.links.map((link) => {
    const a = nodes.get(link.from).group.position, b = nodes.get(link.to).group.position;
    const mid = a.clone().add(b).multiplyScalar(.5);
    mid.add(mid.clone().normalize().multiplyScalar(26)).y += 14;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
    const strength = .12 + .6 * (link.value / maxValue);
    const material = new THREE.LineBasicMaterial({ color: 0x6cb9ee, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    return { ...link, line, material, base: strength };
  });

  let selectedId = graph.items.find((item) => item.selected)?.id ?? null;
  function paint() {
    nodes.forEach((node, id) => {
      const isSelected = id === selectedId;
      const color = node.kind === "item" && isSelected ? new THREE.Color(0xe2b84f) : node.color;
      node.material.color.copy(color); node.material.emissive.copy(color);
      node.material.emissiveIntensity = isSelected ? .9 : .35;
      node.halo.material.color.copy(color);
      node.halo.material.opacity = isSelected ? .95 : .5;
    });
    linkObjects.forEach((link) => {
      const active = link.to === selectedId;
      link.material.color.set(active ? 0xe2b84f : 0x6cb9ee);
      link.material.opacity = selectedId ? (active ? Math.min(1, link.base + .45) : link.base * .45) : link.base;
    });
  }
  paint();

  // Hover and click
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const tooltip = document.createElement("div");
  tooltip.className = "pn3d-tooltip"; tooltip.hidden = true;
  host.append(tooltip);
  let hovered = null, downAt = null, resumeTimer;
  const pick = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickable)[0]?.object || null;
  };
  const onMove = (event) => {
    const hit = pick(event);
    if (hovered && hovered !== hit) hovered.scale.setScalar(nodes.get(hovered.userData.id).radius);
    hovered = hit;
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (!hit) { tooltip.hidden = true; return; }
    hit.scale.setScalar(nodes.get(hit.userData.id).radius * 1.25);
    const rect = host.getBoundingClientRect();
    tooltip.innerHTML = handlers.tooltip(hit.userData);
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(rect.width - 220, event.clientX - rect.left + 14)}px`;
    tooltip.style.top = `${event.clientY - rect.top + 14}px`;
  };
  const onDown = (event) => { downAt = [event.clientX, event.clientY]; controls.autoRotate = false; clearTimeout(resumeTimer); };
  const onUp = (event) => {
    if (!reduceMotion()) resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 4000);
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return; // a drag, not a click
    const hit = pick(event);
    if (!hit) return;
    if (hit.userData.kind === "item") { selectedId = hit.userData.id; paint(); handlers.onItem(hit.userData.name); }
    else handlers.onCenter(hit.userData.name);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointerleave", () => { tooltip.hidden = true; });

  const onResize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(host);

  let frame, running = true;
  const clock = new THREE.Clock();
  const tick = () => {
    if (!running) return;
    if (!host.isConnected) { api.dispose(); return; } // page changed: stop and free the GPU
    const t = clock.getElapsedTime();
    // Gentle breathing on the selected node
    const selected = selectedId && nodes.get(selectedId);
    if (selected && !reduceMotion()) selected.halo.scale.setScalar(selected.radius * (5.4 + Math.sin(t * 2.4) * .8));
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  // Pause rendering when the tab is hidden
  let disposed = false;
  const visibility = () => { if (disposed) return; if (document.hidden) { running = false; cancelAnimationFrame(frame); } else if (!running && host.isConnected) { running = true; tick(); } };
  document.addEventListener("visibilitychange", visibility);

  const api = {
    select(name) { const node = [...nodes.entries()].find(([, value]) => value.kind === "item" && value.name === name); selectedId = node ? node[0] : null; paint(); },
    dispose() {
      if (disposed) return;
      disposed = true; running = false; cancelAnimationFrame(frame); clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", visibility); resizeObserver.disconnect(); controls.dispose();
      scene.traverse((object) => { object.geometry?.dispose?.(); if (object.material) { object.material.map?.dispose?.(); object.material.dispose?.(); } });
      renderer.dispose(); renderer.domElement.remove(); tooltip.remove();
      glowTexture = null; // disposed with the scene; the next mount recreates it
    },
  };
  tick();
  return api;
}
