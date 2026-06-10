/* ══════════════════════════════════════════════════════════════════
   COLONIZATION MISSION SYSTEM  — js/mission.js
   Integrated into game.html via <script> tag.
   
   Phases:
     0 = Pre-Launch (Kennedy)     — Hold ↑+Shift 2s to ignite
     1 = Engine Start             — Release Shift, keep ↑
     2 = Liftoff & Ascent         — Camera follows rocket up
     3 = Stage Separation         — Press Enter twice
     4 = Earth Orbit              — Press Space for TLI
     5 = Fly to Moon              — ← → ↑ player control
     6 = Powered Descent          — Hold Space to brake, land <10 km/s
══════════════════════════════════════════════════════════════════ */

/* ── KEY STATE ── */
const keyState = {};
document.addEventListener('keydown', e => {
    keyState[e.code] = true;
    if (document.getElementById('missionOverlay').classList.contains('active')) {
        if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.code)) {
            e.preventDefault();
        }
    }
});
document.addEventListener('keyup', e => { keyState[e.code] = false; });

/* ── GLOBALS ── */
let missionPhase = -1;
let missionPlanet = 'Moon';
let missionRafId = null;
let missionActive = false;

const mCanvas = document.getElementById('missionCanvas');
const mCtx = mCanvas.getContext('2d');

/* ── PHYSICS & STATE ── */
const MS = {
    ignitionProgress: 0,
    engineRunning: false,

    rocketX: 0, rocketY: 0,
    altitude: 0,            // km
    speed: 0,               // km/s
    fuel: 100,

    camY: 0,
    skyBlend: 0,            // 0 = ground blue, 1 = space

    sepSubPhase: 0,
    sep1Y: 0, sep1Rot: 0,
    sep2Y: 0, sep2Rot: 0,
    sepTimer: 0,

    orbitAngle: 0,

    capX: 0, capY: 0,
    capVX: 0, capVY: 0,
    capAngle: 0,
    moonTX: 0, moonTY: 0,
    moonSize: 0,
    distToMoon: 384400,

    landerY: 0,
    landerSpeed: 0,
    landerFuel: 100,
    thrustOn: false,

    stars: [],
    particles: [],
    phaseTime: 0,
    lastTS: 0,

    // camera shake
    shakeIntensity: 0,
    shakeX: 0, shakeY: 0,

    // debris for separation
    debris: [],

    // liftoff sub-phases & gravity turn
    liftoffSubPhase: 0,
    rocketTilt: 0,
    clouds: [],

    // orbit insertion
    orbitSubPhase: 0,
    orbitVelocity: 0,
    orbitInsertAngle: 0
};

/* ── STARS ── */
function initStars() {
    MS.stars = [];
    for (let i = 0; i < 320; i++) {
        MS.stars.push({
            x: Math.random(), y: Math.random(),
            r: Math.random() * 1.4 + 0.3,
            tw: Math.random() * Math.PI * 2,
            sp: Math.random() * 0.5 + 0.5
        });
    }
}

/* ── PARTICLES ── */
function spawnParticle(x, y, vx, vy, life, color, size) {
    MS.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
}
function tickParticles(dt) {
    for (let i = MS.particles.length - 1; i >= 0; i--) {
        const p = MS.particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) MS.particles.splice(i, 1);
    }
}
function drawParticles() {
    MS.particles.forEach(p => {
        const a = Math.max(0, p.life / p.maxLife);
        mCtx.globalAlpha = a;
        mCtx.fillStyle = p.color;
        mCtx.beginPath();
        mCtx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        mCtx.fill();
    });
    mCtx.globalAlpha = 1;
}

/* ═══════════════════  START / CLOSE  ═══════════════════ */

function startMission(planet) {
    missionPlanet = planet;
    missionPhase = 0;
    missionActive = true;

    // reset
    Object.assign(MS, {
        ignitionProgress: 0, engineRunning: false,
        rocketX: 0, rocketY: 0, altitude: 0, speed: 0, fuel: 100,
        camY: 0, skyBlend: 0,
        sepSubPhase: 0, sep1Y: 0, sep1Rot: 0, sep2Y: 0, sep2Rot: 0, sepTimer: 0,
        orbitAngle: 0,
        capX: 0, capY: 0, capVX: 0, capVY: 0, capAngle: 0,
        moonTX: 0, moonTY: 0, moonSize: 0, distToMoon: 384400,
        landerY: 0, landerSpeed: 0, landerFuel: 100, thrustOn: false,
        particles: [], debris: [], clouds: [],
        liftoffSubPhase: 0, rocketTilt: 0,
        orbitSubPhase: 0, orbitVelocity: 0, orbitInsertAngle: 0,
        phaseTime: 0, lastTS: performance.now(),
        shakeIntensity: 0, shakeX: 0, shakeY: 0,
        flyToMoonSubPhase: 0, animTimer: 0,
        landerX: 0, landerVX: 0, landerVY: 0, landerTilt: 0
    });

    initStars();
    mCanvas.width = window.innerWidth;
    mCanvas.height = window.innerHeight;
    MS.rocketX = mCanvas.width / 2;
    MS.rocketY = mCanvas.height * 0.68;

    document.getElementById('missionOverlay').classList.add('active');
    document.getElementById('missionSuccess').classList.remove('show');
    document.getElementById('missionFail').classList.remove('show');

    // success screen planet
    const meta = (typeof PLANET_META !== 'undefined' ? PLANET_META[planet] : null) || { emoji: '🌕' };
    document.getElementById('successIcon').textContent = meta.emoji || '🌕';
    document.getElementById('successTitle').textContent = planet.toUpperCase() + ' LANDING SUCCESS!';
    document.getElementById('successSub').textContent =
        'You guided your spacecraft from Earth to ' + planet + ' and landed safely. Ready to colonize!';

    applyPhase(0);
    if (missionRafId) cancelAnimationFrame(missionRafId);
    missionRafId = requestAnimationFrame(missionLoop);
}

function startMissionFromOrbit(planet) {
    missionPlanet = planet;
    missionPhase = 5;
    missionActive = true;

    // reset
    Object.assign(MS, {
        ignitionProgress: 0, engineRunning: false,
        rocketX: 0, rocketY: 0, altitude: 400, speed: 7.8, fuel: 100,
        camY: 0, skyBlend: 1.0,
        sepSubPhase: 0, sep1Y: 0, sep1Rot: 0, sep2Y: 0, sep2Rot: 0, sepTimer: 0,
        orbitAngle: Math.random() * Math.PI * 2,
        capX: window.innerWidth * 0.14, capY: window.innerHeight * 0.5,
        capVX: 2.2, capVY: -0.3, capAngle: -0.3,
        moonTX: window.innerWidth * 0.85, moonTY: window.innerHeight * 0.35, moonSize: window.innerHeight * 0.22, distToMoon: 384400,
        landerY: 0, landerSpeed: 0, landerFuel: 100, thrustOn: false,
        particles: [], debris: [], clouds: [],
        liftoffSubPhase: 0, rocketTilt: 0,
        orbitSubPhase: 0, orbitVelocity: 0, orbitInsertAngle: 0,
        phaseTime: 0, lastTS: performance.now(),
        shakeIntensity: 0, shakeX: 0, shakeY: 0,
        flyToMoonSubPhase: 1, animTimer: 0,
        landerX: 0, landerVX: 0, landerVY: 0, landerTilt: 0
    });

    initStars();
    mCanvas.width = window.innerWidth;
    mCanvas.height = window.innerHeight;

    document.getElementById('missionOverlay').classList.add('active');
    document.getElementById('missionSuccess').classList.remove('show');
    document.getElementById('missionFail').classList.remove('show');

    // success screen planet
    const meta = (typeof PLANET_META !== 'undefined' ? PLANET_META[planet] : null) || { emoji: '🌕' };
    document.getElementById('successIcon').textContent = meta.emoji || '🌕';
    document.getElementById('successTitle').textContent = planet.toUpperCase() + ' LANDING SUCCESS!';
    document.getElementById('successSub').textContent =
        'You guided your spacecraft from Earth to ' + planet + ' and landed safely. Ready to colonize!';

    applyPhase(5);
    document.getElementById('mPromptText').innerHTML = '<strong>✨ Orbit Capture Confirmed!</strong><br>Entering Lunar Orbit... Launching landing sequence';

    if (missionRafId) cancelAnimationFrame(missionRafId);
    missionRafId = requestAnimationFrame(missionLoop);
}

function closeMission() {
    missionActive = false;
    document.getElementById('missionOverlay').classList.remove('active');
    if (missionRafId) cancelAnimationFrame(missionRafId);
}

/* ═══════════════════  PHASE MANAGER  ═══════════════════ */

const PHASE_LABELS = [
    'PHASE 1 — PRE-LAUNCH',
    'PHASE 2 — ENGINE IGNITION',
    'PHASE 3 — LIFTOFF',
    'PHASE 4 — STAGING',
    'PHASE 5 — EARTH ORBIT',
    'PHASE 6 — TRANS-LUNAR FLIGHT',
    'PHASE 7 — POWERED DESCENT'
];
const PHASE_PROMPTS = [
    '<strong>Kennedy Space Center — Launch Pad 39A</strong><br>Hold <kbd>↑</kbd> + <kbd>Shift</kbd> for 2 seconds to ignite engines',
    '<strong>🔥 Engines Ignited!</strong><br>Release <kbd>Shift</kbd>! Keep holding <kbd>↑</kbd> to launch!',
    '<strong>🚀 Liftoff!</strong><br>Hold <kbd>↑</kbd> to ascend through the atmosphere!',
    '<strong>⚡ Stage Separation</strong><br>Flying through upper atmosphere — separation sequence initiated',
    '<strong>🌍 Orbit Insertion</strong><br>Hold <kbd>←</kbd> + <kbd>↑</kbd> to achieve orbital velocity',
    '<strong>🌙 Navigate to the Moon!</strong><br>Use <kbd>← →</kbd> to steer, <kbd>↑</kbd> for thrust. Reach the Moon!',
    '<strong>🔥 Powered Descent!</strong><br>Hold <kbd>Space</kbd> or click 🔥 FIRE THRUSTERS to brake. Land below 10 km/s!'
];

function applyPhase(ph) {
    missionPhase = ph;
    MS.phaseTime = 0;

    document.getElementById('mPhaseLabel').textContent = PHASE_LABELS[ph] || '';
    document.getElementById('mPromptText').innerHTML = PHASE_PROMPTS[ph] || '';

    // gauges
    document.getElementById('mGauges').classList.toggle('show', ph >= 2);
    // thruster pad
    document.getElementById('mThrusterPad').classList.toggle('show', ph === 6);
    // ignition bar
    document.getElementById('mIgnBar').style.display = ph === 0 ? 'block' : 'none';

    // action btn
    const ab = document.getElementById('mActionBtn');
    ab.classList.remove('show'); ab.disabled = false;

    // dots
    for (let i = 0; i < 7; i++) {
        const d = document.getElementById('md' + i);
        if (d) d.className = 'mission-dot' + (i === ph ? ' active' : i < ph ? ' done' : '');
    }
}

/* ═══════════════════  RENDER LOOP  ═══════════════════ */

function missionLoop(ts) {
    if (!missionActive) return;
    const dt = Math.min((ts - MS.lastTS) / 1000, 0.05);
    MS.lastTS = ts;
    MS.phaseTime += dt;

    mCanvas.width = window.innerWidth;
    mCanvas.height = window.innerHeight;

    // camera shake
    if (MS.shakeIntensity > 0) {
        MS.shakeX = (Math.random() - 0.5) * MS.shakeIntensity;
        MS.shakeY = (Math.random() - 0.5) * MS.shakeIntensity;
    } else { MS.shakeX = 0; MS.shakeY = 0; }

    mCtx.save();
    mCtx.translate(MS.shakeX, MS.shakeY);

    mCtx.clearRect(-10, -10, mCanvas.width + 20, mCanvas.height + 20);

    tickParticles(dt);

    switch (missionPhase) {
        case 0: renderPreLaunch(dt); break;
        case 1: renderEngineStart(dt); break;
        case 2: renderLiftoff(dt); break;
        case 3: renderSeparation(dt); break;
        case 4: renderOrbit(dt); break;
        case 5: renderFlyToMoon(dt); break;
        case 6: renderDescent(dt); break;
    }

    drawParticles();
    mCtx.restore();
    missionRafId = requestAnimationFrame(missionLoop);
}

/* ═══════════════════  DRAWING HELPERS  ═══════════════════ */

function drawStars(offsetY) {
    const t = performance.now() * 0.0008;
    const W = mCanvas.width, H = mCanvas.height;
    MS.stars.forEach(s => {
        const a = Math.max(0.08, 0.38 + Math.sin(t * s.sp + s.tw) * 0.3);
        mCtx.fillStyle = `rgba(255,255,255,${a})`;
        const sy = ((s.y * H + (offsetY || 0)) % H + H) % H;
        mCtx.fillRect(s.x * W, sy, s.r, s.r);
    });
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

function lerpCol(c1, c2, t) {
    const a = parseInt(c1.replace('#', ''), 16);
    const b = parseInt(c2.replace('#', ''), 16);
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

/* ── SURFACE SCENE ── */
function drawKennedySurface() {
    const W = mCanvas.width, H = mCanvas.height;
    const bl = MS.skyBlend;

    // Sky
    const sky = mCtx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, lerpCol('#040a1e', '#000000', bl));
    sky.addColorStop(0.55, lerpCol('#0a1a50', '#000003', bl));
    sky.addColorStop(1, lerpCol('#153060', '#000005', bl));
    mCtx.fillStyle = sky; mCtx.fillRect(0, 0, W, H);

    // Stars fade in
    if (bl > 0.08) { mCtx.globalAlpha = Math.min(1, bl * 2.5); drawStars(MS.camY * 0.08); mCtx.globalAlpha = 1; }

    // Ground
    const gY = H * 0.72 + MS.camY;
    if (gY < H + 50) {
        const grd = mCtx.createLinearGradient(0, gY, 0, gY + H * 0.3);
        grd.addColorStop(0, '#1a3a1a'); grd.addColorStop(1, '#0d1f0d');
        mCtx.fillStyle = grd; mCtx.fillRect(0, gY, W, H - gY + 300);

        // Pad
        mCtx.fillStyle = '#555'; mCtx.fillRect(W * 0.5 - 68, gY - 3, 136, 14);
        // Pillar
        mCtx.fillStyle = '#444'; mCtx.fillRect(W * 0.5 - 10, gY - 62, 20, 62);
        // Tower
        mCtx.strokeStyle = '#5a5a5a'; mCtx.lineWidth = 5;
        mCtx.beginPath(); mCtx.moveTo(W * 0.5 + 52, gY - H * 0.38); mCtx.lineTo(W * 0.5 + 52, gY); mCtx.stroke();
        mCtx.lineWidth = 3;
        for (let i = 0; i < 7; i++) {
            const by = gY - H * 0.05 - i * H * 0.05;
            mCtx.beginPath(); mCtx.moveTo(W * 0.5 + 18, by); mCtx.lineTo(W * 0.5 + 52, by); mCtx.stroke();
        }
        // Umbilical arm
        mCtx.strokeStyle = '#4a6a4a'; mCtx.lineWidth = 4;
        mCtx.beginPath(); mCtx.moveTo(W * 0.5 + 52, gY - H * 0.2); mCtx.lineTo(W * 0.5 + 14, gY - H * 0.2); mCtx.stroke();

        // Spotlights
        mCtx.fillStyle = 'rgba(255,255,200,.025)';
        [W * 0.33, W * 0.67].forEach(bx => {
            mCtx.beginPath(); mCtx.moveTo(bx, gY);
            mCtx.lineTo(W * 0.5 - 28, gY - H * 0.36);
            mCtx.lineTo(W * 0.5 + 28, gY - H * 0.36);
            mCtx.closePath(); mCtx.fill();
        });

        // Label
        if (MS.camY < 40) {
            mCtx.fillStyle = 'rgba(102,252,241,.45)';
            mCtx.font = 'bold 13px "Segoe UI", monospace';
            mCtx.textAlign = 'center';
            mCtx.fillText('KENNEDY SPACE CENTER — LAUNCH PAD 39A', W / 2, gY + H * 0.13);
        }
    }
}

/* ── ROCKET ── */
function drawRocket(x, y, sc, thrust, b1, b2) {
    mCtx.save(); mCtx.translate(x, y); mCtx.scale(sc, sc);

    // 1st stage booster
    if (b1 !== false) {
        mCtx.fillStyle = '#e0e0e0';
        mCtx.beginPath(); mCtx.moveTo(-16, 48); mCtx.lineTo(16, 48); mCtx.lineTo(14, -8); mCtx.lineTo(-14, -8); mCtx.closePath(); mCtx.fill();
        mCtx.fillStyle = '#333'; mCtx.fillRect(-14, 22, 28, 5);
        mCtx.fillStyle = '#c00'; mCtx.fillRect(-14, 0, 28, 3);
        // Nozzles
        mCtx.fillStyle = '#666';
        [-8, 0, 8].forEach(nx => { mCtx.beginPath(); mCtx.moveTo(nx - 4, 48); mCtx.lineTo(nx + 4, 48); mCtx.lineTo(nx + 3, 55); mCtx.lineTo(nx - 3, 55); mCtx.closePath(); mCtx.fill(); });
        // Fins
        mCtx.fillStyle = '#b0b0b0';
        mCtx.beginPath(); mCtx.moveTo(-16, 34); mCtx.lineTo(-32, 54); mCtx.lineTo(-16, 47); mCtx.closePath(); mCtx.fill();
        mCtx.beginPath(); mCtx.moveTo(16, 34); mCtx.lineTo(32, 54); mCtx.lineTo(16, 47); mCtx.closePath(); mCtx.fill();
    }

    // 2nd stage
    if (b2 !== false) {
        mCtx.fillStyle = '#f0f0f0';
        mCtx.beginPath(); mCtx.moveTo(-12, -8); mCtx.lineTo(12, -8); mCtx.lineTo(10, -38); mCtx.lineTo(-10, -38); mCtx.closePath(); mCtx.fill();
        mCtx.fillStyle = '#c0c0c0'; mCtx.fillRect(-10, -28, 20, 3);
    }

    // Capsule
    mCtx.fillStyle = '#ddd';
    mCtx.beginPath(); mCtx.moveTo(-8, -38); mCtx.lineTo(8, -38); mCtx.lineTo(5, -56); mCtx.lineTo(-5, -56); mCtx.closePath(); mCtx.fill();
    // Nose
    mCtx.fillStyle = '#e83c3c';
    mCtx.beginPath(); mCtx.moveTo(-5, -56); mCtx.lineTo(5, -56); mCtx.lineTo(0, -72); mCtx.closePath(); mCtx.fill();
    // Window
    mCtx.fillStyle = '#66fcf1'; mCtx.beginPath(); mCtx.arc(0, -46, 4, 0, Math.PI * 2); mCtx.fill();
    mCtx.fillStyle = 'rgba(255,255,255,.45)'; mCtx.beginPath(); mCtx.arc(-1, -47, 1.5, 0, Math.PI * 2); mCtx.fill();

    // Thrust flames
    if (thrust) {
        const t = performance.now() * 0.012;
        const baseY = b1 !== false ? 55 : (b2 !== false ? -5 : -36);
        for (let i = 0; i < 10; i++) {
            const ang = Math.PI / 2 + Math.sin(t + i * 0.7) * 0.38;
            const len = 32 + Math.sin(t * 1.6 + i) * 16;
            const fx = Math.cos(ang) * len * 0.22;
            const fy = baseY + Math.sin(ang) * len;
            const g = mCtx.createRadialGradient(fx, fy, 0, fx, fy, 13);
            g.addColorStop(0, 'rgba(255,235,60,.92)');
            g.addColorStop(0.35, 'rgba(255,120,0,.55)');
            g.addColorStop(1, 'rgba(255,40,0,0)');
            mCtx.fillStyle = g; mCtx.beginPath(); mCtx.arc(fx, fy, 13, 0, Math.PI * 2); mCtx.fill();
        }
    }
    mCtx.restore();
}

/* ── BOOSTER FALLING ── */
function drawBooster(x, y, rot, type) {
    mCtx.save(); mCtx.translate(x, y); mCtx.rotate(rot);
    if (type === 1) {
        mCtx.fillStyle = '#c0c0c0';
        mCtx.beginPath(); mCtx.moveTo(-13, 24); mCtx.lineTo(13, 24); mCtx.lineTo(11, -18); mCtx.lineTo(-11, -18); mCtx.closePath(); mCtx.fill();
        mCtx.fillStyle = '#333'; mCtx.fillRect(-11, 6, 22, 4);
        mCtx.fillStyle = '#999';
        mCtx.beginPath(); mCtx.moveTo(-13, 18); mCtx.lineTo(-24, 28); mCtx.lineTo(-13, 23); mCtx.closePath(); mCtx.fill();
        mCtx.beginPath(); mCtx.moveTo(13, 18); mCtx.lineTo(24, 28); mCtx.lineTo(13, 23); mCtx.closePath(); mCtx.fill();
    } else {
        mCtx.fillStyle = '#d0d0d0';
        mCtx.beginPath(); mCtx.moveTo(-9, 14); mCtx.lineTo(9, 14); mCtx.lineTo(7, -14); mCtx.lineTo(-7, -14); mCtx.closePath(); mCtx.fill();
    }
    mCtx.restore();
}

/* ── SMOKE ── */
function drawSmoke(x, y, intensity) {
    const t = performance.now() * 0.003;
    const n = Math.floor(intensity * 14);
    for (let i = 0; i < n; i++) {
        const age = (t + i * 0.65) % 3;
        const sp = age * 55;
        const px = x + Math.sin(t * 2 + i * 1.2) * sp * 0.7;
        const py = y + age * 22 + Math.cos(t + i) * 8;
        const sz = 9 + age * 20;
        const al = Math.max(0, 0.22 - age * 0.075);
        mCtx.fillStyle = `rgba(200,200,200,${al})`;
        mCtx.beginPath(); mCtx.arc(px, py, sz, 0, Math.PI * 2); mCtx.fill();
    }
}

/* ── EARTH FROM SPACE ── */
function drawEarth(cx, cy, r) {
    const g = mCtx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    g.addColorStop(0, '#6fa8dc'); g.addColorStop(0.5, '#3d7ab5'); g.addColorStop(1, '#1a3a6e');
    mCtx.fillStyle = g; mCtx.beginPath(); mCtx.arc(cx, cy, r, 0, Math.PI * 2); mCtx.fill();
    mCtx.fillStyle = '#3a8c3a';
    [[0.22, 0.28], [-0.38, 0], [0, -0.38], [0.48, -0.22]].forEach(([ox, oy]) => {
        mCtx.beginPath(); mCtx.arc(cx + ox * r, cy + oy * r, r * 0.2, 0, Math.PI * 2); mCtx.fill();
    });
    const atm = mCtx.createRadialGradient(cx, cy, r, cx, cy, r * 1.12);
    atm.addColorStop(0, 'rgba(100,180,255,.26)'); atm.addColorStop(1, 'rgba(100,180,255,0)');
    mCtx.fillStyle = atm; mCtx.beginPath(); mCtx.arc(cx, cy, r * 1.12, 0, Math.PI * 2); mCtx.fill();
}

/* ── MOON ── */
function drawMoon(cx, cy, r) {
    const g = mCtx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    g.addColorStop(0, '#e0e0e0'); g.addColorStop(0.5, '#aeaeae'); g.addColorStop(1, '#686868');
    mCtx.fillStyle = g; mCtx.beginPath(); mCtx.arc(cx, cy, r, 0, Math.PI * 2); mCtx.fill();
    [[-0.3, -0.2, 0.12], [0.3, 0.3, 0.15], [0.1, -0.45, 0.09], [-0.5, 0.2, 0.08], [0.4, -0.1, 0.07]].forEach(([ox, oy, cr]) => {
        mCtx.fillStyle = 'rgba(80,80,80,.42)';
        mCtx.beginPath(); mCtx.arc(cx + ox * r, cy + oy * r, cr * r, 0, Math.PI * 2); mCtx.fill();
    });
    const gl = mCtx.createRadialGradient(cx, cy, r, cx, cy, r * 1.08);
    gl.addColorStop(0, 'rgba(200,200,200,.08)'); gl.addColorStop(1, 'rgba(200,200,200,0)');
    mCtx.fillStyle = gl; mCtx.beginPath(); mCtx.arc(cx, cy, r * 1.08, 0, Math.PI * 2); mCtx.fill();
}

/* ── CAPSULE ── */
function drawCapsule(x, y, angle, thrustOn) {
    mCtx.save(); mCtx.translate(x, y); mCtx.rotate(angle || 0);
    // Body
    mCtx.fillStyle = '#ddd';
    mCtx.beginPath(); mCtx.moveTo(-8, 12); mCtx.lineTo(8, 12); mCtx.lineTo(5, -12); mCtx.lineTo(-5, -12); mCtx.closePath(); mCtx.fill();
    // Nose
    mCtx.fillStyle = '#e83c3c';
    mCtx.beginPath(); mCtx.moveTo(-5, -12); mCtx.lineTo(5, -12); mCtx.lineTo(0, -22); mCtx.closePath(); mCtx.fill();
    // Window
    mCtx.fillStyle = '#66fcf1'; mCtx.beginPath(); mCtx.arc(0, -3, 3, 0, Math.PI * 2); mCtx.fill();
    // Panels
    mCtx.fillStyle = 'rgba(0,90,200,.8)';
    mCtx.fillRect(-24, -1, 13, 5); mCtx.fillRect(11, -1, 13, 5);
    mCtx.strokeStyle = 'rgba(102,252,241,.3)'; mCtx.lineWidth = 1;
    mCtx.strokeRect(-24, -1, 13, 5); mCtx.strokeRect(11, -1, 13, 5);
    // Thruster
    if (thrustOn) {
        const t = performance.now() * 0.012;
        const g = mCtx.createRadialGradient(0, 18, 0, 0, 22, 13);
        g.addColorStop(0, 'rgba(102,252,241,1)'); g.addColorStop(0.4, 'rgba(0,210,255,.65)'); g.addColorStop(1, 'rgba(0,100,255,0)');
        mCtx.fillStyle = g; mCtx.beginPath(); mCtx.arc(0, 18 + Math.sin(t) * 3, 13, 0, Math.PI * 2); mCtx.fill();
    }
    mCtx.restore();
}

/* ── LANDER ── */
function drawLander(x, y, thrustOn) {
    mCtx.save(); mCtx.translate(x, y);
    // Hex body
    mCtx.fillStyle = '#c4d4e4'; mCtx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 6; mCtx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); }
    mCtx.closePath(); mCtx.fill();
    mCtx.strokeStyle = 'rgba(102,252,241,.45)'; mCtx.lineWidth = 1.5; mCtx.stroke();
    // Legs
    mCtx.strokeStyle = '#909090'; mCtx.lineWidth = 2.5;
    [[-30, 22], [30, 22], [-15, 28], [15, 28]].forEach(([lx, ly]) => {
        mCtx.beginPath(); mCtx.moveTo(0, 20); mCtx.lineTo(lx, ly); mCtx.stroke();
    });
    // Foot pads
    [[-30, 22], [30, 22]].forEach(([lx, ly]) => {
        mCtx.fillStyle = '#777'; mCtx.beginPath(); mCtx.ellipse(lx, ly + 2, 6, 2, 0, 0, Math.PI * 2); mCtx.fill();
    });
    // Engine
    mCtx.fillStyle = '#555'; mCtx.fillRect(-6, 20, 12, 9);
    // Flame
    if (thrustOn) {
        const fg = mCtx.createRadialGradient(0, 35, 0, 0, 42, 20);
        fg.addColorStop(0, 'rgba(102,252,241,1)'); fg.addColorStop(0.35, 'rgba(0,210,255,.7)'); fg.addColorStop(1, 'rgba(0,100,255,0)');
        mCtx.fillStyle = fg; mCtx.beginPath(); mCtx.arc(0, 37, 20, 0, Math.PI * 2); mCtx.fill();
    }
    // Antenna
    mCtx.strokeStyle = '#66fcf1'; mCtx.lineWidth = 2;
    mCtx.beginPath(); mCtx.moveTo(0, -24); mCtx.lineTo(0, -37); mCtx.stroke();
    mCtx.beginPath(); mCtx.arc(0, -37, 7, Math.PI, 0); mCtx.stroke();
    // Solar panels
    mCtx.fillStyle = 'rgba(0,90,200,.8)';
    mCtx.fillRect(-42, -8, 15, 7); mCtx.fillRect(27, -8, 15, 7);
    // Speed readout
    if (missionPhase === 6) {
        mCtx.fillStyle = 'rgba(0,0,0,.72)'; mCtx.fillRect(-38, -60, 76, 22);
        mCtx.strokeStyle = MS.landerSpeed > 8 ? '#ff4444' : '#66fcf1';
        mCtx.lineWidth = 1; mCtx.strokeRect(-38, -60, 76, 22);
        mCtx.fillStyle = MS.landerSpeed > 8 ? '#ff4444' : '#66fcf1';
        mCtx.font = 'bold 12px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText(MS.landerSpeed.toFixed(1) + ' km/s', 0, -44);
    }
    mCtx.restore();
}

/* ── GAUGES ── */
function setGauges(spd, alt, fuel) {
    const gs = document.getElementById('gSpd'); if (gs) gs.textContent = typeof spd === 'number' ? spd.toFixed(1) : spd;
    const ga = document.getElementById('gAlt'); if (ga) ga.textContent = typeof alt === 'number' ? Math.floor(alt).toLocaleString() : alt;
    const gf = document.getElementById('gFuel'); if (gf) gf.textContent = Math.max(0, Math.floor(fuel));
}

/* ═══════════════════  PHASE RENDERERS  ═══════════════════ */

/* Phase 0 — Pre-Launch */
function renderPreLaunch(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    drawKennedySurface();
    drawRocket(MS.rocketX, MS.rocketY, 1.2, false, true, true);

    const holdShift = keyState['ShiftLeft'] || keyState['ShiftRight'];
    const holdUp = keyState['ArrowUp'];

    if (holdUp && holdShift) {
        MS.ignitionProgress = Math.min(1, MS.ignitionProgress + dt / 2);
        drawSmoke(MS.rocketX, MS.rocketY + 70, MS.ignitionProgress);
        MS.shakeIntensity = MS.ignitionProgress * 4;
        if (MS.ignitionProgress >= 1) {
            MS.engineRunning = true;
            applyPhase(1);
        }
    } else {
        MS.ignitionProgress = Math.max(0, MS.ignitionProgress - dt * 1.5);
        MS.shakeIntensity = 0;
    }

    // Ignition bar
    const fill = document.getElementById('mIgnFill');
    if (fill) fill.style.width = (MS.ignitionProgress * 100) + '%';

    // Slight rocket shake
    if (MS.ignitionProgress > 0.2) {
        MS.rocketX = W / 2 + Math.sin(performance.now() * 0.05) * MS.ignitionProgress * 2.5;
    } else {
        MS.rocketX = W / 2;
    }
}

/* Phase 1 — Engine Start (release shift) */
function renderEngineStart(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    drawKennedySurface();
    drawRocket(MS.rocketX, MS.rocketY, 1.2, true, true, true);
    drawSmoke(MS.rocketX, MS.rocketY + 85, 1);

    MS.shakeIntensity = 5;
    MS.rocketX = W / 2 + Math.sin(performance.now() * 0.065) * 3.5;

    // Spawn exhaust particles
    if (Math.random() < 0.4) {
        spawnParticle(
            MS.rocketX + (Math.random() - 0.5) * 30,
            MS.rocketY + 90,
            (Math.random() - 0.5) * 40,
            Math.random() * 30 + 10,
            1.5, 'rgba(255,160,0,.7)', 4 + Math.random() * 4
        );
    }

    const holdShift = keyState['ShiftLeft'] || keyState['ShiftRight'];
    const holdUp = keyState['ArrowUp'];

    if (!holdShift && holdUp) {
        MS.speed = 0.3;
        MS.liftoffSubPhase = 0;
        MS.shakeIntensity = 6;
        applyPhase(2);
    }
}

/* Phase 2 — Liftoff */
function renderLiftoff(dt) {
    const W = mCanvas.width, H = mCanvas.height;

    MS.speed = Math.min(MS.speed + dt * 1.6, 9.8);
    MS.altitude += MS.speed * dt * 55;
    MS.fuel = Math.max(0, MS.fuel - dt * 2.5);

    // Camera scroll
    const targetCamY = Math.max(0, MS.altitude * 0.85);
    MS.camY += (targetCamY - MS.camY) * 0.06;

    // Sky blend
    MS.skyBlend = Math.min(1, MS.altitude / 550);

    const screenY = MS.rocketY - MS.camY + H * 0.28;
    MS.rocketX = W / 2 + Math.sin(MS.altitude * 0.018) * 10;
    MS.shakeIntensity = Math.max(0, 6 - MS.altitude * 0.01);

    drawKennedySurface();
    drawRocket(MS.rocketX, Math.min(screenY, H * 0.52), 1.2, true, true, true);

    if (MS.altitude < 180) drawSmoke(MS.rocketX, Math.min(screenY + 85, H + 20), 0.5);

    // Exhaust particles
    if (Math.random() < 0.3) {
        spawnParticle(MS.rocketX + (Math.random() - 0.5) * 20, Math.min(screenY + 80, H),
            (Math.random() - 0.5) * 25, Math.random() * 20 + 8,
            1, 'rgba(255,140,0,.6)', 3 + Math.random() * 3);
    }

    setGauges(MS.speed, MS.altitude, MS.fuel);

    // Altitude label
    mCtx.fillStyle = 'rgba(102,252,241,.5)';
    mCtx.font = 'bold 14px "Segoe UI", monospace'; mCtx.textAlign = 'center';
    mCtx.fillText('ALT: ' + Math.floor(MS.altitude) + ' km  |  SPD: ' + MS.speed.toFixed(1) + ' km/s', W / 2, 40);

    if (MS.altitude >= 200) {
        MS.sepSubPhase = 0; MS.sep1Y = 0; MS.sep1Rot = 0; MS.sepTimer = 0;
        applyPhase(3);
    }
}

/* Phase 3 — Separation */
function renderSeparation(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
    drawStars();

    // Earth below
    const eR = Math.max(40, H * 0.35 - MS.altitude * 0.06);
    drawEarth(W * 0.5, H + eR * 0.45, eR);

    MS.sepTimer += dt;
    const prompt = document.getElementById('mPromptText');

    if (MS.sepSubPhase === 0) {
        // Ascending, wait for sep prompt
        MS.altitude += 4 * dt * 50; MS.speed = 7.8; MS.fuel = Math.max(0, MS.fuel - dt * 1.5);
        MS.shakeIntensity = 2;
        drawRocket(W / 2, H * 0.42, 1.2, true, true, true);
        setGauges(MS.speed, MS.altitude, MS.fuel);
        if (MS.sepTimer > 2.5) { MS.sepSubPhase = 1; prompt.innerHTML = '<strong>⚡ 1st Stage Separation!</strong><br>Press <kbd>Enter</kbd> to release spent booster'; }

    } else if (MS.sepSubPhase === 1) {
        drawRocket(W / 2, H * 0.42, 1.2, true, true, true);
        setGauges(MS.speed, MS.altitude, MS.fuel);
        // Flash prompt
        const fl = Math.sin(performance.now() * 0.006) > 0;
        mCtx.fillStyle = fl ? '#ffd700' : '#66fcf1';
        mCtx.font = 'bold 20px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('⏎ PRESS ENTER — 1ST STAGE SEPARATION', W / 2, H * 0.16);
        MS.shakeIntensity = 1;
        if (keyState['Enter']) {
            keyState['Enter'] = false;
            MS.sepSubPhase = 2; MS.sep1Y = H * 0.42 + 55; MS.sep1Rot = 0; MS.sepTimer = 0;
            // Spawn debris
            for (let i = 0; i < 18; i++) {
                spawnParticle(W / 2 + (Math.random() - 0.5) * 40, H * 0.42 + 30,
                    (Math.random() - 0.5) * 80, Math.random() * 40 - 10,
                    1.8, 'rgba(255,220,50,.8)', 2 + Math.random() * 3);
            }
        }

    } else if (MS.sepSubPhase === 2) {
        // 1st stage falling
        MS.sep1Y += dt * 140; MS.sep1Rot += dt * 0.9;
        MS.altitude += 3 * dt * 50; MS.fuel = Math.max(0, MS.fuel - dt * 1.2);
        drawRocket(W / 2, H * 0.42, 1.2, true, false, true); // no 1st stage
        if (MS.sep1Y < H + 120) drawBooster(W / 2 + (MS.sep1Y - H * 0.42) * 0.25, MS.sep1Y, MS.sep1Rot, 1);
        // Sep flash
        if (MS.sepTimer < 0.6) {
            mCtx.fillStyle = `rgba(255,220,50,${0.6 - MS.sepTimer})`;
            mCtx.beginPath(); mCtx.arc(W / 2, H * 0.42 + 22, 45, 0, Math.PI * 2); mCtx.fill();
        }
        mCtx.fillStyle = '#66fcf1'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('✓ 1ST STAGE SEPARATED', W / 2, H * 0.16);
        setGauges(MS.speed, MS.altitude, MS.fuel);
        MS.shakeIntensity = 0;
        if (MS.sepTimer > 3.5) {
            MS.sepSubPhase = 3; MS.sepTimer = 0;
            prompt.innerHTML = '<strong>⚡ 2nd Stage Separation!</strong><br>Press <kbd>Enter</kbd> to release 2nd booster';
        }

    } else if (MS.sepSubPhase === 3) {
        drawRocket(W / 2, H * 0.42, 1.2, true, false, true);
        setGauges(MS.speed, MS.altitude, MS.fuel);
        const fl = Math.sin(performance.now() * 0.006) > 0;
        mCtx.fillStyle = fl ? '#ffd700' : '#66fcf1';
        mCtx.font = 'bold 20px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('⏎ PRESS ENTER — 2ND STAGE SEPARATION', W / 2, H * 0.16);
        if (keyState['Enter']) {
            keyState['Enter'] = false;
            MS.sepSubPhase = 4; MS.sep2Y = H * 0.42 + 10; MS.sep2Rot = 0; MS.sepTimer = 0;
            for (let i = 0; i < 14; i++) {
                spawnParticle(W / 2 + (Math.random() - 0.5) * 30, H * 0.42 + 5,
                    (Math.random() - 0.5) * 60, Math.random() * 30 - 5,
                    1.5, 'rgba(102,252,241,.7)', 2 + Math.random() * 3);
            }
        }

    } else if (MS.sepSubPhase === 4) {
        MS.sep2Y += dt * 90; MS.sep2Rot -= dt * 0.7;
        drawCapsule(W / 2, H * 0.38, 0, true);
        if (MS.sep2Y < H + 100) drawBooster(W / 2 - (MS.sep2Y - H * 0.42) * 0.18, MS.sep2Y, MS.sep2Rot, 2);
        if (MS.sepTimer < 0.5) {
            mCtx.fillStyle = `rgba(102,252,241,${0.5 - MS.sepTimer})`;
            mCtx.beginPath(); mCtx.arc(W / 2, H * 0.38 + 15, 35, 0, Math.PI * 2); mCtx.fill();
        }
        mCtx.fillStyle = '#66fcf1'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('✓ ALL STAGES SEPARATED — CAPSULE FREE', W / 2, H * 0.16);
        setGauges(7.8, 400, MS.fuel);
        if (MS.sepTimer > 3.5) { MS.orbitAngle = 0; applyPhase(4); }
    }
}

/* Phase 4 — Earth Orbit */
function renderOrbit(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
    drawStars();

    const eX = W * 0.45, eY = H * 0.55, eR = H * 0.32;
    drawEarth(eX, eY, eR);

    const oA = eR + 60, oB = oA * 0.4;
    mCtx.strokeStyle = 'rgba(102,252,241,.18)'; mCtx.lineWidth = 1.5;
    mCtx.setLineDash([6, 6]);
    mCtx.beginPath(); mCtx.ellipse(eX, eY, oA, oB, 0, 0, Math.PI * 2); mCtx.stroke();
    mCtx.setLineDash([]);

    MS.orbitAngle += dt * 0.7;
    const cx = eX + Math.cos(MS.orbitAngle) * oA;
    const cy = eY + Math.sin(MS.orbitAngle) * oB;
    drawCapsule(cx, cy, MS.orbitAngle + Math.PI / 2, false);

    mCtx.fillStyle = 'rgba(102,252,241,.55)'; mCtx.font = 'bold 15px "Segoe UI", monospace'; mCtx.textAlign = 'center';
    mCtx.fillText('LOW EARTH ORBIT — 400 km', W / 2, H * 0.09);

    setGauges(7.8, 400, MS.fuel);

    const fl = Math.sin(performance.now() * 0.004) > 0;
    mCtx.fillStyle = fl ? '#ffd700' : '#66fcf1';
    mCtx.font = 'bold 18px "Segoe UI", monospace';
    mCtx.fillText('SPACE — Begin Trans-Lunar Injection', W / 2, H * 0.9);

    if (keyState['Space']) {
        keyState['Space'] = false;
        MS.capX = W * 0.14; MS.capY = H * 0.5;
        MS.capVX = 2.2; MS.capVY = -0.3;
        MS.capAngle = -0.3;
        MS.moonTX = W * 0.84; MS.moonTY = H * 0.32;
        MS.moonSize = 28; MS.distToMoon = 384400;
        MS.fuel = Math.max(MS.fuel, 72);
        applyPhase(5);
    }
}

/* Phase 5 — Fly to Moon */
function renderFlyToMoon(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
    drawStars();

    // Earth shrinking behind
    const eSize = Math.max(18, 85 - MS.phaseTime * 2.5);
    drawEarth(W * 0.07, H * 0.14, eSize);

    // Moon growing ahead
    MS.moonSize = Math.min(H * 0.24, 28 + MS.phaseTime * 6);
    drawMoon(MS.moonTX, MS.moonTY, MS.moonSize);

    // Controls
    const turnSpd = 2.2, thrustPow = 3.5;
    if (keyState['ArrowLeft']) MS.capAngle -= turnSpd * dt;
    if (keyState['ArrowRight']) MS.capAngle += turnSpd * dt;

    let thrusting = false;
    if (keyState['ArrowUp'] && MS.fuel > 0) {
        MS.capVX += Math.cos(MS.capAngle) * thrustPow * dt;
        MS.capVY += Math.sin(MS.capAngle) * thrustPow * dt;
        MS.fuel = Math.max(0, MS.fuel - dt * 4.5);
        thrusting = true;
    }

    MS.capX += MS.capVX * dt * 60;
    MS.capY += MS.capVY * dt * 60;

    // Distance
    const dxM = MS.moonTX - MS.capX, dyM = MS.moonTY - MS.capY;
    const distPx = Math.sqrt(dxM * dxM + dyM * dyM);
    MS.distToMoon = Math.max(0, distPx * 520);

    drawCapsule(MS.capX, MS.capY, MS.capAngle + Math.PI / 2, thrusting);

    // Direction arrow to moon
    const aToMoon = Math.atan2(dyM, dxM);
    const indD = 65;
    mCtx.save();
    mCtx.translate(MS.capX + Math.cos(aToMoon) * indD, MS.capY + Math.sin(aToMoon) * indD);
    mCtx.rotate(aToMoon);
    mCtx.fillStyle = 'rgba(102,252,241,.55)';
    mCtx.beginPath(); mCtx.moveTo(14, 0); mCtx.lineTo(-6, -7); mCtx.lineTo(-6, 7); mCtx.closePath(); mCtx.fill();
    mCtx.restore();

    // Moon label
    mCtx.fillStyle = '#66fcf1'; mCtx.font = 'bold 14px "Segoe UI", monospace'; mCtx.textAlign = 'center';
    mCtx.fillText('🌙 MOON: ' + Math.floor(MS.distToMoon).toLocaleString() + ' km', W / 2, H * 0.055);

    // Trajectory dots (fading trail)
    if (thrusting && Math.random() < 0.5) {
        spawnParticle(
            MS.capX - Math.cos(MS.capAngle) * 15,
            MS.capY - Math.sin(MS.capAngle) * 15,
            -MS.capVX * 8 + (Math.random() - 0.5) * 10,
            -MS.capVY * 8 + (Math.random() - 0.5) * 10,
            0.8, 'rgba(102,252,241,.5)', 2
        );
    }

    const capSpd = Math.sqrt(MS.capVX ** 2 + MS.capVY ** 2);
    setGauges(capSpd, Math.floor(MS.distToMoon), MS.fuel);

    // Reached moon
    if (distPx < MS.moonSize + 25) {
        MS.landerY = 55; MS.landerSpeed = 0.5; MS.landerFuel = Math.max(45, MS.fuel); MS.thrustOn = false;
        applyPhase(6);
        return;
    }

    // FAIL — off screen
    if (MS.capX < -120 || MS.capX > W + 120 || MS.capY < -120 || MS.capY > H + 120) {
        showFail('OFF COURSE', 'Your capsule drifted beyond recoverable range. The Moon is out of reach.');
        return;
    }

    // FAIL — no fuel, wrong direction
    if (MS.fuel <= 0 && distPx > MS.moonSize + 100) {
        const dot = MS.capVX * dxM + MS.capVY * dyM;
        if (dot < 0 || capSpd < 0.3) {
            showFail('FUEL DEPLETED', 'No fuel remaining. Trajectory does not reach the Moon. Mission lost in deep space.');
            return;
        }
    }
}

/* Phase 6 — Descent */
function renderDescent(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    const groundY = H * 0.72;

    // Moon sky
    const sky = mCtx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#000'); sky.addColorStop(1, '#050810');
    mCtx.fillStyle = sky; mCtx.fillRect(0, 0, W, groundY);
    drawStars();

    // Earth in sky
    mCtx.save(); mCtx.globalAlpha = 0.45;
    drawEarth(W * 0.13, H * 0.16, H * 0.09);
    mCtx.restore();

    // Moon ground
    const grd = mCtx.createLinearGradient(0, groundY, 0, H);
    grd.addColorStop(0, '#787878'); grd.addColorStop(1, '#444');
    mCtx.fillStyle = grd; mCtx.fillRect(0, groundY, W, H - groundY);

    // Craters
    [[0.15, 9, 40], [0.42, 20, 24], [0.72, 8, 34], [0.06, 14, 18], [0.58, 12, 28], [0.88, 6, 22]].forEach(([xr, yr, r]) => {
        mCtx.fillStyle = 'rgba(55,55,55,.6)';
        mCtx.beginPath(); mCtx.arc(xr * W, groundY + yr, r, 0, Math.PI, true); mCtx.fill();
    });

    // Landing pad
    mCtx.strokeStyle = 'rgba(102,252,241,.35)'; mCtx.lineWidth = 2; mCtx.setLineDash([6, 4]);
    mCtx.beginPath(); mCtx.moveTo(W / 2 - 45, groundY); mCtx.lineTo(W / 2 + 45, groundY); mCtx.stroke();
    mCtx.setLineDash([]);
    mCtx.fillStyle = 'rgba(102,252,241,.25)'; mCtx.font = '11px "Segoe UI", monospace'; mCtx.textAlign = 'center';
    mCtx.fillText('▼ LANDING ZONE ▼', W / 2, groundY - 9);

    // Surface label
    mCtx.fillStyle = 'rgba(102,252,241,.35)'; mCtx.font = '12px "Segoe UI", monospace';
    mCtx.fillText('LUNAR SURFACE — SEA OF TRANQUILITY', W / 2, groundY + H * 0.15);

    // Physics
    MS.thrustOn = keyState['Space'] || MS.thrustOn;
    const grav = 0.055;
    const brake = (MS.thrustOn && MS.landerFuel > 0) ? 0.14 : 0;

    if (MS.thrustOn && MS.landerFuel > 0) {
        MS.landerSpeed = Math.max(0, MS.landerSpeed - brake);
        MS.landerFuel = Math.max(0, MS.landerFuel - dt * 14);
    }
    MS.landerSpeed += grav;
    MS.landerY = Math.min(MS.landerY + MS.landerSpeed, groundY - 34);

    const altKm = Math.max(0, Math.floor((groundY - MS.landerY - 34) / 7));
    setGauges(MS.landerSpeed, altKm, MS.landerFuel);

    drawLander(W / 2, MS.landerY, MS.thrustOn && MS.landerFuel > 0);

    // Exhaust particles
    if (MS.thrustOn && MS.landerFuel > 0 && Math.random() < 0.4) {
        spawnParticle(W / 2 + (Math.random() - 0.5) * 16, MS.landerY + 42,
            (Math.random() - 0.5) * 30, Math.random() * 20 + 5,
            0.7, 'rgba(102,252,241,.5)', 2 + Math.random() * 2);
    }

    // Warning
    if (MS.landerSpeed > 8) {
        mCtx.fillStyle = 'rgba(255,50,50,.88)';
        mCtx.font = 'bold 18px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('⚠️  SPEED CRITICAL — FIRE THRUSTERS!', W / 2, 55);
    }

    // Action btn
    const ab = document.getElementById('mActionBtn');
    if (MS.landerSpeed < 10 && altKm < 18) {
        ab.classList.add('show'); ab.textContent = '🛬 LAND NOW!'; ab.disabled = false;
    } else if (altKm < 18) {
        ab.classList.add('show'); ab.textContent = '🛬 TOO FAST: ' + MS.landerSpeed.toFixed(1); ab.disabled = true;
    } else {
        ab.classList.remove('show');
    }

    // Landed?
    if (MS.landerY >= groundY - 35) {
        if (MS.landerSpeed > 10) {
            // CRASH
            for (let i = 0; i < 40; i++) {
                spawnParticle(W / 2 + (Math.random() - 0.5) * 60, groundY - 10,
                    (Math.random() - 0.5) * 120, -Math.random() * 80 - 20,
                    2, i % 2 === 0 ? 'rgba(255,100,0,.8)' : 'rgba(200,200,200,.6)', 3 + Math.random() * 5);
            }
            showFail('CRASH LANDING', 'Impact speed: ' + MS.landerSpeed.toFixed(1) + ' km/s — Maximum safe speed is 10 km/s. The lander was destroyed.');
        } else {
            showSuccess();
        }
    }

    // Reset thrust — must hold
    MS.thrustOn = keyState['Space'] || false;
}

/* ── THRUSTER BUTTON ── */
function mThrustOn() { MS.thrustOn = true; document.getElementById('mThrustBtn').classList.add('firing'); }
function mThrustOff() { MS.thrustOn = false; document.getElementById('mThrustBtn').classList.remove('firing'); }

function mActionClick() {
    if (missionPhase === 6 && MS.landerSpeed < 10) showSuccess();
}

/* ── SUCCESS / FAIL ── */
function showSuccess() {
    missionPhase = 99;
    const ms = document.getElementById('missionSuccess');
    if (ms) {
        ms.classList.add('show');
        if (missionPlanet === 'Moon') {
            ms.style.backgroundImage = "url('rover.gif')";
            ms.style.backgroundSize = "cover";
            ms.style.backgroundPosition = "center";
            ms.style.backgroundRepeat = "no-repeat";
            
            const badge = ms.querySelector('.ms-badge');
            if (badge) badge.style.display = 'none';
            
            const title = document.getElementById('successTitle');
            if (title) title.textContent = "Moon Landing Done";
            
            const sub = document.getElementById('successSub');
            if (sub) sub.textContent = "Explore the Moon surface with your rover!";
            
            const confirmBtn = ms.querySelector('.ms-confirm');
            if (confirmBtn) {
                confirmBtn.textContent = "Explore the Moon surface via Rover";
                confirmBtn.onclick = function() {
                    ResourceState.colonizePlanet('Moon');
                    sessionStorage.setItem('sc_keldey_station_completed', 'true');
                    window.location.href = 'planet-moon-rover.html';
                };
            }
        } else {
            ms.style.backgroundImage = 'none';
            const badge = ms.querySelector('.ms-badge');
            if (badge) badge.style.display = 'flex';
            
            const title = document.getElementById('successTitle');
            if (title) title.textContent = missionPlanet.toUpperCase() + ' LANDING SUCCESS!';
            
            const sub = document.getElementById('successSub');
            if (sub) sub.textContent = "You guided your spacecraft and landed safely!";
            
            const confirmBtn = ms.querySelector('.ms-confirm');
            if (confirmBtn) {
                confirmBtn.textContent = "🌟 CONFIRM COLONIZATION";
                confirmBtn.onclick = confirmColonization;
            }
        }
    }
    MS.shakeIntensity = 0;
}
function showFail(title, sub) {
    missionPhase = 99;
    document.getElementById('failTitle').textContent = title;
    document.getElementById('failSub').textContent = sub;
    document.getElementById('missionFail').classList.add('show');
    MS.shakeIntensity = 0;
}

function confirmColonization() {
    document.getElementById('missionSuccess').classList.remove('show');
    document.getElementById('missionOverlay').classList.remove('active');
    if (missionRafId) cancelAnimationFrame(missionRafId);
    missionActive = false;
    ResourceState.colonizePlanet(missionPlanet);
    if (typeof renderPlanetSection === 'function') renderPlanetSection();
    
    if (missionPlanet === 'Moon') {
        sessionStorage.setItem('sc_keldey_station_completed', 'true');
        window.location.href = 'game.html?keldey_station_unlocked=true';
    } else {
        if (typeof showNotification === 'function') showNotification('🎉 ' + missionPlanet + ' has been colonized! A new planet may have been unlocked!');
    }
}

function retryMission() {
    document.getElementById('missionFail').classList.remove('show');
    if (missionPlanet === 'Moon') {
        startMissionFromOrbit(missionPlanet);
    } else {
        startMission(missionPlanet);
    }
}

/* ── RESIZE ── */
window.addEventListener('resize', () => {
    if (missionActive) { mCanvas.width = window.innerWidth; mCanvas.height = window.innerHeight; }
});

console.log('🚀 Mission system loaded');

/* ══════════════════════════════════════════════════════════════════════
   V2 OVERRIDES — Realistic atmosphere ascent, gravity turn,
   tilted stage separations, manual orbit insertion.
   Later function declarations override earlier ones.
══════════════════════════════════════════════════════════════════════ */

function initClouds() {
    MS.clouds = [];
    for (let i = 0; i < 25; i++) {
        MS.clouds.push({
            x: Math.random(),
            y: Math.random() * 1.4 - 0.2,
            w: 60 + Math.random() * 120,
            h: 15 + Math.random() * 30,
            opacity: 0.08 + Math.random() * 0.18,
            speed: 0.4 + Math.random() * 0.6
        });
    }
}

function drawAtmosphere(blend) {
    const W = mCanvas.width, H = mCanvas.height;
    const sky = mCtx.createLinearGradient(0, 0, 0, H);
    const bR = Math.round(lerp(30, 0, blend)), bG = Math.round(lerp(60, 0, blend)), bB = Math.round(lerp(150, 3, blend));
    const tR = Math.round(lerp(5, 0, blend)),  tG = Math.round(lerp(12, 0, blend)), tB = Math.round(lerp(60, 0, blend));
    sky.addColorStop(0, `rgb(${tR},${tG},${tB})`);
    sky.addColorStop(1, `rgb(${bR},${bG},${bB})`);
    mCtx.fillStyle = sky; mCtx.fillRect(0, 0, W, H);
    if (blend > 0.2) { mCtx.globalAlpha = Math.min(1, (blend - 0.2) / 0.6); drawStars(); mCtx.globalAlpha = 1; }
}

function drawClouds(speed, dt) {
    const W = mCanvas.width, H = mCanvas.height;
    MS.clouds.forEach(c => {
        c.y += c.speed * speed * dt * 0.12;
        if (c.y > 1.3) { c.y = -0.15; c.x = Math.random(); c.w = 60 + Math.random() * 120; }
        mCtx.fillStyle = `rgba(255,255,255,${c.opacity})`;
        mCtx.beginPath(); mCtx.ellipse(c.x * W, c.y * H, c.w, c.h, 0, 0, Math.PI * 2); mCtx.fill();
    });
}

/* ════  PHASE 2 — LIFTOFF (OVERRIDE)  ════
   Sub 0: Initial ascent (0-3s) — Kennedy ground visible
   Sub 1: Atmosphere climb — clouds streaming, no ground
   Sub 2: Gravity turn — press ←, rocket tilts, sky blue→black
*/
function renderLiftoff(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    const holdUp = keyState['ArrowUp'];
    const holdLeft = keyState['ArrowLeft'];

    if (MS.liftoffSubPhase === 0) {
        if (holdUp) { MS.speed = Math.min(MS.speed + dt * 1.6, 4.0); }
        else { MS.speed = Math.max(0, MS.speed - dt * 0.5); }
        MS.altitude += MS.speed * dt * 55;
        MS.fuel = Math.max(0, MS.fuel - dt * 2.0);
        const tgtCam = Math.max(0, MS.altitude * 0.85);
        MS.camY += (tgtCam - MS.camY) * 0.06;
        MS.skyBlend = Math.min(0.15, MS.altitude / 900);
        const sY = MS.rocketY - MS.camY + H * 0.28;
        MS.rocketX = W / 2 + Math.sin(MS.altitude * 0.018) * 6;
        MS.shakeIntensity = Math.max(0, 5 - MS.altitude * 0.015);
        drawKennedySurface();
        drawRocket(MS.rocketX, Math.min(sY, H * 0.52), 1.2, holdUp, true, true);
        if (MS.altitude < 100) drawSmoke(MS.rocketX, Math.min(sY + 85, H + 20), 0.5);
        if (holdUp && Math.random() < 0.3)
            spawnParticle(MS.rocketX + (Math.random() - 0.5) * 20, Math.min(sY + 80, H),
                (Math.random() - 0.5) * 25, Math.random() * 20 + 8, 1, 'rgba(255,140,0,.6)', 3 + Math.random() * 3);
        setGauges(MS.speed, MS.altitude, MS.fuel);
        if (!holdUp && MS.speed < 0.5 && MS.phaseTime > 1) {
            mCtx.fillStyle = 'rgba(255,80,80,.85)'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
            mCtx.fillText('⚠️  HOLD ↑ TO MAINTAIN THRUST!', W / 2, H * 0.25);
        }
        if (MS.speed <= 0 && MS.phaseTime > 2) {
            showFail('ENGINE STALL', 'Rocket lost all thrust and could not maintain altitude. Hold ↑ to keep engines firing!');
            return;
        }
        if (MS.phaseTime > 3 && MS.altitude > 60) {
            MS.liftoffSubPhase = 1; MS.phaseTime = 0; initClouds();
            document.getElementById('mPromptText').innerHTML = '<strong>🚀 Climbing through atmosphere!</strong><br>Keep holding <kbd>↑</kbd> to maintain thrust';
        }
    }
    else if (MS.liftoffSubPhase === 1) {
        if (holdUp) { MS.speed = Math.min(MS.speed + dt * 1.8, 6.5); }
        else { MS.speed = Math.max(0, MS.speed - dt * 0.8); }
        MS.altitude += MS.speed * dt * 55;
        MS.fuel = Math.max(0, MS.fuel - dt * 2.2);
        MS.skyBlend = Math.min(0.25, 0.05 + MS.phaseTime / 18);
        drawAtmosphere(MS.skyBlend);
        if (MS.skyBlend < 0.7) drawClouds(MS.speed, dt);
        MS.rocketX = W / 2 + Math.sin(MS.altitude * 0.01) * 4;
        const ry = H * 0.45;
        MS.shakeIntensity = holdUp ? 3 : 0;
        drawRocket(MS.rocketX, ry, 1.2, holdUp, true, true);
        if (holdUp && Math.random() < 0.3)
            spawnParticle(MS.rocketX + (Math.random() - 0.5) * 20, ry + 80,
                (Math.random() - 0.5) * 30, Math.random() * 30 + 10, 0.8, 'rgba(255,140,0,.6)', 3 + Math.random() * 3);
        setGauges(MS.speed, MS.altitude, MS.fuel);
        if (!holdUp && MS.speed < 0.3 && MS.phaseTime > 1) {
            mCtx.fillStyle = 'rgba(255,80,80,.85)'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
            mCtx.fillText('⚠️  HOLD ↑ TO MAINTAIN THRUST!', W / 2, H * 0.25);
        }
        if (MS.speed <= 0 && MS.phaseTime > 2) {
            showFail('ENGINE STALL', 'Rocket lost thrust in the atmosphere. Keep holding ↑!');
            return;
        }
        if (MS.phaseTime > 3.5) {
            MS.liftoffSubPhase = 2; MS.phaseTime = 0;
            document.getElementById('mPromptText').innerHTML = '<strong>🔄 Gravity Turn!</strong><br>Hold <kbd>←</kbd> + <kbd>↑</kbd> to tilt for orbital insertion';
        }
    }
    else if (MS.liftoffSubPhase === 2) {
        if (holdUp) { MS.speed = Math.min(MS.speed + dt * 2.0, 9.0); }
        else { MS.speed = Math.max(0, MS.speed - dt * 1.0); }
        MS.altitude += MS.speed * dt * 55;
        MS.fuel = Math.max(0, MS.fuel - dt * 2.5);
        if (holdLeft) MS.rocketTilt = Math.min(MS.rocketTilt + dt * 0.35, 0.52);
        MS.skyBlend = Math.min(0.85, 0.25 + MS.phaseTime / 8);
        drawAtmosphere(MS.skyBlend);
        if (MS.skyBlend < 0.7) drawClouds(MS.speed * 0.4, dt);
        const ry = H * 0.45;
        MS.shakeIntensity = holdUp ? 2 : 0;
        mCtx.save(); mCtx.translate(W / 2, ry); mCtx.rotate(-MS.rocketTilt); mCtx.translate(-W / 2, -ry);
        drawRocket(W / 2, ry, 1.2, holdUp, true, true);
        mCtx.restore();
        if (holdUp && Math.random() < 0.3) {
            const ea = Math.PI / 2 + MS.rocketTilt;
            spawnParticle(W / 2 + Math.cos(ea) * 75 + (Math.random() - 0.5) * 20, ry + Math.sin(ea) * 75,
                Math.cos(ea) * 25 + (Math.random() - 0.5) * 15, Math.sin(ea) * 25 + Math.random() * 8,
                0.8, 'rgba(255,140,0,.6)', 3 + Math.random() * 3);
        }
        setGauges(MS.speed, MS.altitude, MS.fuel);
        const td = Math.floor(MS.rocketTilt * 180 / Math.PI);
        mCtx.fillStyle = 'rgba(102,252,241,.55)'; mCtx.font = 'bold 13px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('TILT: ' + td + '°', W / 2, 40);
        if (!holdLeft && MS.rocketTilt < 0.15 && MS.phaseTime > 1) {
            const bk = Math.sin(performance.now() * 0.005) > 0;
            mCtx.fillStyle = bk ? '#ffd700' : 'rgba(255,255,255,.6)'; mCtx.font = 'bold 15px "Segoe UI", monospace';
            mCtx.fillText('← PRESS LEFT ARROW TO TILT', W / 2, H * 0.22);
        }
        if (MS.rocketTilt > 0.25 && MS.phaseTime > 3) { MS.sepSubPhase = 0; MS.sepTimer = 0; applyPhase(3); }
    }
    mCtx.fillStyle = 'rgba(102,252,241,.5)'; mCtx.font = 'bold 14px "Segoe UI", monospace'; mCtx.textAlign = 'center';
    mCtx.fillText('ALT: ' + Math.floor(MS.altitude) + ' km  |  SPD: ' + MS.speed.toFixed(1) + ' km/s', W / 2, 60);
}

/* ════  PHASE 3 — SEPARATION (OVERRIDE)  ════ */
function renderSeparation(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    const holdUp = keyState['ArrowUp'];
    const holdLeft = keyState['ArrowLeft'];
    const prompt = document.getElementById('mPromptText');
    MS.skyBlend = Math.min(1.0, MS.skyBlend + dt * 0.06);
    if (holdLeft && MS.rocketTilt < 0.65) MS.rocketTilt += dt * 0.08;
    if (holdUp) { MS.speed = Math.min(MS.speed + dt * 1.5, 9.8); }
    else { MS.speed = Math.max(0, MS.speed - dt * 0.6); }
    MS.altitude += MS.speed * dt * 50;
    MS.fuel = Math.max(0, MS.fuel - dt * 1.5);
    if (MS.speed <= 0 && MS.sepSubPhase < 4) {
        showFail('THRUST LOST', 'Rocket lost all velocity during staging. Keep holding ↑ to maintain thrust!');
        return;
    }
    drawAtmosphere(MS.skyBlend);
    if (MS.skyBlend < 0.65) drawClouds(MS.speed * 0.2, dt);
    const ry = H * 0.42;
    MS.sepTimer += dt;

    if (MS.sepSubPhase === 0) {
        MS.shakeIntensity = holdUp ? 2 : 0;
        mCtx.save(); mCtx.translate(W / 2, ry); mCtx.rotate(-MS.rocketTilt); mCtx.translate(-W / 2, -ry);
        drawRocket(W / 2, ry, 1.2, holdUp, true, true); mCtx.restore();
        setGauges(MS.speed, MS.altitude, MS.fuel);
        if (MS.sepTimer > 2.5) {
            MS.sepSubPhase = 1;
            prompt.innerHTML = '<strong>⚡ 1st Stage Separation!</strong><br>Press <kbd>Enter</kbd> to release spent booster';
        }
    } else if (MS.sepSubPhase === 1) {
        mCtx.save(); mCtx.translate(W / 2, ry); mCtx.rotate(-MS.rocketTilt); mCtx.translate(-W / 2, -ry);
        drawRocket(W / 2, ry, 1.2, holdUp, true, true); mCtx.restore();
        setGauges(MS.speed, MS.altitude, MS.fuel);
        const fl = Math.sin(performance.now() * 0.006) > 0;
        mCtx.fillStyle = fl ? '#ffd700' : '#66fcf1'; mCtx.font = 'bold 20px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('⏎ PRESS ENTER — 1ST STAGE SEPARATION', W / 2, H * 0.16);
        MS.shakeIntensity = 1;
        if (keyState['Enter']) {
            keyState['Enter'] = false; MS.sepSubPhase = 2; MS.sep1Y = ry + 55; MS.sep1Rot = -MS.rocketTilt; MS.sepTimer = 0;
            for (let i = 0; i < 18; i++) spawnParticle(W / 2 + (Math.random() - 0.5) * 40, ry + 30,
                (Math.random() - 0.5) * 80, Math.random() * 40 - 10, 1.8, 'rgba(255,220,50,.8)', 2 + Math.random() * 3);
        }
    } else if (MS.sepSubPhase === 2) {
        MS.sep1Y += dt * 130; MS.sep1Rot += dt * 0.9;
        mCtx.save(); mCtx.translate(W / 2, ry); mCtx.rotate(-MS.rocketTilt); mCtx.translate(-W / 2, -ry);
        drawRocket(W / 2, ry, 1.2, holdUp, false, true); mCtx.restore();
        if (MS.sep1Y < H + 120) drawBooster(W / 2 + (MS.sep1Y - ry) * 0.3, MS.sep1Y, MS.sep1Rot, 1);
        if (MS.sepTimer < 0.6) {
            mCtx.fillStyle = `rgba(255,220,50,${0.6 - MS.sepTimer})`;
            mCtx.beginPath(); mCtx.arc(W / 2, ry + 22, 45, 0, Math.PI * 2); mCtx.fill();
        }
        mCtx.fillStyle = '#66fcf1'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('✓ 1ST STAGE SEPARATED', W / 2, H * 0.16);
        setGauges(MS.speed, MS.altitude, MS.fuel); MS.shakeIntensity = 0;
        if (MS.sepTimer > 4) {
            MS.sepSubPhase = 3; MS.sepTimer = 0;
            prompt.innerHTML = '<strong>⚡ 2nd Stage Separation!</strong><br>Press <kbd>Enter</kbd> to release 2nd booster';
        }
    } else if (MS.sepSubPhase === 3) {
        mCtx.save(); mCtx.translate(W / 2, ry); mCtx.rotate(-MS.rocketTilt); mCtx.translate(-W / 2, -ry);
        drawRocket(W / 2, ry, 1.2, holdUp, false, true); mCtx.restore();
        setGauges(MS.speed, MS.altitude, MS.fuel);
        const fl = Math.sin(performance.now() * 0.006) > 0;
        mCtx.fillStyle = fl ? '#ffd700' : '#66fcf1'; mCtx.font = 'bold 20px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('⏎ PRESS ENTER — 2ND STAGE SEPARATION', W / 2, H * 0.16);
        if (keyState['Enter']) {
            keyState['Enter'] = false; MS.sepSubPhase = 4; MS.sep2Y = ry + 10; MS.sep2Rot = -MS.rocketTilt; MS.sepTimer = 0;
            for (let i = 0; i < 14; i++) spawnParticle(W / 2 + (Math.random() - 0.5) * 30, ry + 5,
                (Math.random() - 0.5) * 60, Math.random() * 30 - 5, 1.5, 'rgba(102,252,241,.7)', 2 + Math.random() * 3);
        }
    } else if (MS.sepSubPhase === 4) {
        MS.sep2Y += dt * 90; MS.sep2Rot -= dt * 0.7;
        mCtx.save(); mCtx.translate(W / 2, H * 0.38); mCtx.rotate(-MS.rocketTilt); mCtx.translate(-W / 2, -H * 0.38);
        drawCapsule(W / 2, H * 0.38, 0, holdUp); mCtx.restore();
        if (MS.sep2Y < H + 100) drawBooster(W / 2 - (MS.sep2Y - ry) * 0.2, MS.sep2Y, MS.sep2Rot, 2);
        if (MS.sepTimer < 0.5) {
            mCtx.fillStyle = `rgba(102,252,241,${0.5 - MS.sepTimer})`;
            mCtx.beginPath(); mCtx.arc(W / 2, H * 0.38 + 15, 35, 0, Math.PI * 2); mCtx.fill();
        }
        mCtx.fillStyle = '#66fcf1'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('✓ ALL STAGES SEPARATED — CAPSULE FREE', W / 2, H * 0.16);
        setGauges(7.8, MS.altitude, MS.fuel);
        if (MS.sepTimer > 3.5) {
            MS.orbitSubPhase = 0; MS.orbitVelocity = Math.min(MS.speed, 5.5); MS.orbitInsertAngle = MS.rocketTilt;
            applyPhase(4);
        }
    }
    mCtx.fillStyle = 'rgba(102,252,241,.45)'; mCtx.font = 'bold 13px "Segoe UI", monospace'; mCtx.textAlign = 'center';
    mCtx.fillText('ALT: ' + Math.floor(MS.altitude) + ' km  |  SPD: ' + MS.speed.toFixed(1) + ' km/s', W / 2, 40);
}

/* ════  PHASE 4 — ORBIT (OVERRIDE)  ════
   Sub 0: Capsule rises from Earth surface — cinematic
   Sub 1: Manual orbit insertion — arc from surface upward using ← + ↑
   Sub 2: Stable orbit — capsule orbiting, press Space for TLI
*/
function renderOrbit(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    const eR = H * 1.1;
    const eCenterY = H + eR * 0.58;
    const surfaceY = eCenterY - eR; // top of Earth curvature

    if (MS.orbitSubPhase === 0) {
        /* ── Capsule rises FROM Earth surface ── */
        const t = Math.min(1, MS.phaseTime / 3);
        mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);

        mCtx.globalAlpha = Math.min(1, t * 1.8); drawStars(); mCtx.globalAlpha = 1;

        drawEarth(W * 0.5, eCenterY, eR);

        // Atmosphere glow
        const ag = mCtx.createRadialGradient(W * 0.5, eCenterY, eR, W * 0.5, eCenterY, eR + 25);
        ag.addColorStop(0, `rgba(100,180,255,${0.2 * t})`); ag.addColorStop(1, 'rgba(100,180,255,0)');
        mCtx.fillStyle = ag; mCtx.beginPath(); mCtx.arc(W * 0.5, eCenterY, eR + 25, Math.PI, 0); mCtx.fill();

        // Capsule rises from surface
        const capX = W * 0.5 + t * t * W * 0.04;
        const capY = lerp(surfaceY - 5, surfaceY - 80, t * t);
        const capAngle = lerp(0, -0.35, t);

        // Engine glow at launch point
        if (t < 0.5) {
            const glR = 15 + t * 30;
            const glow = mCtx.createRadialGradient(W * 0.5, surfaceY + 5, 0, W * 0.5, surfaceY + 5, glR);
            glow.addColorStop(0, `rgba(255,160,0,${0.6 - t})`); glow.addColorStop(1, 'rgba(255,80,0,0)');
            mCtx.fillStyle = glow; mCtx.beginPath(); mCtx.arc(W * 0.5, surfaceY + 5, glR, 0, Math.PI * 2); mCtx.fill();
        }

        // Exhaust
        if (t > 0.08 && Math.random() < 0.3) {
            spawnParticle(capX + (Math.random() - 0.5) * 8, capY + 18,
                (Math.random() - 0.5) * 12, Math.random() * 20 + 8,
                0.6, 'rgba(255,160,0,.5)', 2 + Math.random() * 2);
        }

        drawCapsule(capX, capY, capAngle, t > 0.05);

        mCtx.fillStyle = `rgba(102,252,241,${Math.min(1, t * 2.5)})`;
        mCtx.font = 'bold 17px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('RISING FROM EARTH SURFACE...', W / 2, H * 0.08);

        const dispAlt = Math.floor(lerp(MS.altitude, 300, t));
        mCtx.fillStyle = 'rgba(255,255,255,.4)'; mCtx.font = '12px "Segoe UI", monospace';
        mCtx.fillText('ALT: ' + dispAlt + ' km  |  PREPARING CIRCULARIZATION BURN', W / 2, H * 0.14);

        setGauges(lerp(MS.speed, 5.0, t), dispAlt, MS.fuel);
        MS.shakeIntensity = (1 - t) * 3;

        if (MS.phaseTime > 3) {
            MS.orbitSubPhase = 1; MS.phaseTime = 0;
            MS.orbitInsertAngle = 0.05;
            MS.orbitVelocity = Math.min(MS.speed, 3.0);
            MS.altitude = 300;
            document.getElementById('mPromptText').innerHTML = '<strong>🌍 Orbit Insertion</strong><br>Hold <kbd>↑</kbd> to thrust — circularize into stable orbit!';
        }
    }
    else if (MS.orbitSubPhase === 1) {
        /* ── Manual orbit insertion — capsule arcs FROM surface into orbit ── */
        mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
        drawStars();

        drawEarth(W * 0.5, eCenterY, eR);

        // Atmosphere glow
        const ag = mCtx.createRadialGradient(W * 0.5, eCenterY, eR, W * 0.5, eCenterY, eR + 20);
        ag.addColorStop(0, 'rgba(100,180,255,.15)'); ag.addColorStop(1, 'rgba(100,180,255,0)');
        mCtx.fillStyle = ag; mCtx.beginPath(); mCtx.arc(W * 0.5, eCenterY, eR + 20, Math.PI, 0); mCtx.fill();

        // ONLY hold Up Arrow to thrust.
        const holdUp = keyState['ArrowUp'];
        
        let thrusting = false;
        if (holdUp && MS.fuel > 0) {
            // Speed circularization burn
            MS.orbitVelocity = Math.min(MS.orbitVelocity + dt * 1.15, 7.8);
            MS.fuel = Math.max(0, MS.fuel - dt * 1.5);
            thrusting = true;
        }

        // Velocity progress: starts at 0% when velocity is 3.0, and reaches 100% when velocity is 7.8
        const progress = Math.max(0, Math.min(1, (MS.orbitVelocity - 3.0) / (7.8 - 3.0)));

        // Concentric geometry: capsule arcs along a circle concentric to Earth's surface
        const posT = progress;
        const currentAngle = Math.PI * 1.5 + posT * 0.42; // sweep to the right
        const currentR = eR + lerp(18, 140, posT); // rise from 18px to 140px above surface
        
        const cx = W * 0.5 + Math.cos(currentAngle) * currentR;
        const cy = eCenterY + Math.sin(currentAngle) * currentR;

        // Capsule angle aligns with the direction of motion
        const capAngle = posT * (Math.PI / 2 - 0.1);
        drawCapsule(cx, cy, capAngle, thrusting);

        // Exhaust plume particles (larger & more superb)
        if (thrusting) {
            const ea = capAngle + Math.PI;
            for (let i = 0; i < 2; i++) {
                spawnParticle(cx + Math.cos(ea) * 18, cy + Math.sin(ea) * 18,
                    Math.cos(ea) * (30 + Math.random()*15) + (Math.random() - 0.5) * 10, 
                    Math.sin(ea) * (30 + Math.random()*15) + (Math.random() - 0.5) * 10,
                    0.8, 'rgba(255, 140, 0, .8)', 2.5 + Math.random() * 2.5);
            }
        }

        // ── Trajectory trail — beautiful concentric neon line behind capsule ──
        mCtx.strokeStyle = 'rgba(102, 252, 241, 0.45)'; mCtx.lineWidth = 2.5;
        mCtx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const tt = (i / 30) * posT;
            const tAngle = Math.PI * 1.5 + tt * 0.42;
            const tR = eR + lerp(18, 140, tt);
            const tx = W * 0.5 + Math.cos(tAngle) * tR;
            const ty = eCenterY + Math.sin(tAngle) * tR;
            if (i === 0) mCtx.moveTo(tx, ty); else mCtx.lineTo(tx, ty);
        }
        mCtx.stroke();

        // ── Target Orbit Line — concentric circle arc centered on Earth center ──
        const orbitAlpha = 0.15 + progress * 0.45;
        mCtx.strokeStyle = lerpCol('#66fcf1', '#00f5d4', progress);
        mCtx.lineWidth = 1.5 + progress * 1.5;
        
        mCtx.save();
        mCtx.globalAlpha = orbitAlpha;
        mCtx.setLineDash([8, 4]);
        mCtx.beginPath();
        mCtx.arc(W * 0.5, eCenterY, eR + 140, Math.PI * 1.3, Math.PI * 1.7);
        mCtx.stroke();
        mCtx.restore();

        // ── Launch marker at origin ──
        mCtx.fillStyle = 'rgba(255,160,0,.6)';
        mCtx.beginPath(); mCtx.arc(W * 0.5, surfaceY - 5, 4, 0, Math.PI * 2); mCtx.fill();
        mCtx.fillStyle = 'rgba(255,255,255,.3)'; mCtx.font = '10px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('LAUNCH', W * 0.5, surfaceY - 14);

        // ── Live Orbital Flight Computer Telemetry HUD (Superb details) ──
        const hudW = 260, hudH = 125;
        const hx = W - hudW - 24, hy = H * 0.22;
        
        mCtx.fillStyle = 'rgba(6, 18, 36, 0.9)';
        mCtx.strokeStyle = 'rgba(102, 252, 241, 0.4)';
        mCtx.lineWidth = 1;
        mCtx.beginPath();
        mCtx.roundRect(hx, hy, hudW, hudH, 10);
        mCtx.fill(); mCtx.stroke();
        
        mCtx.fillStyle = 'rgba(102,252,241,0.6)';
        mCtx.font = 'bold 11px "Segoe UI", monospace';
        mCtx.textAlign = 'left';
        mCtx.fillText('ORBITAL DATA FLIGHT COMPUTER', hx + 16, hy + 22);
        
        // Compute active metrics
        const ecc = Math.max(0.00, 0.98 - progress * 0.98);
        const peri = Math.round(80 + progress * 240);
        const apo = Math.round(300 + progress * 20);
        
        drawHUDLine(hx + 16, hy + 45, 'APOAPSIS', apo + ' km', '#ffd700');
        drawHUDLine(hx + 16, hy + 68, 'PERIAPSIS', peri + ' km', peri > 150 ? '#00f5d4' : '#ff4757');
        drawHUDLine(hx + 16, hy + 91, 'ECCENTRICITY', ecc.toFixed(3), ecc < 0.1 ? '#00f5d4' : '#ffb703');
        drawHUDLine(hx + 16, hy + 114, 'ORBIT SPEED', MS.orbitVelocity.toFixed(2) + ' km/s', progress > 0.9 ? '#00f5d4' : '#ff8c00');

        // ── Velocity progress bar HUD at bottom ──
        const targetV = 7.8, velPct = Math.min(1, MS.orbitVelocity / targetV);
        const barW = 320, barH = 12, barX = (W - barW) / 2, barY = H * 0.88;

        mCtx.fillStyle = 'rgba(6,18,36,.88)'; mCtx.strokeStyle = 'rgba(102,252,241,.35)'; mCtx.lineWidth = 1;
        mCtx.beginPath(); mCtx.roundRect(barX - 10, barY - 26, barW + 20, barH + 40, 10); mCtx.fill(); mCtx.stroke();
        mCtx.fillStyle = 'rgba(255,255,255,.08)'; mCtx.fillRect(barX, barY, barW, barH);
        mCtx.fillStyle = velPct >= 1 ? 'rgba(0,245,212,.95)' : velPct > 0.7 ? 'rgba(255,215,0,.9)' : 'rgba(255,107,53,.9)';
        mCtx.fillRect(barX, barY, barW * velPct, barH);

        mCtx.fillStyle = 'rgba(255,255,255,.55)'; mCtx.font = '11px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('CIRCULARIZATION BURN: ' + MS.orbitVelocity.toFixed(2) + ' / ' + targetV + ' km/s', W / 2, barY - 8);

        // Target marker line on bar
        mCtx.strokeStyle = '#66fcf1'; mCtx.lineWidth = 2;
        mCtx.beginPath(); mCtx.moveTo(barX + barW, barY - 3); mCtx.lineTo(barX + barW, barY + barH + 3); mCtx.stroke();

        // Instruction
        if (velPct < 1) {
            const blink = Math.sin(performance.now() * 0.005) > 0;
            mCtx.fillStyle = blink ? '#ffd700' : 'rgba(255,255,255,.6)'; mCtx.font = 'bold 14px "Segoe UI", monospace'; mCtx.textAlign = 'center';
            mCtx.fillText('Hold ↑ to fire engines — circularize into stable orbit!', W / 2, H * 0.12);
        }

        MS.shakeIntensity = thrusting ? 1.5 : 0;
        setGauges(MS.orbitVelocity, peri, MS.fuel);

        // Orbit achieved!
        if (MS.orbitVelocity >= 7.8) {
            // Spawn circularization shockwave flash effect
            for (let i = 0; i < 40; i++) {
                spawnParticle(
                    cx, cy,
                    (Math.random() - 0.5) * 120,
                    (Math.random() - 0.5) * 120,
                    1.2,
                    'rgba(102,252,241,.8)',
                    2 + Math.random() * 3
                );
            }
            MS.orbitSubPhase = 2; MS.orbitAngle = 0; MS.phaseTime = 0;
            MS.fuel = Math.max(MS.fuel, 55);
            document.getElementById('mPromptText').innerHTML = '<strong>🌍 Stable Earth Orbit Achieved!</strong><br>Press <kbd>Space</kbd> to fire thrusters — escape Earth gravity toward the Moon!';
        }
    }
    else {
        /* ── Sub 2: Realistic orbit view + TLI prompt ── */
        mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
        drawStars();

        // Earth with atmosphere glow
        const eX = W * 0.42, eY2 = H * 0.52, eR2 = H * 0.34;
        drawEarth(eX, eY2, eR2);

        // Atmosphere layers
        const atm1 = mCtx.createRadialGradient(eX, eY2, eR2, eX, eY2, eR2 + 18);
        atm1.addColorStop(0, 'rgba(100,180,255,.12)'); atm1.addColorStop(1, 'rgba(100,180,255,0)');
        mCtx.fillStyle = atm1; mCtx.beginPath(); mCtx.arc(eX, eY2, eR2 + 18, 0, Math.PI * 2); mCtx.fill();
        const atm2 = mCtx.createRadialGradient(eX, eY2, eR2 + 15, eX, eY2, eR2 + 35);
        atm2.addColorStop(0, 'rgba(80,140,220,.06)'); atm2.addColorStop(1, 'rgba(80,140,220,0)');
        mCtx.fillStyle = atm2; mCtx.beginPath(); mCtx.arc(eX, eY2, eR2 + 35, 0, Math.PI * 2); mCtx.fill();

        // Orbit ellipse — tilted for realism
        const oA = eR2 + 65, oB = oA * 0.38;
        const orbitTilt = -0.15; // slight tilt

        mCtx.save(); mCtx.translate(eX, eY2); mCtx.rotate(orbitTilt); mCtx.translate(-eX, -eY2);

        // Orbit path glow
        mCtx.strokeStyle = 'rgba(102,252,241,.06)'; mCtx.lineWidth = 6;
        mCtx.beginPath(); mCtx.ellipse(eX, eY2, oA, oB, 0, 0, Math.PI * 2); mCtx.stroke();
        // Orbit path line
        mCtx.strokeStyle = 'rgba(102,252,241,.2)'; mCtx.lineWidth = 1.5; mCtx.setLineDash([8, 5]);
        mCtx.beginPath(); mCtx.ellipse(eX, eY2, oA, oB, 0, 0, Math.PI * 2); mCtx.stroke();
        mCtx.setLineDash([]);

        // Orbit trail — glowing dots behind capsule
        MS.orbitAngle += dt * 0.6;
        for (let i = 1; i <= 15; i++) {
            const tA = MS.orbitAngle - i * 0.08;
            const tx = eX + Math.cos(tA) * oA, ty = eY2 + Math.sin(tA) * oB;
            const alpha = 0.4 - i * 0.025;
            const r = 3 - i * 0.15;
            if (alpha > 0 && r > 0) {
                mCtx.fillStyle = `rgba(102,252,241,${alpha})`;
                mCtx.beginPath(); mCtx.arc(tx, ty, r, 0, Math.PI * 2); mCtx.fill();
            }
        }

        // Capsule on orbit
        const cx = eX + Math.cos(MS.orbitAngle) * oA;
        const cy = eY2 + Math.sin(MS.orbitAngle) * oB;

        mCtx.restore(); // undo orbit tilt for capsule drawing

        // Recalculate with tilt applied
        const cosT = Math.cos(orbitTilt), sinT = Math.sin(orbitTilt);
        const rawX = Math.cos(MS.orbitAngle) * oA, rawY = Math.sin(MS.orbitAngle) * oB;
        const tcx = eX + rawX * cosT - rawY * sinT;
        const tcy = eY2 + rawX * sinT + rawY * cosT;

        // Capsule glow
        const capGlow = mCtx.createRadialGradient(tcx, tcy, 0, tcx, tcy, 15);
        capGlow.addColorStop(0, 'rgba(102,252,241,.15)'); capGlow.addColorStop(1, 'rgba(102,252,241,0)');
        mCtx.fillStyle = capGlow; mCtx.beginPath(); mCtx.arc(tcx, tcy, 15, 0, Math.PI * 2); mCtx.fill();

        drawCapsule(tcx, tcy, MS.orbitAngle + orbitTilt + Math.PI / 2, false);

        // ── Moon in the distance (hint for TLI) ──
        const moonX = W * 0.88, moonY = H * 0.18, moonR = 14;
        mCtx.fillStyle = '#ddd'; mCtx.beginPath(); mCtx.arc(moonX, moonY, moonR, 0, Math.PI * 2); mCtx.fill();
        // Moon craters
        mCtx.fillStyle = 'rgba(180,180,180,.4)';
        mCtx.beginPath(); mCtx.arc(moonX - 4, moonY - 3, 3, 0, Math.PI * 2); mCtx.fill();
        mCtx.beginPath(); mCtx.arc(moonX + 5, moonY + 4, 2.5, 0, Math.PI * 2); mCtx.fill();
        mCtx.beginPath(); mCtx.arc(moonX + 1, moonY - 6, 1.8, 0, Math.PI * 2); mCtx.fill();
        // Moon label
        mCtx.fillStyle = 'rgba(255,255,255,.35)'; mCtx.font = '10px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('MOON', moonX, moonY + moonR + 12);
        mCtx.fillText('384,400 km', moonX, moonY + moonR + 23);

        // Dashed line from capsule toward Moon
        const pulseFade = 0.1 + Math.sin(performance.now() * 0.003) * 0.06;
        mCtx.strokeStyle = `rgba(255,215,0,${pulseFade})`; mCtx.lineWidth = 1; mCtx.setLineDash([4, 8]);
        mCtx.beginPath(); mCtx.moveTo(tcx, tcy); mCtx.lineTo(moonX, moonY); mCtx.stroke();
        mCtx.setLineDash([]);

        // ── Labels ──
        mCtx.fillStyle = 'rgba(102,252,241,.6)'; mCtx.font = 'bold 16px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('✔  STABLE EARTH ORBIT — 400 km', W / 2, H * 0.07);

        mCtx.fillStyle = 'rgba(255,255,255,.3)'; mCtx.font = '12px "Segoe UI", monospace';
        mCtx.fillText('Velocity: 7.8 km/s  |  Period: 92 min  |  Inclination: 28.5°', W / 2, H * 0.12);

        setGauges(7.8, 400, MS.fuel);

        // ── TLI Button prompt ──
        const fl = Math.sin(performance.now() * 0.003) > 0;
        const pulseScale = 1 + Math.sin(performance.now() * 0.005) * 0.03;

        mCtx.save(); mCtx.translate(W / 2, H * 0.88); mCtx.scale(pulseScale, pulseScale);
        // Button background
        mCtx.fillStyle = 'rgba(255,180,0,.12)'; mCtx.strokeStyle = fl ? 'rgba(255,215,0,.6)' : 'rgba(102,252,241,.4)'; mCtx.lineWidth = 2;
        mCtx.beginPath(); mCtx.roundRect(-160, -18, 320, 36, 18); mCtx.fill(); mCtx.stroke();
        mCtx.fillStyle = fl ? '#ffd700' : '#66fcf1'; mCtx.font = 'bold 15px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('🔥 SPACE — Fire Thrusters Toward Moon', 0, 5);
        mCtx.restore();

        if (keyState['Space']) {
            keyState['Space'] = false;
            MS.capX = W * 0.15;
            MS.capY = H * 0.45;
            MS.capVX = 1.8;
            MS.capVY = -0.25;
            MS.capAngle = -0.28;
            MS.moonTX = W * 0.85;
            MS.moonTY = H * 0.35;
            MS.moonSize = 32;
            MS.distToMoon = 384400;
            MS.fuel = Math.max(MS.fuel, 72);
            MS.flyToMoonSubPhase = 0;
            MS.animTimer = 0;
            applyPhase(5);
        }
    }
}

/* ════  PHASE 5 — FLY TO MOON (OVERRIDE WITH GRAVITY & CAPTURE)  ════ */
function renderFlyToMoon(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    
    if (MS.flyToMoonSubPhase === 0) {
        /* ── PHASE 5.0: INTERACTIVE TRAJECTORY NAVIGATION ── */
        mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
        
        // Parallax deep space nebula background
        drawNebulaBackground(W, H);
        drawStars(MS.capY * 0.03); // parallax stars
        
        // Earth coordinates (origin)
        const ex = W * 0.08, ey = H * 0.25;
        const eSize = Math.max(16, 75 - MS.phaseTime * 1.4);
        drawEarth(ex, ey, eSize);
        
        // Moon coordinates (destination)
        const mx = W * 0.85, my = H * 0.35;
        MS.moonSize = Math.min(H * 0.22, 28 + MS.phaseTime * 4.5);
        drawMoon(mx, my, MS.moonSize);
        
        // Grand Moon Orbit around Earth
        const orbitR = Math.sqrt((mx - ex)**2 + (my - ey)**2);
        mCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        mCtx.lineWidth = 1.5;
        mCtx.setLineDash([8, 6]);
        mCtx.beginPath();
        mCtx.arc(ex, ey, orbitR, 0, Math.PI * 2);
        mCtx.stroke();
        mCtx.setLineDash([]);
        
        // Lunar Capture Zone (orbit insertion target ring)
        const captureR = MS.moonSize + 55;
        mCtx.strokeStyle = 'rgba(102, 252, 241, 0.22)';
        mCtx.lineWidth = 2;
        mCtx.setLineDash([5, 5]);
        mCtx.beginPath();
        mCtx.arc(mx, my, captureR, 0, Math.PI * 2);
        mCtx.stroke();
        mCtx.setLineDash([]);
        
        mCtx.fillStyle = 'rgba(102, 252, 241, 0.38)';
        mCtx.font = '10px "Segoe UI", monospace';
        mCtx.textAlign = 'center';
        mCtx.fillText('LUNAR CAPTURE ZONE', mx, my - captureR - 8);

        // --- Controls: Rotation & Thrust ---
        const turnSpd = 2.4;
        if (keyState['ArrowLeft']) MS.capAngle -= turnSpd * dt;
        if (keyState['ArrowRight']) MS.capAngle += turnSpd * dt;
        
        // Gravity calculations (Earth + Moon gravity pulls)
        const dxE = MS.capX - ex, dyE = MS.capY - ey;
        const distE = Math.sqrt(dxE*dxE + dyE*dyE) || 1;
        const muE = 1200; // gravity force from Earth
        const fE = muE / (distE * distE);
        
        const dxM = mx - MS.capX, dyM = my - MS.capY;
        const distM = Math.sqrt(dxM*dxM + dyM*dyM) || 1;
        const muM = 350; // gravity force from Moon
        const fM = muM / (distM * distM);
        
        // Net Gravitational Acceleration
        let ax = -dxE/distE * fE + dxM/distM * fM;
        let ay = -dyE/distE * fE + dyM/distM * fM;
        
        const thrustPow = 4.0;
        let thrustingForward = false;
        let thrustingBackward = false;
        
        if (keyState['ArrowUp'] && MS.fuel > 0) {
            // Forward thrust (accelerate along heading angle)
            ax += Math.cos(MS.capAngle) * thrustPow;
            ay += Math.sin(MS.capAngle) * thrustPow;
            MS.fuel = Math.max(0, MS.fuel - dt * 4.5);
            thrustingForward = true;
        }
        if (keyState['ArrowDown'] && MS.fuel > 0) {
            // Reverse RCS braking thruster
            ax -= Math.cos(MS.capAngle) * thrustPow * 0.45;
            ay -= Math.sin(MS.capAngle) * thrustPow * 0.45;
            MS.fuel = Math.max(0, MS.fuel - dt * 2.2);
            thrustingBackward = true;
        }
        
        // Update velocity
        MS.capVX += ax * dt;
        MS.capVY += ay * dt;
        
        // Update position (scaled for pixels)
        MS.capX += MS.capVX * dt * 50;
        MS.capY += MS.capVY * dt * 50;
        
        // Displayed Distance in km
        MS.distToMoon = Math.max(0, distM * 520);
        
        // Draw orbital trajectory predictor (KSP style)
        drawTrajectoryHelper(ex, ey, mx, my, muE, muM);
        
        // Draw Capsule
        drawCapsule(MS.capX, MS.capY, MS.capAngle + Math.PI / 2, thrustingForward);
        
        // Draw RCS puff particles for retrograde thrust
        if (thrustingBackward) {
            const rx = MS.capX + Math.cos(MS.capAngle) * 12;
            const ry = MS.capY + Math.sin(MS.capAngle) * 12;
            const rvx = Math.cos(MS.capAngle) * 16;
            const rvy = Math.sin(MS.capAngle) * 16;
            if (Math.random() < 0.6) {
                spawnParticle(rx, ry, rvx + (Math.random() - 0.5)*6, rvy + (Math.random() - 0.5)*6, 0.4, 'rgba(102,252,241,.65)', 2);
            }
        }
        
        // Direction arrow guide to moon
        const aToMoon = Math.atan2(dyM, dxM);
        const indD = 65;
        mCtx.save();
        mCtx.translate(MS.capX + Math.cos(aToMoon) * indD, MS.capY + Math.sin(aToMoon) * indD);
        mCtx.rotate(aToMoon);
        mCtx.fillStyle = 'rgba(102,252,241,.55)';
        mCtx.beginPath(); mCtx.moveTo(14, 0); mCtx.lineTo(-6, -7); mCtx.lineTo(-6, 7); mCtx.closePath(); mCtx.fill();
        mCtx.restore();
        
        // Main engine plume particles
        if (thrustingForward && Math.random() < 0.5) {
            spawnParticle(
                MS.capX - Math.cos(MS.capAngle) * 15,
                MS.capY - Math.sin(MS.capAngle) * 15,
                -MS.capVX * 8 + (Math.random() - 0.5) * 10,
                -MS.capVY * 8 + (Math.random() - 0.5) * 10,
                0.8, 'rgba(102,252,241,.5)', 2
            );
        }
        
        const capSpd = Math.sqrt(MS.capVX ** 2 + MS.capVY ** 2);
        setGauges(capSpd, Math.floor(MS.distToMoon), MS.fuel);
        
        // Capture logic
        const inCaptureZone = distM < captureR;
        if (inCaptureZone) {
            if (capSpd <= 3.0) {
                // Orbit Capture Confirmed! Enter cinematic separation
                MS.flyToMoonSubPhase = 1;
                MS.animTimer = 0;
                MS.orbitAngle = Math.atan2(MS.capY - my, MS.capX - mx);
                document.getElementById('mPromptText').innerHTML = '<strong>✨ Orbit Capture Confirmed!</strong><br>Entering Lunar Orbit... Launching landing sequence';
            } else {
                // Warn player to slow down
                mCtx.fillStyle = 'rgba(255, 80, 80, 0.95)';
                mCtx.font = 'bold 15px "Segoe UI", monospace';
                mCtx.textAlign = 'center';
                mCtx.fillText('⚠️ SPEED TOO HIGH FOR ORBITAL CAPTURE!', W / 2, H * 0.11);
                mCtx.fillText('POINT RETROGRADE (POINT FACING BACKWARDS) & DECELLERATE BELOW 3.0 km/s!', W / 2, H * 0.15);
            }
        }
        
        // Gravity Field strength indicator
        mCtx.fillStyle = inCaptureZone ? '#66fcf1' : 'rgba(255,255,255,.45)';
        mCtx.font = 'bold 13px "Segoe UI", monospace';
        mCtx.textAlign = 'center';
        if (distM < 220) {
            mCtx.fillText('LUNAR GRAVITATIONAL PULL: ' + Math.round(fM * 100) + ' m/s²', W / 2, H * 0.08);
        } else {
            mCtx.fillText('EARTH GRAVITATIONAL WELL: ' + Math.round(fE * 100) + ' m/s²', W / 2, H * 0.08);
        }
        
        // FAIL — off screen
        if (MS.capX < -120 || MS.capX > W + 120 || MS.capY < -120 || MS.capY > H + 120) {
            showFail('OFF COURSE', 'Your capsule drifted beyond recoverable range. The Moon is out of reach.');
            return;
        }
        
        // FAIL — no fuel and heading away
        if (MS.fuel <= 0 && distM > captureR) {
            const dot = MS.capVX * dxM + MS.capVY * dyM;
            if (dot < 0 || capSpd < 0.2) {
                showFail('FUEL DEPLETED', 'No fuel remaining. Trajectory does not capture Moon. Mission lost in deep space.');
                return;
            }
        }
    } else {
        /* ── PHASE 5.1: CINEMATIC ORBIT INSERTION & LANDER SEPARATION ── */
        renderLanderSeparationAnimatic(dt, W, H);
    }
}

function drawNebulaBackground(W, H) {
    // Beautiful deep-space ambient radial glows
    const g1 = mCtx.createRadialGradient(W * 0.72, H * 0.28, 60, W * 0.72, H * 0.28, W * 0.55);
    g1.addColorStop(0, 'rgba(88, 10, 160, 0.16)');
    g1.addColorStop(0.4, 'rgba(20, 0, 70, 0.06)');
    g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    mCtx.fillStyle = g1; mCtx.fillRect(0, 0, W, H);
    
    const g2 = mCtx.createRadialGradient(W * 0.28, H * 0.72, 60, W * 0.28, H * 0.72, W * 0.6);
    g2.addColorStop(0, 'rgba(0, 110, 120, 0.11)');
    g2.addColorStop(0.5, 'rgba(0, 30, 70, 0.04)');
    g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    mCtx.fillStyle = g2; mCtx.fillRect(0, 0, W, H);
}

function drawTrajectoryHelper(ex, ey, mx, my, muE, muM) {
    let tx = MS.capX, ty = MS.capY;
    let tvx = MS.capVX, tvy = MS.capVY;
    
    mCtx.strokeStyle = 'rgba(102, 252, 241, 0.35)';
    mCtx.lineWidth = 1.5;
    mCtx.setLineDash([3, 5]);
    mCtx.beginPath();
    mCtx.moveTo(tx, ty);
    
    // Simulate trajectory coordinates 35 steps forward in time
    const simSteps = 35;
    const simDt = 0.08;
    for (let i = 0; i < simSteps; i++) {
        const dxE = tx - ex, dyE = ty - ey;
        const distE = Math.sqrt(dxE*dxE + dyE*dyE) || 1;
        const fE = muE / (distE * distE);
        
        const dxM = mx - tx, dyM = my - ty;
        const distM = Math.sqrt(dxM*dxM + dyM*dyM) || 1;
        const fM = muM / (distM * distM);
        
        tvx += (-dxE/distE * fE + dxM/distM * fM) * simDt;
        tvy += (-dyE/distE * fE + dyM/distM * fM) * simDt;
        
        tx += tvx * simDt * 50;
        ty += tvy * simDt * 50;
        mCtx.lineTo(tx, ty);
    }
    mCtx.stroke();
    mCtx.setLineDash([]);
}

function renderLanderSeparationAnimatic(dt, W, H) {
    MS.animTimer += dt;
    const mx = W * 0.85, my = H * 0.35;
    
    mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, W, H);
    drawNebulaBackground(W, H);
    
    // Smooth zoom profile
    const zoomStart = 1.0, zoomEnd = 2.8;
    let camZoom = zoomStart;
    let viewX = W / 2, viewY = H / 2;
    
    if (MS.animTimer < 1.5) {
        const t = MS.animTimer / 1.5;
        camZoom = lerp(zoomStart, zoomEnd, t);
        viewX = lerp(W / 2, mx, t);
        viewY = lerp(H / 2, my, t);
    } else {
        camZoom = zoomEnd;
        viewX = mx;
        viewY = my;
    }
    
    mCtx.save();
    // Center camera on target and apply zoom scale
    mCtx.translate(W / 2, H / 2);
    mCtx.scale(camZoom, camZoom);
    mCtx.translate(-viewX, -viewY);
    
    // Parallax stars inside zoomed coordinate space
    drawStars();
    
    // Moon
    drawMoon(mx, my, MS.moonSize);
    
    // Zoomed Orbit Line (concentric and outside Moon surface)
    const orbitR = MS.moonSize + 25;
    
    mCtx.strokeStyle = 'rgba(102, 252, 241, 0.12)';
    mCtx.lineWidth = 0.5;
    mCtx.beginPath(); mCtx.arc(mx, my, orbitR, 0, Math.PI * 2); mCtx.stroke();
    
    // Orbit angles calculations
    MS.orbitAngle += dt * 0.8;
    
    const cx = mx + Math.cos(MS.orbitAngle) * orbitR;
    const cy = my + Math.sin(MS.orbitAngle) * orbitR;
    const capAngle = MS.orbitAngle + Math.PI / 2;
    
    if (MS.animTimer < 1.8) {
        // Docked capsule + lander orbiting (small scale, nose-to-nose)
        mCtx.save();
        mCtx.translate(cx, cy);
        mCtx.rotate(capAngle);
        
        // Draw Capsule (small scale 0.18)
        mCtx.save();
        mCtx.scale(0.18, 0.18);
        drawCapsule(0, 0, 0, false);
        mCtx.restore();
        
        // Draw Lander docked nose-to-nose, rotated 180 degrees (small scale 0.15)
        mCtx.save();
        mCtx.translate(0, -7.6);
        mCtx.rotate(Math.PI);
        mCtx.scale(0.15, 0.15);
        drawLander(0, 0, false);
        mCtx.restore();
        
        mCtx.restore();
        
        mCtx.restore(); // restore zoom
        
        mCtx.fillStyle = '#66fcf1'; mCtx.font = 'bold 18px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('LUNAR ORBIT INSERTION CONFIRMED', W / 2, H * 0.88);
        
    } else if (MS.animTimer < 3.2) {
        // Separation stage (capsule orbits, lander drifts and pitches)
        const sepT = (MS.animTimer - 1.8) / 1.4;
        
        // Command Module remains in orbit (small scale)
        mCtx.save();
        mCtx.translate(cx, cy);
        mCtx.rotate(capAngle);
        mCtx.scale(0.18, 0.18);
        drawCapsule(0, 0, 0, false);
        mCtx.restore();
        
        // Lander drops into lower orbit towards Moon and turns around
        const landerR = orbitR - sepT * 18;
        const landerAngle = MS.orbitAngle - sepT * 0.06;
        const lx = mx + Math.cos(landerAngle) * landerR;
        const ly = my + Math.sin(landerAngle) * landerR;
        
        const startRot = capAngle + Math.PI;
        const endRot = landerAngle + Math.PI / 2;
        const currentRot = lerp(startRot, endRot, sepT);
        
        mCtx.save();
        mCtx.translate(lx, ly);
        mCtx.rotate(currentRot);
        mCtx.scale(0.15, 0.15);
        drawLander(0, 0, false);
        mCtx.restore();
        
        // Spark/puff separation particles at the docking point
        const sepCX = mx + Math.cos(MS.orbitAngle + 0.05) * (orbitR - 4);
        const sepCY = my + Math.sin(MS.orbitAngle + 0.05) * (orbitR - 4);
        if (Math.random() < 0.4) {
            spawnParticle(sepCX, sepCY, (Math.random() - 0.5)*15, (Math.random() - 0.5)*15, 0.5, 'rgba(255,255,255,0.7)', 1.5);
        }
        
        mCtx.restore(); // restore zoom
        
        mCtx.fillStyle = '#ffd700'; mCtx.font = 'bold 18px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('⚡ LUNAR LANDER DE-ORBIT / SEPARATION', W / 2, H * 0.88);
        
    } else if (MS.animTimer < 5.0) {
        // Descent thruster ignition (capsule orbits, lander fires engine)
        const fireT = (MS.animTimer - 3.2) / 1.8;
        const landerR = orbitR - 18 - fireT * 25;
        const landerAngle = MS.orbitAngle - 0.06 - fireT * 0.12;
        const lx = mx + Math.cos(landerAngle) * landerR;
        const ly = my + Math.sin(landerAngle) * landerR;
        
        mCtx.save();
        mCtx.translate(cx, cy);
        mCtx.rotate(capAngle);
        mCtx.scale(0.18, 0.18);
        drawCapsule(0, 0, 0, false);
        mCtx.restore();
        
        mCtx.save();
        mCtx.translate(lx, ly);
        mCtx.rotate(landerAngle + Math.PI / 2);
        mCtx.scale(0.15, 0.15);
        drawLander(0, 0, true);
        mCtx.restore();
        
        // Main engine particles
        const nozzleX = lx + Math.cos(landerAngle)*4;
        const nozzleY = ly + Math.sin(landerAngle)*4;
        const pVx = Math.cos(landerAngle + Math.PI / 2) * 25;
        const pVy = Math.sin(landerAngle + Math.PI / 2) * 25;
        if (Math.random() < 0.8) {
            spawnParticle(nozzleX, nozzleY, pVx + (Math.random()-0.5)*8, pVy + (Math.random()-0.5)*8, 0.6, 'rgba(102,252,241,0.8)', 1.5);
        }
        
        mCtx.restore(); // restore zoom
        
        mCtx.fillStyle = '#ff8c00'; mCtx.font = 'bold 18px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('🔥 DESCENT BOOSTER IGNITION', W / 2, H * 0.88);
        
    } else {
        mCtx.restore(); // restore zoom
        
        // Initial setup for the 2D lander game
        MS.landerX = W * 0.25;
        MS.landerY = H * 0.15;
        MS.landerVX = 2.8;
        MS.landerVY = 0.5;
        MS.landerTilt = 0.4;
        MS.landerFuel = Math.max(48, MS.fuel);
        MS.landerSpeed = 0.5;
        MS.thrustOn = false;
        
        applyPhase(6);
    }
}

/* ════  PHASE 6 — LUNAR POWERED DESCENT (OVERRIDE TO 2D PHYSICS)  ════ */
function renderDescent(dt) {
    const W = mCanvas.width, H = mCanvas.height;
    const groundY = H * 0.75;
    
    // Moon sky
    const sky = mCtx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#000'); sky.addColorStop(1, '#05070e');
    mCtx.fillStyle = sky; mCtx.fillRect(0, 0, W, groundY);
    drawStars();
    
    // Earth in sky (faded)
    mCtx.save(); mCtx.globalAlpha = 0.35;
    drawEarth(W * 0.12, H * 0.15, H * 0.08);
    mCtx.restore();
    
    // Lunar hills and crater layers
    drawLunarHills(W, groundY);
    
    // Landing pads definition
    const padW = 100;
    const pads = [
        { x: W * 0.22, name: 'PAD ALPHA' },
        { x: W * 0.5, name: 'PAD BETA' },
        { x: W * 0.78, name: 'PAD GAMMA' }
    ];
    
    pads.forEach(pad => {
        mCtx.strokeStyle = 'rgba(102,252,241,.4)'; mCtx.lineWidth = 2.5; mCtx.setLineDash([8, 4]);
        mCtx.beginPath(); mCtx.moveTo(pad.x - padW/2, groundY); mCtx.lineTo(pad.x + padW/2, groundY); mCtx.stroke();
        mCtx.setLineDash([]);
        mCtx.fillStyle = 'rgba(102,252,241,.16)';
        mCtx.fillRect(pad.x - padW/2, groundY, padW, 8);
        
        mCtx.fillStyle = 'rgba(102,252,241,.32)'; mCtx.font = '10px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('▼ ' + pad.name + ' ▼', pad.x, groundY - 12);
    });
    
    // --- Rotate Controls ---
    const rotSpeed = 1.8;
    if (keyState['ArrowLeft']) MS.landerTilt -= rotSpeed * dt;
    if (keyState['ArrowRight']) MS.landerTilt += rotSpeed * dt;
    MS.landerTilt = Math.max(-1.4, Math.min(1.4, MS.landerTilt));
    
    // --- Thrust controls ---
    MS.thrustOn = keyState['Space'] || MS.thrustOn;
    const gravity = 0.65;
    const landerThrust = 1.35;
    
    let ax = 0;
    let ay = gravity;
    
    const engineFiring = MS.thrustOn && MS.landerFuel > 0;
    if (engineFiring) {
        ax += Math.sin(MS.landerTilt) * landerThrust;
        ay += -Math.cos(MS.landerTilt) * landerThrust;
        MS.landerFuel = Math.max(0, MS.landerFuel - dt * 11.5);
    }
    
    // Update velocity
    MS.landerVX += ax * dt;
    MS.landerVY += ay * dt;
    
    // Update position (scaled for pixels)
    MS.landerX += MS.landerVX * dt * 40;
    MS.landerY = Math.min(MS.landerY + MS.landerVY * dt * 40, groundY - 26);
    
    MS.landerSpeed = Math.sqrt(MS.landerVX * MS.landerVX + MS.landerVY * MS.landerVY);
    
    // Bounds check
    if (MS.landerX < 20) { MS.landerX = 20; MS.landerVX = 0; }
    if (MS.landerX > W - 20) { MS.landerX = W - 20; MS.landerVX = 0; }
    
    const altKm = Math.max(0, Math.floor((groundY - MS.landerY - 26) / 4));
    setGauges(MS.landerSpeed, altKm, MS.landerFuel);
    
    // Draw Lander
    drawLander2D(MS.landerX, MS.landerY, MS.landerTilt, engineFiring);
    
    // Particles and surface dust
    if (engineFiring) {
        const exhaustY = MS.landerY + 30;
        const distToGround = groundY - exhaustY;
        
        if (Math.random() < 0.6) {
            const ea = MS.landerTilt + Math.PI/2;
            const px = MS.landerX + Math.cos(ea) * 12;
            const py = MS.landerY + Math.sin(ea) * 12;
            spawnParticle(px, py,
                Math.sin(MS.landerTilt)*40 + (Math.random()-0.5)*15,
                -Math.cos(MS.landerTilt)*40 + (Math.random()-0.5)*15,
                0.5, 'rgba(102,252,241,0.8)', 2.5 + Math.random()*2
            );
        }
        
        // Ground dust blow
        if (distToGround < 100) {
            const dustIntensity = (100 - distToGround) / 100;
            const nDust = Math.floor(dustIntensity * 3);
            for (let i = 0; i < nDust; i++) {
                spawnParticle(
                    MS.landerX + (Math.random() - 0.5) * 20,
                    groundY - 2,
                    (Math.random() - 0.5) * 50 * dustIntensity,
                    -Math.random() * 20 * dustIntensity,
                    0.8, 'rgba(140, 140, 140, 0.4)', 2 + Math.random() * 4
                );
            }
        }
    }
    
    // Render Cockpit Instrumentation HUD
    drawLanderHUD(mCtx, W, H, pads, padW);
    
    // Action button hidden
    const ab = document.getElementById('mActionBtn');
    ab.classList.remove('show');
    
    // Touchdown checking
    if (MS.landerY >= groundY - 27) {
        const alignedPad = pads.find(pad => Math.abs(MS.landerX - pad.x) < padW / 2);
        const onPad = !!alignedPad;
        const safeV = MS.landerVY < 3.8;
        const safeH = Math.abs(MS.landerVX) < 2.0;
        const safeTilt = Math.abs(MS.landerTilt) < 0.26; // ~15 deg
        
        if (!onPad) {
            triggerLanderExplosion(MS.landerX, groundY);
            showFail('MISSED LANDING ZONE', 'The lander touched down on rough, boulder-strewn lunar terrain outside any recovery pad and was destroyed.');
        } else if (!safeV) {
            triggerLanderExplosion(MS.landerX, groundY);
            showFail('HARD IMPACT', 'Impact velocity ' + MS.landerVY.toFixed(1) + ' km/s exceeded landing leg structure limits (safe is < 3.8). Lander collapsed on ' + alignedPad.name + '.');
        } else if (!safeH) {
            triggerLanderExplosion(MS.landerX, groundY);
            showFail('EXCESSIVE LATERAL DRIFT', 'Horizontal drift speed ' + Math.abs(MS.landerVX).toFixed(1) + ' km/s caused landing legs to catch and roll the vehicle on ' + alignedPad.name + ' (safe is < 2.0).');
        } else if (!safeTilt) {
            triggerLanderExplosion(MS.landerX, groundY);
            showFail('LANDER TIPPED OVER', 'Touchdown tilt angle ' + Math.floor(Math.abs(MS.landerTilt)*180/Math.PI) + '° exceeded tip-over margin. Lander crashed on its side on ' + alignedPad.name + '.');
        } else {
            showSuccess();
        }
    }
    
    MS.thrustOn = keyState['Space'] || false;
}

function drawLander2D(x, y, tilt, thrustOn) {
    mCtx.save();
    mCtx.translate(x, y);
    mCtx.rotate(tilt);
    mCtx.scale(0.85, 0.85);
    
    // Hex body
    mCtx.fillStyle = '#b2c4d4'; mCtx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 - Math.PI / 6;
        mCtx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
    }
    mCtx.closePath(); mCtx.fill();
    mCtx.strokeStyle = 'rgba(102,252,241,.6)'; mCtx.lineWidth = 1.5; mCtx.stroke();
    
    // Window core
    mCtx.fillStyle = '#3a506b';
    mCtx.beginPath(); mCtx.arc(0, -4, 6, 0, Math.PI * 2); mCtx.fill();
    mCtx.strokeStyle = '#66fcf1'; mCtx.stroke();
    
    // Landing struts
    mCtx.strokeStyle = '#8a8a8a'; mCtx.lineWidth = 2.5;
    mCtx.beginPath(); mCtx.moveTo(-18, 14); mCtx.lineTo(-28, 22); mCtx.lineTo(-24, 22); mCtx.stroke();
    mCtx.beginPath(); mCtx.moveTo(18, 14); mCtx.lineTo(28, 22); mCtx.lineTo(24, 22); mCtx.stroke();
    mCtx.beginPath(); mCtx.moveTo(-10, 18); mCtx.lineTo(-14, 24); mCtx.stroke();
    mCtx.beginPath(); mCtx.moveTo(10, 18); mCtx.lineTo(14, 24); mCtx.stroke();
    
    // Foot pads
    mCtx.fillStyle = '#ffb703';
    [[-26, 22], [26, 22]].forEach(([lx, ly]) => {
        mCtx.beginPath(); mCtx.ellipse(lx, ly + 2, 6, 2.5, 0, 0, Math.PI * 2); mCtx.fill();
    });
    
    // Nozzle
    mCtx.fillStyle = '#444';
    mCtx.beginPath(); mCtx.moveTo(-5, 18); mCtx.lineTo(5, 18); mCtx.lineTo(7, 25); mCtx.lineTo(-7, 25); mCtx.closePath(); mCtx.fill();
    
    // Plume
    if (thrustOn) {
        const t = performance.now() * 0.015;
        const fg = mCtx.createRadialGradient(0, 26, 0, 0, 36, 18);
        fg.addColorStop(0, 'rgba(102,252,241,1)');
        fg.addColorStop(0.3, 'rgba(0,210,255,.75)');
        fg.addColorStop(0.65, 'rgba(0,100,255,.3)');
        fg.addColorStop(1, 'rgba(0,100,255,0)');
        mCtx.fillStyle = fg;
        mCtx.beginPath(); mCtx.arc(0, 32 + Math.sin(t)*3, 16, 0, Math.PI * 2); mCtx.fill();
    }
    
    // RCS indicator dots on steering
    mCtx.fillStyle = '#66fcf1';
    if (keyState['ArrowLeft']) {
        mCtx.beginPath(); mCtx.arc(20, -10, 2, 0, Math.PI * 2); mCtx.fill();
    }
    if (keyState['ArrowRight']) {
        mCtx.beginPath(); mCtx.arc(-20, -10, 2, 0, Math.PI * 2); mCtx.fill();
    }
    
    mCtx.restore();
}

function drawLunarHills(W, groundY) {
    // Parallax background hills
    mCtx.fillStyle = '#3c3c3c';
    mCtx.beginPath(); mCtx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 40) {
        const y = groundY - 50 + Math.sin(x * 0.003 + 2.5) * 35 + Math.cos(x * 0.007) * 12;
        mCtx.lineTo(x, y);
    }
    mCtx.lineTo(W, groundY); mCtx.closePath(); mCtx.fill();
    
    // Mid hills
    mCtx.fillStyle = '#555';
    mCtx.beginPath(); mCtx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 30) {
        const y = groundY - 25 + Math.sin(x * 0.005 + 1.2) * 20 + Math.cos(x * 0.012) * 6;
        mCtx.lineTo(x, y);
    }
    mCtx.lineTo(W, groundY); mCtx.closePath(); mCtx.fill();
    
    // Foreground crater floor
    mCtx.fillStyle = '#707070';
    mCtx.fillRect(0, groundY, W, window.innerHeight - groundY);
    
    // Draw surface craters
    [[0.18, 12, 38], [0.38, 25, 20], [0.65, 8, 30], [0.85, 18, 25]].forEach(([xr, yr, r]) => {
        mCtx.fillStyle = '#5a5a5a';
        mCtx.beginPath(); mCtx.arc(xr * W, groundY + yr, r, 0, Math.PI, true); mCtx.fill();
        mCtx.strokeStyle = '#4e4e4e'; mCtx.lineWidth = 2; mCtx.stroke();
    });
}

function drawLanderHUD(mCtx, W, H, pads, padW) {
    const boxW = 280, boxH = 145;
    const bx = 24, by = 90;
    
    mCtx.fillStyle = 'rgba(6, 18, 36, 0.88)';
    mCtx.strokeStyle = 'rgba(102, 252, 241, 0.35)';
    mCtx.lineWidth = 1;
    mCtx.beginPath(); mCtx.roundRect(bx, by, boxW, boxH, 10); mCtx.fill(); mCtx.stroke();
    
    mCtx.fillStyle = 'rgba(102, 252, 241, 0.5)';
    mCtx.font = 'bold 11px "Segoe UI", monospace'; mCtx.textAlign = 'left';
    mCtx.fillText('PILOTING DATA TELEMETRY', bx + 16, by + 22);
    
    const vSpeed = MS.landerVY;
    const hSpeed = MS.landerVX;
    const tiltDeg = Math.floor(MS.landerTilt * 180 / Math.PI);
    
    // Find nearest pad for HUD target locking
    let nearestPad = pads[0];
    let minDist = Math.abs(MS.landerX - pads[0].x);
    pads.forEach(p => {
        const d = Math.abs(MS.landerX - p.x);
        if (d < minDist) {
            minDist = d;
            nearestPad = p;
        }
    });
    
    const distToPad = minDist;
    const safeV = vSpeed < 3.8;
    const safeH = Math.abs(hSpeed) < 2.0;
    const safeTilt = Math.abs(tiltDeg) < 15;
    const safePad = distToPad < padW / 2;
    
    drawHUDLine(bx + 16, by + 45, 'VERTICAL VEL', vSpeed.toFixed(1) + ' m/s', safeV ? '#00f5d4' : '#ff4757');
    drawHUDLine(bx + 16, by + 68, 'LATERAL DRIFT', hSpeed.toFixed(1) + ' m/s', safeH ? '#00f5d4' : '#ff4757');
    drawHUDLine(bx + 16, by + 91, 'DESCENT TILT', tiltDeg + '°', safeTilt ? '#00f5d4' : '#ff4757');
    drawHUDLine(bx + 16, by + 114, 'PAD ALIGNMENT', distToPad < 5 ? 'PERFECT' : distToPad < padW/2 ? 'ALIGNED' : 'MISALIGNED', safePad ? '#00f5d4' : '#ff4757');
    
    drawLandingRadar(W, H, pads, padW, nearestPad);
}

function drawHUDLine(x, y, label, val, valCol) {
    mCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    mCtx.font = '10px "Segoe UI", monospace'; mCtx.textAlign = 'left';
    mCtx.fillText(label, x, y);
    
    mCtx.fillStyle = valCol;
    mCtx.font = 'bold 12px "Segoe UI", monospace'; mCtx.textAlign = 'right';
    mCtx.fillText(val, x + 248, y);
}

function drawLandingRadar(W, H, pads, padW, nearestPad) {
    const radarW = 200, radarH = 26;
    const rx = (W - radarW) / 2, ry = 95;
    
    mCtx.fillStyle = 'rgba(6, 18, 36, 0.85)';
    mCtx.strokeStyle = 'rgba(102, 252, 241, 0.35)';
    mCtx.lineWidth = 1;
    mCtx.beginPath(); mCtx.roundRect(rx, ry, radarW, radarH, 6); mCtx.fill(); mCtx.stroke();
    
    // Draw all target pad areas on radar
    pads.forEach(pad => {
        const padPct = pad.x / W;
        const padRx = rx + padPct * radarW;
        const padRadarW = (padW / W) * radarW;
        
        const isLocked = pad === nearestPad;
        mCtx.fillStyle = isLocked ? 'rgba(102, 252, 241, 0.25)' : 'rgba(102, 252, 241, 0.08)';
        mCtx.fillRect(padRx - padRadarW/2, ry + 2, padRadarW, radarH - 4);
        mCtx.strokeStyle = isLocked ? 'rgba(102, 252, 241, 0.7)' : 'rgba(102, 252, 241, 0.25)';
        mCtx.lineWidth = isLocked ? 1.5 : 1;
        mCtx.strokeRect(padRx - padRadarW/2, ry + 2, padRadarW, radarH - 4);
    });
    
    // Draw center tick marks for all pads
    pads.forEach(pad => {
        const padPct = pad.x / W;
        const padRx = rx + padPct * radarW;
        mCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        mCtx.beginPath(); mCtx.moveTo(padRx, ry + 2); mCtx.lineTo(padRx, ry + radarH - 2); mCtx.stroke();
    });
    
    // Lander mark
    const pct = MS.landerX / W;
    const lx = rx + pct * radarW;
    mCtx.fillStyle = '#ffd700';
    mCtx.beginPath(); mCtx.arc(lx, ry + radarH/2, 4, 0, Math.PI * 2); mCtx.fill();
    
    if (MS.landerX < nearestPad.x - padW/2) {
        mCtx.fillStyle = '#ffd700'; mCtx.font = '9px "Segoe UI", monospace'; mCtx.textAlign = 'right';
        mCtx.fillText('MOVE RIGHT →', rx - 8, ry + 16);
    } else if (MS.landerX > nearestPad.x + padW/2) {
        mCtx.fillStyle = '#ffd700'; mCtx.font = '9px "Segoe UI", monospace'; mCtx.textAlign = 'left';
        mCtx.fillText('← MOVE LEFT', rx + radarW + 8, ry + 16);
    } else {
        mCtx.fillStyle = '#00f5d4'; mCtx.font = 'bold 9px "Segoe UI", monospace'; mCtx.textAlign = 'center';
        mCtx.fillText('ALIGN SAFE', W/2, ry + radarH + 11);
    }
}

function triggerLanderExplosion(lx, ly) {
    for (let i = 0; i < 55; i++) {
        spawnParticle(
            lx + (Math.random() - 0.5) * 35,
            ly + (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 150,
            -Math.random() * 95 - 20,
            1.8,
            i % 2 === 0 ? '#ff4757' : i % 3 === 0 ? '#ffd700' : 'rgba(140,140,140,0.5)',
            3 + Math.random() * 4
        );
    }
}

// Mutate Prompts array elements for upgrades
PHASE_PROMPTS[5] = '<strong>🌙 Navigate to the Moon!</strong><br>Use <kbd>← →</kbd> to steer, <kbd>↑</kbd> for thrust, <kbd>↓</kbd> to brake. Capture orbit below 3.0 km/s!';
PHASE_PROMPTS[6] = '<strong>🔥 Powered Descent!</strong><br>Use <kbd>← →</kbd> to tilt, hold <kbd>Space</kbd> to fire descent booster. Land on the recovery pad!';

