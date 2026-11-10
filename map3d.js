// 3D regional map: each country is raised as tinted glass to a height that reflects its number of measures.
import { label } from "./network3d.js?v=pi-20261017";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Island states too small for the 110m outlines get a marker column instead (lon, lat).
const SMALL_STATES = { Bahrain: [50.55, 26.07] };
// Extra label height for small, tightly packed Gulf states so their labels stack instead of overlapping.
const LABEL_SHIFT = { "Saudi Arabia": -55, Qatar: -22, "United Arab Emirates": 42 };
const LABEL_LIFT = { Kuwait: 120, Bahrain: 78, Qatar: 40, "United Arab Emirates": 14 };

/**
 * countries = [{ name, short, count, color, feature | null }]. handlers = { onCountry(name), tooltip(country) }.
 * Returns { dispose() }.
 */
export function mountMap3D(host, countries, handlers) {
  const THREE = window.THREE;
  const width = host.clientWidth || 640, height = host.clientHeight || 380;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 1, 4000);
  camera.position.set(0, 300, width < 520 ? 560 : 440);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 30, 10);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 260, maxDistance: 780, maxPolarAngle: 1.2, minPolarAngle: .25, autoRotate: !reduceMotion(), autoRotateSpeed: .35, rotateSpeed: .55 });

  scene.add(new THREE.AmbientLight(0xa9c7dc, .6));
  const key = new THREE.DirectionalLight(0xffffff, .9); key.position.set(180, 420, 260); scene.add(key);
  const rim = new THREE.PointLight(0x6cb9ee, 1.1, 1600); rim.position.set(-320, 160, -260); scene.add(rim);
  const warm = new THREE.PointLight(0xe2b84f, .7, 1400); warm.position.set(300, 80, -300); scene.add(warm);

  // Project lon/lat into a 420-unit square centred on the origin.
  const geo = { type: "FeatureCollection", features: countries.filter((country) => country.feature).map((country) => country.feature) };
  const projection = d3.geoMercator().fitExtent([[-210, -210], [210, 210]], geo);
  const toXY = ([lon, lat]) => { const [x, y] = projection([lon, lat]); return new THREE.Vector2(x, -y); };

  // Glass floor with a faint grid
  const floor = new THREE.Mesh(new THREE.CircleGeometry(300, 64), new THREE.MeshBasicMaterial({ color: 0x0f2c42, transparent: true, opacity: .45, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.5; scene.add(floor);
  const grid = new THREE.GridHelper(600, 30, 0x2a6f9a, 0x1a4560);
  grid.material.transparent = true; grid.material.opacity = .22; scene.add(grid);

  const maxCount = Math.max(1, ...countries.map((country) => country.count));
  const heightOf = (count) => 6 + Math.sqrt(count / maxCount) * 74;
  const pickable = [], meshes = new Map();
  const centroid = (feature) => toXY(d3.geoCentroid(feature));

  countries.forEach((country) => {
    const depth = heightOf(country.count);
    const color = new THREE.Color(country.color);
    const material = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: .22, metalness: .1, roughness: .15, transparent: true, opacity: .78, clearcoat: 1, clearcoatRoughness: .1 });
    const group = new THREE.Group();
    let anchor;
    if (country.feature) {
      const polygons = country.feature.geometry.type === "Polygon" ? [country.feature.geometry.coordinates] : country.feature.geometry.coordinates;
      polygons.forEach((rings) => {
        const shape = new THREE.Shape(rings[0].map(toXY));
        rings.slice(1).forEach((hole) => shape.holes.push(new THREE.Path(hole.map(toXY))));
        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 1.2, bevelSize: .8, bevelSegments: 2 });
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { name: country.name };
        group.add(mesh); pickable.push(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
        group.add(edges);
      });
      anchor = centroid(country.feature);
    } else if (SMALL_STATES[country.name]) {
      anchor = toXY(SMALL_STATES[country.name]);
      const geometry = new THREE.CylinderGeometry(5, 5, depth, 32);
      geometry.translate(anchor.x, depth / 2, -anchor.y);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { name: country.name };
      group.add(mesh); pickable.push(mesh);
    } else return;
    const text = label(THREE, `${country.short} · ${country.count.toLocaleString()}`, { color: "#ffffff", weight: 700, screen: .05, accent: `#${color.getHexString()}` });
    const lift = depth + 16 + (LABEL_LIFT[country.name] || 0);
    // Large Saudi Arabia shifts its label west; Qatar and the UAE spread apart on the crowded Gulf coast.
    const labelX = anchor.x + (LABEL_SHIFT[country.name] || 0);
    text.position.set(labelX, lift, -anchor.y);
    group.add(text);
    // Thin leader line from the country top to its label
    const leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(anchor.x, depth + 1, -anchor.y), new THREE.Vector3(anchor.x, lift - 6, -anchor.y)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, depthWrite: false }));
    group.add(leader);
    scene.add(group);
    meshes.set(country.name, { material, group });
  });

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
    return raycaster.intersectObjects(pickable)[0]?.object?.userData.name || null;
  };
  const highlight = (name) => meshes.forEach((entry, country) => { entry.material.emissiveIntensity = country === name ? .6 : .22; entry.material.opacity = name && country !== name ? .6 : .82; });
  const onMove = (event) => {
    const name = pick(event);
    if (name !== hovered) { hovered = name; highlight(name); }
    renderer.domElement.style.cursor = name ? "pointer" : "grab";
    if (!name) { tooltip.hidden = true; return; }
    const rect = host.getBoundingClientRect();
    tooltip.innerHTML = handlers.tooltip(name);
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(rect.width - 220, event.clientX - rect.left + 14)}px`;
    tooltip.style.top = `${event.clientY - rect.top + 14}px`;
  };
  const onDown = (event) => { downAt = [event.clientX, event.clientY]; controls.autoRotate = false; clearTimeout(resumeTimer); };
  const onUp = (event) => {
    if (!reduceMotion()) resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 4000);
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
    const name = pick(event);
    if (name) handlers.onCountry(name);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointerleave", () => { tooltip.hidden = true; hovered = null; highlight(null); });

  const resizeObserver = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); });
  resizeObserver.observe(host);

  let frame, running = true, disposed = false;
  const tick = () => {
    if (!running) return;
    if (!host.isConnected) { api.dispose(); return; }
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  const visibility = () => { if (disposed) return; if (document.hidden) { running = false; cancelAnimationFrame(frame); } else if (!running && host.isConnected) { running = true; tick(); } };
  document.addEventListener("visibilitychange", visibility);
  const api = {
    dispose() {
      if (disposed) return;
      disposed = true; running = false; cancelAnimationFrame(frame); clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", visibility); resizeObserver.disconnect(); controls.dispose();
      scene.traverse((object) => { object.geometry?.dispose?.(); if (object.material) { object.material.map?.dispose?.(); object.material.dispose?.(); } });
      renderer.dispose(); renderer.domElement.remove(); tooltip.remove();
    },
  };
  tick();
  return api;
}
