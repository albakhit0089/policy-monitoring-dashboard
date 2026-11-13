// Overview opening scene: a tilted 3D view of the Arabian Peninsula for orientation. Countries are flat
// (one uniform height) and shaded by recent policy activity; there are no extruded bars encoding values.
// Shipping lanes through the Strait of Hormuz and Bab el-Mandeb and the main ports give geographic context.
// Three.js loads only when this scene is shown.

const COUNTRY_CODES = { Bahrain: "048", Kuwait: "414", Oman: "512", Qatar: "634", "Saudi Arabia": "682", "United Arab Emirates": "784", Yemen: "887" };
// Neighbours drawn in grey so the straits and seas read correctly.
const NEIGHBOURS = ["364", "368", "400", "818", "729", "232", "231", "262", "706", "376", "760", "422", "586", "275"];
// Main ports (longitude, latitude).
export const PORTS = [
  ["Jebel Ali", "United Arab Emirates", 55.06, 25.01], ["Khalifa Port", "United Arab Emirates", 54.65, 24.81], ["Fujairah", "United Arab Emirates", 56.36, 25.17], ["Khor Fakkan", "United Arab Emirates", 56.36, 25.34],
  ["Sohar", "Oman", 56.62, 24.48], ["Duqm", "Oman", 57.70, 19.67], ["Salalah", "Oman", 54.00, 16.94],
  ["Jeddah", "Saudi Arabia", 39.17, 21.48], ["Dammam", "Saudi Arabia", 50.20, 26.50], ["Hamad Port", "Qatar", 51.60, 25.01],
  ["Shuaiba", "Kuwait", 48.16, 29.04], ["Khalifa bin Salman Port", "Bahrain", 50.71, 26.20], ["Aden", "Yemen", 44.98, 12.79], ["Hodeidah", "Yemen", 42.93, 14.83],
];
// Schematic shipping lanes (not navigational data): the Gulf through Hormuz, and the Red Sea through Bab el-Mandeb.
const ROUTES = [
  [[48.4, 29.0], [49.8, 27.7], [51.3, 26.9], [53.6, 26.3], [55.4, 26.3], [56.4, 26.5], [57.3, 25.6], [58.6, 24.2], [60.2, 22.4], [62.5, 19.5]],
  [[32.6, 29.7], [33.9, 27.6], [35.6, 25.4], [37.4, 22.9], [39.0, 20.4], [40.6, 17.6], [42.1, 15.0], [43.4, 12.6], [45.2, 12.1], [48.5, 12.5], [52.0, 13.2], [56.0, 14.6], [62.5, 16.5]],
  [[54.0, 16.6], [56.4, 17.6], [57.9, 19.6], [59.6, 21.9], [59.0, 23.5], [57.8, 24.6], [56.9, 25.3]],
];
const STRAITS = [["Strait of Hormuz", 56.45, 26.55], ["Bab el-Mandeb", 43.4, 12.55]];
const SEAS = [["Arabian Gulf", 52.7, 27.95], ["Red Sea", 37.6, 21.6], ["Arabian Sea", 60.5, 16.5], ["Gulf of Aden", 48.0, 12.9]];
// Small offsets keep the Gulf states' labels from overlapping (x east, z south, in scene units).
const LABEL_OFFSET = { Bahrain: [-8, -16], Qatar: [6, 10], Kuwait: [0, -8], "United Arab Emirates": [12, 6] };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function webglAvailable() {
  try { const canvas = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))); } catch { return false; }
}
let threePromise = null;
function loadScript(src) { return new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${src}`)); document.head.append(script); }); }
export function loadThree() {
  threePromise ||= (window.THREE ? Promise.resolve() : loadScript("./assets/vendor/three.min.js")).then(() => window.THREE.OrbitControls ? null : loadScript("./assets/vendor/OrbitControls.js")).catch((error) => { threePromise = null; throw error; });
  return threePromise;
}

function textSprite(THREE, text, { color = "#21455c", size = 30, weight = 600, background = "rgba(255,255,255,.85)", screen = .03 } = {}) {
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  const font = `${weight} ${size * 2}px "IBM Plex Sans", Arial, sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + size * 1.4, height = size * 2.8;
  canvas.width = width; canvas.height = height;
  ctx.font = font;
  if (background) { ctx.fillStyle = background; const r = height / 2.4; ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(width, 0, width, height, r); ctx.arcTo(width, height, 0, height, r); ctx.arcTo(0, height, 0, 0, r); ctx.arcTo(0, 0, width, 0, r); ctx.fill(); }
  ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.scale.set(screen * width / height, screen, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Mounts the scene into `host`. activity = { [country]: measures in the last 12 months }.
 * handlers = { onCountry(name), tooltip(name) -> html }. Returns { dispose() }.
 */
export function mountScene(host, { topology, activity, handlers }) {
  const THREE = window.THREE;
  const width = host.clientWidth || 900, height = host.clientHeight || 420;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 1, 5000);
  const home = new THREE.Vector3(0, 430, width < 600 ? 520 : 360);
  camera.position.copy(home);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 25);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 260, maxDistance: 900, minPolarAngle: .35, maxPolarAngle: 1.05, rotateSpeed: .45, minAzimuthAngle: -.6, maxAzimuthAngle: .6 });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d8e2, .95));
  const sun = new THREE.DirectionalLight(0xffffff, .55); sun.position.set(-200, 500, 300); scene.add(sun);

  // Projection: the region from 31°E to 63°E and 9°N to 33°N, fitted to the scene.
  // Corner points, not a polygon: a spherical polygon's winding would decide which side is "inside".
  const region = { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[31, 9], [63, 9], [63, 33], [31, 33]] } };
  const projection = d3.geoMercator().fitExtent([[-330, -230], [330, 230]], region);
  const toXZ = ([lon, lat]) => { const [x, y] = projection([lon, lat]); return new THREE.Vector2(x, y); };
  const at = (lon, lat, y = 0) => { const p = toXZ([lon, lat]); return new THREE.Vector3(p.x, y, p.y); };

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1200), new THREE.MeshBasicMaterial({ color: 0xd7e8f1 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.5; scene.add(sea);

  const features = topojson.feature(topology, topology.objects.countries).features;
  const max = Math.max(1, ...Object.values(activity));
  const shade = d3.scaleSequential([0, max], (t) => d3.interpolateBlues(.25 + t * .65));
  const pickable = [], countryMeshes = new Map();
  const shapeMeshes = (feature, material, depth) => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.map((rings) => {
      const shape = new THREE.Shape(rings[0].map(toXZ));
      rings.slice(1).forEach((hole) => shape.holes.push(new THREE.Path(hole.map(toXZ))));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geometry.rotateX(Math.PI / 2); // shape y (south) becomes +z; extrusion goes downward
      geometry.translate(0, depth, 0);
      return new THREE.Mesh(geometry, material);
    });
  };
  features.forEach((feature) => {
    const id = String(feature.id).padStart(3, "0");
    const country = Object.keys(COUNTRY_CODES).find((name) => COUNTRY_CODES[name] === id);
    if (country) {
      // Every country has the same height: colour, not height, carries the activity level.
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(activity[country] || 0)), roughness: .75, metalness: 0 });
      const meshes = shapeMeshes(feature, material, 4);
      meshes.forEach((mesh) => { mesh.userData = { country }; pickable.push(mesh); scene.add(mesh); });
      const outline = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 });
      meshes.forEach((mesh) => scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 40), outline)));
      countryMeshes.set(country, { material, base: material.color.clone(), centroid: d3.geoCentroid(feature) });
    } else if (NEIGHBOURS.includes(id)) {
      shapeMeshes(feature, new THREE.MeshStandardMaterial({ color: 0xe4e9ec, roughness: .9 }), 1.5).forEach((mesh) => scene.add(mesh));
    }
  });
  // Bahrain is too small for the 1:110m outlines: a disc marks it.
  if (!countryMeshes.has("Bahrain")) {
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(activity.Bahrain || 0)), roughness: .75 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 4, 28), material);
    disc.position.copy(at(50.55, 26.05, 2)); disc.userData = { country: "Bahrain" }; scene.add(disc); pickable.push(disc);
    countryMeshes.set("Bahrain", { material, base: material.color.clone(), centroid: [50.55, 26.05] });
  }
  countryMeshes.forEach((entry, country) => {
    const label = textSprite(THREE, country === "United Arab Emirates" ? "UAE" : country, { color: "#102f46", weight: 700, screen: .036 });
    const [dx, dz] = LABEL_OFFSET[country] || [0, 0];
    label.position.copy(at(...entry.centroid, 16)).add(new THREE.Vector3(dx, 0, dz));
    scene.add(label);
  });
  STRAITS.forEach(([name, lon, lat]) => { const label = textSprite(THREE, name, { color: "#8a5f17", weight: 700, background: "rgba(255,248,232,.92)", screen: .03 }); label.position.copy(at(lon, lat, 14)); scene.add(label); });
  SEAS.forEach(([name, lon, lat]) => { const label = textSprite(THREE, name, { color: "#4f7a94", weight: 500, background: null, screen: .026 }); label.position.copy(at(lon, lat, 2)); scene.add(label); });

  // Shipping lanes and moving vessels.
  const lanes = ROUTES.map((route) => {
    const curve = new THREE.CatmullRomCurve3(route.map(([lon, lat]) => at(lon, lat, 1.2)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)), new THREE.LineDashedMaterial({ color: 0x116aab, dashSize: 4, gapSize: 3, transparent: true, opacity: .75 }));
    line.computeLineDistances(); scene.add(line);
    const ships = [0, .33, .66].map((offset) => { const ship = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0f4f80 })); scene.add(ship); return { ship, offset }; });
    return { curve, ships };
  });
  const placeShips = (t) => lanes.forEach(({ curve, ships }) => ships.forEach(({ ship, offset }) => ship.position.copy(curve.getPointAt((t + offset) % 1))));
  placeShips(0);
  // Ports: gold markers, named on hover.
  PORTS.forEach(([name, country, lon, lat]) => {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 6, 16), new THREE.MeshStandardMaterial({ color: 0xb7852f, roughness: .4 }));
    marker.position.copy(at(lon, lat, 5)); marker.userData = { port: name, country }; scene.add(marker); pickable.push(marker);
  });

  // Hover, click and camera move.
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const tooltip = document.createElement("div"); tooltip.className = "map-scene-tooltip"; tooltip.hidden = true; host.append(tooltip);
  let hovered = null, downAt = null, flight = null;
  const pick = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickable)[0]?.object?.userData || null;
  };
  const highlight = (country) => countryMeshes.forEach((entry, name) => entry.material.color.copy(entry.base).lerp(new THREE.Color(country && name === country ? 0x0b4f80 : 0xffffff), country ? (name === country ? .35 : .35) : 0));
  const onMove = (event) => {
    const hit = pick(event);
    const key = hit?.country || null;
    if (key !== hovered) { hovered = key; highlight(hit?.port ? null : key); }
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (!hit) { tooltip.hidden = true; return; }
    const rect = host.getBoundingClientRect();
    tooltip.innerHTML = hit.port ? `<strong>${hit.port}</strong><span>Port · ${hit.country === "United Arab Emirates" ? "UAE" : hit.country}</span>` : handlers.tooltip(hit.country);
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(rect.width - 230, event.clientX - rect.left + 14)}px`;
    tooltip.style.top = `${event.clientY - rect.top + 14}px`;
  };
  const flyTo = (country) => {
    const entry = countryMeshes.get(country);
    const target = at(...entry.centroid, 0);
    if (reducedMotion()) { handlers.onCountry(country); return; }
    flight = { start: performance.now(), duration: 850, fromPos: camera.position.clone(), toPos: target.clone().add(new THREE.Vector3(0, 170, 150)), fromTarget: controls.target.clone(), toTarget: target, country };
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", () => { tooltip.hidden = true; hovered = null; highlight(null); });
  renderer.domElement.addEventListener("pointerdown", (event) => { downAt = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
    const hit = pick(event);
    if (hit?.country && !hit.port) flyTo(hit.country);
  });
  const resize = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); });
  resize.observe(host);

  let frame, disposed = false, running = true;
  const animateShips = !reducedMotion();
  const tick = (now) => {
    if (!running) return;
    if (!host.isConnected) { api.dispose(); return; }
    if (animateShips) placeShips((now / 60000) % 1);
    if (flight) {
      const k = Math.min(1, (now - flight.start) / flight.duration), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
      if (k === 1) { const country = flight.country; flight = null; handlers.onCountry(country); }
    }
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  const visibility = () => { if (disposed) return; if (document.hidden) { running = false; cancelAnimationFrame(frame); } else if (!running) { running = true; frame = requestAnimationFrame(tick); } };
  document.addEventListener("visibilitychange", visibility);
  const api = {
    reset() { flight = null; camera.position.copy(home); controls.target.set(0, 0, 25); },
    dispose() {
      if (disposed) return;
      disposed = true; running = false; cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility); resize.disconnect(); controls.dispose();
      scene.traverse((object) => { object.geometry?.dispose?.(); if (object.material) { object.material.map?.dispose?.(); object.material.dispose?.(); } });
      renderer.dispose(); renderer.domElement.remove(); tooltip.remove();
    },
  };
  frame = requestAnimationFrame(tick);
  return api;
}
