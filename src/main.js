import * as THREE from 'three';
import './style.css';
import { depositLoot, EXTRACTION_TARGET, lootResetState, movementSpeed, shouldWarnWhisker } from './gameRules.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x131610);
scene.fog = new THREE.FogExp2(0x151811, 0.027);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.08, 65);
camera.position.set(0, 1.66, 8.2);
scene.add(camera);

const paws = new THREE.Group();
camera.add(paws);
function makePlayerPaw(x) {
  const paw = new THREE.Group(); paw.position.set(x, -.55, -.76); paws.add(paw);
  const fur = new THREE.MeshStandardMaterial({ color: 0xe9e2d1, roughness: .92 });
  const beans = new THREE.MeshStandardMaterial({ color: 0xb97478, roughness: .78 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(.19, 14, 10), fur); palm.scale.set(1, .72, 1.16); palm.castShadow = false; paw.add(palm);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 8), beans); pad.scale.set(1.12, 1, .34); pad.position.set(0, .008, -.195); paw.add(pad);
  for (const toeX of [-.105, -.035, .035, .105]) {
    const toe = new THREE.Mesh(new THREE.SphereGeometry(.043, 10, 8), beans); toe.scale.z = .4; toe.position.set(toeX, .102, -.174); paw.add(toe);
  }
  return paw;
}
const leftPaw = makePlayerPaw(-.31);
const rightPaw = makePlayerPaw(.31);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const colliders = [];
const loot = [];
const monsters = [];
const keys = new Set();
const state = { running: false, locked: false, score: 0, time: 180, lives: 3, carried: null, toastTimer: 0, damageCooldown: 0, bob: 0 };

const ui = {
  score: document.querySelector('#score'), progress: document.querySelector('#score-progress'), carrying: document.querySelector('#carrying'), timer: document.querySelector('#timer'),
  lives: document.querySelector('#lives'), prompt: document.querySelector('#prompt'), toast: document.querySelector('#toast'),
  overlay: document.querySelector('#overlay'), title: document.querySelector('#overlay-title'), copy: document.querySelector('#overlay-copy'),
  button: document.querySelector('#start-button'),
};

const mat = (color, roughness = 0.82, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const floorMat = mat(0x45473a);
const wallMat = mat(0x777463);
const shelfMat = mat(0x333832, 0.68, 0.18);
const trimMat = mat(0xaaa58c, 0.65, 0.12);
const neonMat = new THREE.MeshStandardMaterial({ color: 0xc8ee74, emissive: 0x6d9a32, emissiveIntensity: 1.2 });
const labelMat = new THREE.MeshBasicMaterial({ color: 0xd5dfad });

function box(parent, position, size, material, cast = true, receive = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); return mesh;
}
function addCollider(x, z, w, d, padding = 0) { colliders.push({ minX: x - w / 2 - padding, maxX: x + w / 2 + padding, minZ: z - d / 2 - padding, maxZ: z + d / 2 + padding }); }

function makeRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; floor.receiveShadow = true; scene.add(floor);
  const tile = new THREE.GridHelper(26, 26, 0x666657, 0x565649); tile.position.y = 0.005; tile.material.transparent = true; tile.material.opacity = 0.24; scene.add(tile);
  box(scene, [0, 1.65, -10], [26, 3.3, 0.35], wallMat);
  box(scene, [0, 1.65, 10], [26, 3.3, 0.35], wallMat);
  box(scene, [-13, 1.65, 0], [0.35, 3.3, 20], wallMat);
  box(scene, [13, 1.65, 0], [0.35, 3.3, 20], wallMat);
  box(scene, [0, 3.35, 0], [26, 0.25, 20], mat(0x292c25));

  for (const x of [-4.4, 0, 4.4]) {
    const z = -0.2, width = 1.55, depth = 10.2;
    box(scene, [x, 0.38, z], [width, 0.18, depth], shelfMat);
    for (const side of [-1, 1]) {
      box(scene, [x + side * width / 2, 1.05, z], [0.12, 2.0, depth], shelfMat);
      box(scene, [x + side * width / 2, 2.05, z], [0.14, 0.12, depth], trimMat, false);
      box(scene, [x + side * width / 2, 0.65, z], [0.14, 0.1, depth], trimMat, false);
      for (const shelfY of [0.85, 1.45]) box(scene, [x + side * width / 2, shelfY, z], [0.13, 0.075, depth], trimMat, false);
    }
    addCollider(x, z, width, depth, 0.05);
    for (let row = 0; row < 3; row++) for (let side of [-1, 1]) {
      const color = [0x9b654e, 0x71805d, 0xc4a85d, 0x768a91][(row + Math.round(x) + (side > 0 ? 1 : 0) + 8) % 4];
      const product = box(scene, [x + side * 0.39, 0.7 + row * 0.39, z - 3.4 + row * 1.45], [0.31, 0.29, 0.34], mat(color), false);
      product.rotation.y = (row % 2) * 0.16;
    }
  }

  // Checkout island at the front-side of the store; leaves the center lane open.
  box(scene, [-9.2, 0.53, 5.2], [4.6, 1.05, 1.7], mat(0x554c3c));
  box(scene, [-9.2, 1.1, 5.2], [4.7, 0.14, 1.78], trimMat);
  box(scene, [-10.6, 1.22, 5.2], [0.55, 0.12, 0.5], mat(0x191d18));
  addCollider(-9.2, 5.2, 4.6, 1.7, 0.08);

  // Refrigerated cabinets along the far wall.
  for (const x of [-9, -6.6, 6.6, 9]) {
    box(scene, [x, 1.2, -8.65], [2.0, 2.4, 1.5], mat(0x313b3b, 0.38, 0.18));
    box(scene, [x, 1.25, -7.88], [1.78, 1.9, 0.06], new THREE.MeshStandardMaterial({ color: 0x52676a, metalness: 0.4, roughness: 0.2, transparent: true, opacity: 0.35 }));
    box(scene, [x - 0.6, 1.2, -7.82], [0.04, 1.65, 0.03], neonMat, false);
  }

  // Fluorescent ceiling panels and pool lights.
  for (const x of [-8, 0, 8]) for (const z of [-6.5, 0, 6.3]) {
    box(scene, [x, 3.19, z], [2.5, 0.045, 0.65], new THREE.MeshBasicMaterial({ color: 0xc9d7aa }), false);
    const light = new THREE.PointLight(0xc9d7aa, 23, 9, 2.0); light.position.set(x, 3.0, z); scene.add(light);
  }

  // Exit doorway and illuminated marker.
  box(scene, [0, 1.15, -9.72], [2.3, 2.3, 0.12], mat(0x263a29));
  box(scene, [0, 0.95, -9.62], [1.55, 1.85, 0.11], neonMat, false);
  box(scene, [0, 2.35, -9.52], [2.6, 0.18, 0.35], neonMat, false);
  const exitLight = new THREE.PointLight(0x8eff8a, 2.8, 7); exitLight.position.set(0, 2.2, -8.7); scene.add(exitLight);
}

const photoTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/grumpy-cat-meme.png`);
photoTexture.colorSpace = THREE.SRGBColorSpace;
const photoMaterial = new THREE.MeshBasicMaterial({ map: photoTexture, side: THREE.DoubleSide });

function makeCat(name, x, z, kind) {
  const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
  const fur = mat(kind === 'whisker' ? 0xe3dfd0 : 0xb56d4f, 0.92);
  const dark = mat(0x29251e); const pink = mat(0xc37d76);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.47, 16, 12), fur); body.position.set(0, 0.55, 0); body.scale.set(1.24, 0.86, 1.42); body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 16), fur); head.position.set(0, 1.05, 0.48); head.castShadow = true; group.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.48, 4), fur); ear.position.set(s * 0.32, 1.43, 0.48); ear.rotation.z = -s * 0.16; ear.castShadow = true; group.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 4), pink); inner.position.set(s * 0.32, 1.47, 0.53); inner.rotation.z = -s * 0.16; group.add(inner);
  }
  if (kind === 'whisker') {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.61, 0.56), photoMaterial);
    face.position.set(0, 1.03, 0.91); group.add(face);
  } else {
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), mat(0xffda76)); eye.position.set(s * 0.16, 1.12, 0.88); group.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 8), dark); pupil.position.set(s * 0.16, 1.12, 0.932); group.add(pupil);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 3), pink); nose.position.set(0, 0.98, 0.91); nose.rotation.x = Math.PI / 2; group.add(nose);
  }
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .52, -.55), new THREE.Vector3(.28, .48, -.9), new THREE.Vector3(.36, .72, -1.05), new THREE.Vector3(.25, .94, -.91)]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, .085, 7, false), fur); tail.castShadow = true; group.add(tail);
  const feet = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), fur); foot.position.set(sx * .3, .17, sz * .34); foot.scale.y = .75; group.add(foot); feet.push(foot);
  }
  const halo = new THREE.PointLight(kind === 'whisker' ? 0xffdf8d : 0xff9d66, 0, 5); halo.position.y = 1.4; group.add(halo);
  const cat = { name, group, kind, state: 'idle', alert: 0, lost: 0, halo, feet, phase: Math.random() * 5, position: group.position };
  monsters.push(cat); return cat;
}

function makeLoot(x, z, value, weight, color, label) {
  const group = new THREE.Group(); group.position.set(x, 0.35, z); scene.add(group);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(.62, .62, .62), mat(color, .52, .05)); crate.castShadow = true; crate.receiveShadow = true; group.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(.64, .09, .64), mat(0xd8cc9d, .45)); band.position.y = .02; group.add(band);
  const seal = new THREE.Mesh(new THREE.BoxGeometry(.23, .24, .025), mat(0x191d18)); seal.position.set(0, .08, .325); group.add(seal);
  const spawnAngle = Math.random() * 6;
  const item = { group, value, weight, label, baseY: .35, spawnX: x, spawnY: .35, spawnZ: z, spawnAngle, angle: spawnAngle, active: true };
  loot.push(item);
}

function makeWorld() {
  makeRoom();
  makeLoot(-10.8, -3.1, 5, 8, 0xa5784e, '泡麵箱'); makeLoot(-8.3, 1.5, 10, 16, 0x7a9d77, '汽水整箱');
  makeLoot(-6.1, 7.8, 5, 5, 0xb1a068, '洋芋片箱'); makeLoot(-1.8, -6.8, 10, 15, 0x6c90a0, '冰品保冷箱');
  makeLoot(2.2, 4.2, 5, 8, 0xa5784e, '餅乾箱'); makeLoot(7.2, -5.6, 15, 5, 0x9d765b, '限定零食');
  makeLoot(10.3, 3.3, 10, 16, 0x748b6d, '汽水整箱'); makeLoot(2.3, -2.9, 5, 10, 0x9b8863, '咖啡豆');
  makeCat('方鬍子貓', -9.4, -5.1, 'whisker');
  makeCat('鍵盤暴走貓', 9.1, -0.5, 'keyboard');
}
makeWorld();

const audioContext = window.AudioContext ? new AudioContext() : null;
function soundAlarm() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(620, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(330, audioContext.currentTime + .34);
  gain.gain.setValueAtTime(.0001, audioContext.currentTime); gain.gain.linearRampToValueAtTime(.17, audioContext.currentTime + .025); gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .4);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .42);
}

function showToast(text, duration = 2.4) { ui.toast.textContent = text; ui.toast.classList.add('show'); state.toastTimer = duration; }
function setOverlay(headline, copy, buttonText) { ui.title.textContent = headline; ui.copy.textContent = copy; ui.button.textContent = buttonText; ui.overlay.hidden = false; }
function start() {
  if (!state.running) {
    state.score = 0; state.time = 180; state.lives = 3; state.carried = null; state.damageCooldown = 0;
    ui.score.textContent = '0'; ui.progress.value = 0; ui.timer.textContent = '180'; ui.lives.textContent = '♥ ♥ ♥'; ui.carrying.textContent = '空手';
    camera.position.set(0, 1.66, 8.2); camera.rotation.set(0, 0, 0);
    for (const item of loot) {
      if (item.carried) { camera.remove(item.group); scene.add(item.group); }
      const reset = lootResetState(item);
      item.carried = reset.carried; item.active = reset.active; item.angle = reset.angle; item.group.visible = true;
      item.group.position.set(reset.position.x, reset.position.y, reset.position.z); item.group.rotation.set(0, 0, 0);
    }
    for (const cat of monsters) { cat.state = 'idle'; cat.alert = 0; cat.lost = 0; cat.group.position.set(cat.kind === 'whisker' ? -9.4 : 9.1, 0, cat.kind === 'whisker' ? -5.1 : -.5); }
    state.running = true;
  }
  if (!audioContext || audioContext.state === 'suspended') audioContext?.resume();
  canvas.requestPointerLock();
}
ui.button.addEventListener('click', start);
document.addEventListener('pointerlockchange', () => {
  state.locked = document.pointerLockElement === canvas;
  if (state.locked) ui.overlay.hidden = true;
  else if (state.running && state.lives > 0 && state.time > 0) setOverlay('先喘口氣', '目前進度已暫停；點下面按鈕回到商店繼續。', '繼續這一班');
});
document.addEventListener('pointerlockerror', () => showToast('瀏覽器沒有開啟滑鼠控制，請再按一次開始。'));
document.addEventListener('mousemove', event => {
  if (!state.locked) return;
  camera.rotation.order = 'YXZ';
  camera.rotation.y -= event.movementX * .0022;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * .0019, -1.35, 1.35);
});
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === 'e' && !event.repeat && state.running && state.locked) interact();
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

const playerRadius = .33;
function canOccupy(x, z) {
  if (x < -12.25 || x > 12.25 || z < -9.35 || z > 9.35) return false;
  return !colliders.some(c => x + playerRadius > c.minX && x - playerRadius < c.maxX && z + playerRadius > c.minZ && z - playerRadius < c.maxZ);
}
function movePlayer(dx, dz) {
  const x = camera.position.x + dx, z = camera.position.z + dz;
  if (canOccupy(x, camera.position.z)) camera.position.x = x;
  if (canOccupy(camera.position.x, z)) camera.position.z = z;
}
function nearestLoot(maxDistance = 2.35) {
  let result = null, best = maxDistance;
  for (const item of loot) if (item.active && !item.carried) {
    const d = Math.hypot(camera.position.x - item.group.position.x, camera.position.z - item.group.position.z);
    if (d < best) { result = item; best = d; }
  }
  return result;
}
function nearExit() { return Math.hypot(camera.position.x, camera.position.z + 9.0) < 2.35; }
function interact() {
  if (state.carried) {
    if (nearExit()) {
      const delivered = state.carried; delivered.carried = false; delivered.active = false; camera.remove(delivered.group); delivered.group.visible = false;
      const delivery = depositLoot(state.score, delivered.value); state.score = delivery.score; state.carried = null; ui.carrying.textContent = '空手'; ui.score.textContent = state.score; ui.progress.value = state.score;
      if (delivery.extracted) endGame(true);
      else showToast(`收到了 ${delivered.label}，目前 ${state.score} 元；再搬一些回來。`);
      return;
    }
    const dropped = state.carried; state.carried = null; dropped.carried = false;
    camera.remove(dropped.group); scene.add(dropped.group);
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dropped.group.position.set(camera.position.x + dir.x * 1.25, .35, camera.position.z + dir.z * 1.25);
    ui.carrying.textContent = '空手'; showToast(`放下了${dropped.label}。`); return;
  }
  if (nearExit()) { showToast(state.score >= 20 ? '已達標！把手上的東西送到門邊就能撤離。' : '還差一些：需要先回收至少 20 元。'); return; }
  const item = nearestLoot();
  if (!item) { showToast('附近沒有可以搬的戰利品。'); return; }
  item.carried = true; state.carried = item; scene.remove(item.group); camera.add(item.group);
  item.group.position.set(.46, -.34, -1.12); item.group.rotation.set(.08, .2, .04);
  ui.carrying.textContent = `${item.label} · ${item.value}元 · 重${item.weight}`; showToast(`搬起${item.label}（重量 ${item.weight}）。帶到綠色撤離門按 E 存放。`);
}

function damagePlayer(fromMonster) {
  if (state.damageCooldown > 0) return;
  state.damageCooldown = 1.7; state.lives -= 1; ui.lives.textContent = '♥ '.repeat(Math.max(0, state.lives)).trim() || '0';
  if (state.carried) {
    const item = state.carried; state.carried = null; item.carried = false; camera.remove(item.group); scene.add(item.group);
    item.group.position.set(camera.position.x + .8, .35, camera.position.z - .7); ui.carrying.textContent = '空手';
  }
  camera.position.set(0, 1.66, 8.2); showToast(`${fromMonster.name}嚇到你了，掉回入口！`);
  if (state.lives <= 0) endGame(false);
}
function endGame(won) {
  state.running = false; document.exitPointerLock?.();
  if (won) setOverlay('夜班收工！', `成功帶回 ${state.score} 元，整隊平安撤離。下一步：增加合作隊友與新關卡。`, '再玩一班');
  else setOverlay('這班撐不下去了', `本次回收 ${state.score} 元。注意怪物提示，別為了衝刺把整間店吵醒。`, '再試一次');
}

function updatePlayer(dt) {
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
  right.set(-forward.z, 0, forward.x).normalize();
  moveVector.set(0, 0, 0);
  if (keys.has('w') || keys.has('arrowup')) moveVector.add(forward);
  if (keys.has('s') || keys.has('arrowdown')) moveVector.sub(forward);
  if (keys.has('d') || keys.has('arrowright')) moveVector.add(right);
  if (keys.has('a') || keys.has('arrowleft')) moveVector.sub(right);
  const moving = moveVector.lengthSq() > 0;
  const sprinting = keys.has('shift') && moving && !state.carried;
  if (moving) {
    moveVector.normalize();
    const speed = movementSpeed({ carrying: Boolean(state.carried), carriedWeight: state.carried?.weight, sprinting });
    movePlayer(moveVector.x * speed * dt, moveVector.z * speed * dt);
    state.bob += dt * (sprinting ? 13 : 8);
    camera.position.y = 1.66 + Math.sin(state.bob) * (sprinting ? .045 : .022);
  } else camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.66, dt * 8);
  paws.position.y = moving ? Math.sin(state.bob * .5) * .026 : THREE.MathUtils.lerp(paws.position.y, 0, dt * 8);
  leftPaw.position.x = -.31 + (moving ? Math.sin(state.bob) * .025 : 0);
  rightPaw.position.x = .31 - (moving ? Math.sin(state.bob) * .025 : 0);
  state.damageCooldown = Math.max(0, state.damageCooldown - dt);
  return { moving, sprinting };
}

function updateMonsters(dt, playerMotion) {
  const player = camera.position;
  for (const cat of monsters) {
    const dx = player.x - cat.group.position.x, dz = player.z - cat.group.position.z;
    const distance = Math.hypot(dx, dz);
    cat.phase += dt * (cat.state === 'chase' ? 12 : 3);
    cat.feet.forEach((foot, i) => { foot.position.y = .17 + Math.sin(cat.phase + i * Math.PI) * (cat.state === 'chase' ? .09 : .018); });
    cat.group.lookAt(player.x, 0, player.z);
    cat.halo.intensity = cat.state === 'alert' ? 1.5 + Math.sin(cat.phase * 2) * .8 : cat.state === 'chase' ? 2.7 : 0;
    if (cat.kind === 'whisker') {
      if (shouldWarnWhisker(cat.state, distance)) { cat.state = 'alert'; cat.alert = 1.75; soundAlarm(); showToast('喵——方鬍子貓發出警告！快離開牠附近！', 2.8); }
      else if (cat.state === 'alert') {
        cat.alert -= dt;
        if (distance > 8.2) cat.state = 'idle';
        else if (cat.alert <= 0) { cat.state = 'chase'; showToast('方鬍子貓追上來了！', 1.8); }
      }
      if (cat.state === 'chase') {
        if (distance > 13) { cat.lost += dt; if (cat.lost > 3.2) { cat.state = 'idle'; cat.lost = 0; } } else cat.lost = 0;
        const speed = 2.05;
        cat.group.position.x += (dx / Math.max(distance, .01)) * speed * dt;
        cat.group.position.z += (dz / Math.max(distance, .01)) * speed * dt;
        if (distance < 1.35) damagePlayer(cat);
      }
    } else {
      if (cat.state === 'idle' && playerMotion.sprinting && distance < 12) { cat.state = 'chase'; cat.alert = 5; showToast('衝刺聲驚動了鍵盤暴走貓！', 2.1); }
      if (cat.state === 'chase') {
        cat.alert -= dt;
        if (distance > 16 || cat.alert <= 0) cat.state = 'idle';
        else {
          const speed = 3.0; cat.group.position.x += (dx / Math.max(distance, .01)) * speed * dt; cat.group.position.z += (dz / Math.max(distance, .01)) * speed * dt;
          if (distance < 1.3) damagePlayer(cat);
        }
      }
    }
  }
}

function updateHud() {
  let hint = '';
  const item = nearestLoot();
  if (state.carried && nearExit()) hint = '按 <b>E</b> 存放戰利品並撤離';
  else if (state.carried) hint = '按 <b>E</b> 放下戰利品';
  else if (nearExit()) hint = '綠色撤離門 · 需要 20 元';
  else if (item) hint = `按 <b>E</b> 搬起 ${item.label}（${item.value} 元）`;
  ui.prompt.innerHTML = hint; ui.prompt.classList.toggle('show', Boolean(hint));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  const playerMotion = state.running && state.locked ? updatePlayer(dt) : { moving: false, sprinting: false };
  if (state.running && state.locked) {
    state.time -= dt; ui.timer.textContent = Math.max(0, Math.ceil(state.time));
    if (state.time <= 0) endGame(false);
    updateMonsters(dt, playerMotion); updateHud();
    for (const item of loot) if (item.active && !item.carried) { item.angle += dt * .45; item.group.rotation.y = Math.sin(item.angle) * .12; item.group.position.y = item.baseY + Math.sin(item.angle * 2) * .045; }
    if (state.toastTimer > 0) { state.toastTimer -= dt; if (state.toastTimer <= 0) ui.toast.classList.remove('show'); }
  }
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});
