/* =====================================================================
   LÓGICA PRINCIPAL: CARIBE DELIVERY STITCH 2.0 MESH SIMULATOR
   COMPORTAMIENTO: SIMULACIÓN DE AGENTES, MAPAS, COMPROBANTES Y SEGURIDAD
   ===================================================================== */

// State Representation
const APP_STATE = {
  ncfSequence: 43, // B0100000043
  routes: {
    "R-01": { id: "R-01", origen: "Santo Domingo", destino: "Santiago", estado: "Disponible", pathId: "route-santiago", geofenceId: "geofence-santiago", targetX: 335, targetY: 180, radius: 45 },
    "R-02": { id: "R-02", origen: "Santo Domingo", destino: "Punta Cana", estado: "Hub Principal", pathId: "route-puntacana", geofenceId: "geofence-puntacana", targetX: 715, targetY: 245, radius: 40 }
  },
  envios: [
    { ncf: "B0100000041", destino: "Santiago", peso: 8, itbis: 68.40, total: 448.40, estado: "Delivered" },
    { ncf: "B0100000042", destino: "Punta Cana", peso: 22, itbis: 102.60, total: 672.60, estado: "En Trayecto" }
  ],
  driver: {
    name: "Juan Pérez",
    truck: "TRK-01",
    signature: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.CD-TRK01-SD-STI.n4E9KzP9lW2m",
    ttl: 3599,
    status: "ACTIVE" // ACTIVE, COMPROMISED
  },
  meshRunning: false,
  truckAnimation: null,
  truckPosition: { x: 430, y: 295 } // Santo Domingo Hub
};

// SVG Mesh Map Links Configuration
const MESH_LINKS = [
  { from: "orchestrator", to: "architect", path: null },
  { from: "orchestrator", to: "developer", path: null },
  { from: "orchestrator", to: "tester", path: null },
  { from: "orchestrator", to: "auditor", path: null }
];

// Document Elements
const elClock = document.getElementById("live-clock");
const elLedgerCount = document.getElementById("ledger-count");
const elLedgerStatusDot = document.getElementById("ledger-status-dot");
const elMeshActiveStatus = document.getElementById("mesh-active-status");

// Billing Elements
const elWeight = document.getElementById("package-weight");
const elValue = document.getElementById("package-value");
const elDestSelect = document.getElementById("package-dest");
const elBillBase = document.getElementById("bill-base");
const elBillW = document.getElementById("bill-w-lbl");
const elBillWExtra = document.getElementById("bill-weight-extra");
const elBillSubtotal = document.getElementById("bill-subtotal");
const elBillItbis = document.getElementById("bill-itbis");
const elBillTotal = document.getElementById("bill-total");
const elBillNcf = document.getElementById("bill-ncf");
const elLedgerBody = document.getElementById("ledger-table-body");
const elTblRowCount = document.getElementById("tbl-row-count");

// Terminal Elements
const elTermBody = document.getElementById("terminal-body");
const elTermForm = document.getElementById("terminal-form");
const elTermInput = document.getElementById("terminal-input");
const btnClearTerm = document.getElementById("btn-clear-term");
const quickCmdBtns = document.querySelectorAll(".quick-cmd-btn");

// Security Elements
const elDrvName = document.getElementById("drv-name");
const elDrvTruck = document.getElementById("drv-truck");
const elJwtBadgeStatus = document.getElementById("jwt-badge-status");
const elJwtSignature = document.getElementById("jwt-signature");
const elJwtTtl = document.getElementById("jwt-ttl");
const btnRotateKeys = document.getElementById("btn-rotate-keys");
const btnCorruptToken = document.getElementById("btn-corrupt-token");
const elAuditLogsList = document.getElementById("audit-logs-list");
const elJwtAlertBadge = document.getElementById("jwt-audit-alert");
const elGeofenceAlertBadge = document.getElementById("geofence-alert");

// Map/GPS Elements
const elTruckMarker = document.getElementById("truck-marker");
const elTelTruckId = document.getElementById("tel-truck-id");
const elTelLat = document.getElementById("tel-lat");
const elTelLng = document.getElementById("tel-lng");
const elTelSpeed = document.getElementById("tel-speed");
const elTelGeofence = document.getElementById("tel-geofence");

// =====================================================================
// UTILITY FUNCTIONS & INITIALIZATIONS
// =====================================================================

// Clock tick
setInterval(() => {
  const d = new Date();
  elClock.innerText = d.toTimeString().split(" ")[0];
}, 1000);

// Driver JWT expiration countdown
setInterval(() => {
  if (APP_STATE.driver.status === "ACTIVE") {
    if (APP_STATE.driver.ttl > 0) {
      APP_STATE.driver.ttl--;
      elJwtTtl.innerText = `${APP_STATE.driver.ttl}s`;
    } else {
      APP_STATE.driver.ttl = 3600;
    }
  } else {
    elJwtTtl.innerText = "EXPIRADO (0s)";
  }
}, 1000);

// Sleep Utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Format NCF B01
function formatNcf(seq) {
  return "B01" + String(seq).padStart(8, '0');
}

// Log line builder
function logToTerminal(tag, message, type = "sys") {
  const timeStr = new Date().toTimeString().split(" ")[0];
  const line = document.createElement("div");
  line.className = `term-line ${type}-line`;
  
  line.innerHTML = `
    <span class="term-time">[${timeStr}]</span>
    <span class="term-tag tag-${type}">${tag}</span>
    <span>${message}</span>
  `;
  elTermBody.appendChild(line);
  elTermBody.scrollTop = elTermBody.scrollHeight;
}

// Security Auditor Logger
function logToSecurity(message, level = "info") {
  const d = new Date();
  const time = d.toTimeString().split(" ")[0];
  const item = document.createElement("div");
  item.className = "audit-log-line";
  if (level === "warn") item.className += " audit-warn";
  if (level === "danger") item.className += " audit-danger";
  
  item.innerText = `🔒 [${time}] ${message}`;
  elAuditLogsList.appendChild(item);
  elAuditLogsList.scrollTop = elAuditLogsList.scrollHeight;
}

// Recalculate bill
function calculateBill() {
  const w = parseFloat(elWeight.value) || 0;
  const val = parseFloat(elValue.value) || 0;
  
  // Base shipping cost RD$350. Over 15 lbs, INTRANT weight policy adds surcharge of RD$15 per lb.
  const base = 350.00;
  const limit = 15;
  const surchargeRate = 15.00;
  let surcharge = 0;
  
  if (w > limit) {
    surcharge = (w - limit) * surchargeRate;
  }
  
  const subtotal = base + surcharge;
  const itbis = subtotal * 0.18; // 18% Dominican VAT (ITBIS)
  const total = subtotal + itbis;
  
  // Update view
  elBillBase.innerText = `RD$ ${base.toFixed(2)}`;
  elBillW.innerText = w.toFixed(0);
  elBillWExtra.innerText = `RD$ ${surcharge.toFixed(2)}`;
  elBillSubtotal.innerText = `RD$ ${subtotal.toFixed(2)}`;
  elBillItbis.innerText = `RD$ ${itbis.toFixed(2)}`;
  elBillTotal.innerText = `RD$ ${total.toFixed(2)}`;
  elBillNcf.innerText = formatNcf(APP_STATE.ncfSequence);
}

// Initial Calculations
calculateBill();
elWeight.addEventListener("input", calculateBill);
elValue.addEventListener("input", calculateBill);

// Update Ledger DB count
function updateLedgerCount() {
  elLedgerCount.innerText = `DGII_B01_ACTIVE (${APP_STATE.ncfSequence - 1})`;
  elTblRowCount.innerText = `${APP_STATE.envios.length} envíos registrados`;
}

// Populate table
function renderLedgerTable() {
  elLedgerBody.innerHTML = "";
  APP_STATE.envios.forEach(item => {
    const tr = document.createElement("tr");
    
    let statusClass = "delivered";
    let statusTxt = "Completado";
    if (item.estado === "En Trayecto") {
      statusClass = "intransit";
      statusTxt = "En Trayecto";
    }
    
    tr.innerHTML = `
      <td class="text-mono text-cyan">${item.ncf}</td>
      <td>${item.destino}</td>
      <td>${item.peso} lbs</td>
      <td>RD$ ${item.itbis.toFixed(2)}</td>
      <td>RD$ ${item.total.toFixed(2)}</td>
      <td><span class="status-pill ${statusClass}">${statusTxt}</span></td>
    `;
    elLedgerBody.appendChild(tr);
  });
}
renderLedgerTable();
updateLedgerCount();

// =====================================================================
// GRAPHICAL AGENT MESH NETWORKING
// =====================================================================

// Draw lines in SVG overlay
function initMeshSVG() {
  const svg = document.getElementById("mesh-connections");
  svg.innerHTML = ""; // Clear
  
  const orchestrator = document.getElementById("node-orchestrator");
  const nodes = {
    architect: document.getElementById("node-architect"),
    developer: document.getElementById("node-developer"),
    tester: document.getElementById("node-tester"),
    auditor: document.getElementById("node-auditor")
  };
  
  const svgRect = svg.getBoundingClientRect();
  const orchRect = orchestrator.getBoundingClientRect();
  
  const x1 = orchRect.left + orchRect.width/2 - svgRect.left;
  const y1 = orchRect.top + orchRect.height/2 - svgRect.top;
  
  Object.keys(nodes).forEach(key => {
    const nodeRect = nodes[key].getBoundingClientRect();
    const x2 = nodeRect.left + nodeRect.width/2 - svgRect.left;
    const y2 = nodeRect.top + nodeRect.height/2 - svgRect.top;
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "line");
    path.setAttribute("x1", x1);
    path.setAttribute("y1", y1);
    path.setAttribute("x2", x2);
    path.setAttribute("y2", y2);
    path.setAttribute("class", "mesh-line");
    path.setAttribute("id", `line-${key}`);
    svg.appendChild(path);
    
    // Save points for animations
    const match = MESH_LINKS.find(l => l.to === key);
    if (match) {
      match.path = { x1, y1, x2, y2 };
    }
  });
}

// Window resize updates coordinates
window.addEventListener("resize", initMeshSVG);
setTimeout(initMeshSVG, 500); // Trigger after page settles

// Animate a packet from orchestrator to a node
function animatePacket(nodeKey, duration = 800) {
  const svg = document.getElementById("mesh-connections");
  const link = MESH_LINKS.find(l => l.to === nodeKey);
  if (!link || !link.path) return;
  
  const lineEl = document.getElementById(`line-${nodeKey}`);
  if (lineEl) {
    lineEl.classList.add("active-link");
    setTimeout(() => lineEl.classList.remove("active-link"), duration + 200);
  }
  
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("r", "5");
  circle.setAttribute("class", "flow-particle");
  svg.appendChild(circle);
  
  const { x1, y1, x2, y2 } = link.path;
  
  const startTime = performance.now();
  
  function frame(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Lerp
    const x = x1 + (x2 - x1) * progress;
    const y = y1 + (y2 - y1) * progress;
    
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      svg.removeChild(circle);
    }
  }
  
  requestAnimationFrame(frame);
}

// Agent Activation states helper
function setAgentActive(nodeId) {
  // Clear other active nodes
  document.querySelectorAll(".agent-node").forEach(n => {
    n.classList.remove("active-node");
  });
  
  const activeEl = document.getElementById(nodeId);
  if (activeEl) {
    activeEl.classList.add("active-node");
    activeEl.classList.remove("success-node");
  }
}

function setAgentSuccess(nodeId) {
  const el = document.getElementById(nodeId);
  if (el) {
    el.classList.remove("active-node");
    el.classList.add("success-node");
  }
}

function resetAllAgents() {
  document.querySelectorAll(".agent-node").forEach(n => {
    n.classList.remove("active-node");
    n.classList.remove("success-node");
  });
}

// =====================================================================
// LIVE LOGISTICS MAP & GEOFENCE TELEMETRY
// =====================================================================

function parseSVGPath(pathD) {
  // Parses a simple quadratic bezier path "M x y Q cx cy ex ey" or curve "M ... C ..."
  // For the simulator, since SVG paths are curves, we can use simple line segments 
  // or SVG's native getPointAtLength() for realistic path tracking!
  // This is highly professional and extremely robust.
  return document.getElementById(pathD);
}

function simulateTruckTrip(routeId, onComplete) {
  // Cancel existing animation
  if (APP_STATE.truckAnimation) {
    cancelAnimationFrame(APP_STATE.truckAnimation);
  }
  
  const route = APP_STATE.routes[routeId];
  const pathEl = document.getElementById(route.pathId);
  const geofenceCircle = document.getElementById(route.geofenceId);
  
  // Activate route visual
  document.querySelectorAll(".highway-path").forEach(p => p.classList.remove("active-route"));
  pathEl.classList.add("active-route");
  
  // Show truck
  elTruckMarker.classList.remove("invisible");
  
  // Reset geofence states
  document.querySelectorAll(".geofence-circle").forEach(c => c.parentElement.classList.remove("geofence-active"));
  elGeofenceAlertBadge.classList.add("hidden");
  
  APP_STATE.driver.status = "ACTIVE";
  elJwtBadgeStatus.innerText = "VALIDADO";
  elJwtBadgeStatus.className = "status-pill jwt-active";
  elJwtAlertBadge.classList.add("hidden");
  
  // Telemetry updates
  elTelTruckId.innerText = "TRK-01 (GPS)";
  elTelSpeed.innerText = "75 km/h";
  
  const pathLength = pathEl.getTotalLength();
  const duration = 8000; // 8 seconds trip
  const startTime = performance.now();
  
  logToTerminal("LOGÍSTICA", `Despachando Camión TRK-01 desde SD hacia ${route.destino}...`, "sys");
  
  function animate(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Get point on SVG path
    const point = pathEl.getPointAtLength(progress * pathLength);
    elTruckMarker.setAttribute("transform", `translate(${point.x}, ${point.y})`);
    
    APP_STATE.truckPosition = { x: point.x, y: point.y };
    
    // Telemetry mock
    // Santo Domingo coordinates (Base) -> Santiago or Punta Cana
    let lat = 18.4861 + (progress * 0.5 * (routeId === "R-01" ? 1 : -0.2));
    let lng = -69.9312 - (progress * 0.7 * (routeId === "R-01" ? 0.7 : -0.8));
    
    elTelLat.innerText = lat.toFixed(6);
    elTelLng.innerText = lng.toFixed(6);
    
    // PostGIS ST_Contains Logic: Calculate distance to target Hub
    const dx = point.x - route.targetX;
    const dy = point.y - route.targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < route.radius) {
      // Inside Geofence!
      document.getElementById(route.geofenceId).parentElement.classList.add("geofence-active");
      elTelGeofence.innerText = "ST_Contains = TRUE";
      elTelGeofence.className = "tel-val text-green font-bold";
      elGeofenceAlertBadge.classList.remove("hidden");
      
      // Trigger warning once in logs
      if (!APP_STATE.enteredGeofenceTriggered) {
        logToTerminal("PostGIS", `ST_Contains(${route.destino}_Geocerca, Truck_GPS) => TRUE. ¡Camión ingresando al Hub!`, "success");
        APP_STATE.enteredGeofenceTriggered = true;
      }
    } else {
      document.getElementById(route.geofenceId).parentElement.classList.remove("geofence-active");
      elTelGeofence.innerText = "ST_Contains = FALSE";
      elTelGeofence.className = "tel-val text-red font-bold";
      elGeofenceAlertBadge.classList.add("hidden");
    }
    
    if (progress < 1) {
      APP_STATE.truckAnimation = requestAnimationFrame(animate);
    } else {
      // Completed!
      elTelSpeed.innerText = "0 km/h (Llegado)";
      logToTerminal("LOGÍSTICA", `¡Camión TRK-01 ha arribado a su destino en ${route.destino}!`, "success");
      pathEl.classList.remove("active-route");
      if (onComplete) onComplete();
    }
  }
  
  APP_STATE.enteredGeofenceTriggered = false;
  APP_STATE.truckAnimation = requestAnimationFrame(animate);
}

// =====================================================================
// SLASH COMMANDS SIMULATION LOGIC
// =====================================================================

// Executer mapping
const STITCH_COMMANDS = {
  "/help": runHelpCommand,
  "/clear": runClearCommand,
  "/spec": runSpecCommand,
  "/plan": runPlanCommand,
  "/build": runBuildCommand,
  "/test": runTestCommand,
  "/review": runReviewCommand,
  "/ship": runShipCommand,
  "/run-mesh": runFullMeshWorkflow
};

function runHelpCommand() {
  logToTerminal("SISTEMA", "Lista de Comandos Disponibles:", "sys");
  logToTerminal("/run-mesh", "Ejecuta todo el flujo multi-agente de Caribe Delivery de inicio a fin (Recomendado).", "help");
  logToTerminal("/spec", "Diseña especificaciones, valida INTRANT y fiscalía DGII (Architect Agent).", "help");
  logToTerminal("/plan", "Genera el plan de base de datos prisma transaction y telemetría Redis (Developer Agent).", "help");
  logToTerminal("/build", "Escribe el código para actualizar NCF de manera segura (Developer Agent).", "help");
  logToTerminal("/test", "Prueba cálculos ITBIS y simula geocercas PostGIS ST_Contains (Tester Agent).", "help");
  logToTerminal("/review", "Audita el cifrado de llaves en .env y tokens JWT de conductores (Security Agent).", "help");
  logToTerminal("/ship", "Guarda el envío en Prisma, incrementa el NCF DGII y simula entrega (Malla Agéntica).", "help");
  logToTerminal("/clear", "Limpia la pantalla de comandos.", "help");
}

function runClearCommand() {
  elTermBody.innerHTML = "";
}

async function runSpecCommand(isSilent = false) {
  if (!isSilent) resetAllAgents();
  setAgentActive("node-architect");
  animatePacket("architect");
  
  logToTerminal("architect-agent", "Iniciando [/spec] - Diseñando especificaciones de envío...", "agent");
  await sleep(1000);
  
  const w = parseFloat(elWeight.value) || 0;
  logToTerminal("architect-agent", `-> Peso declarado: ${w} lbs. Cumple con normas INTRANT para transporte nacional (Max 500 lbs).`, "sys");
  
  const ncf = formatNcf(APP_STATE.ncfSequence);
  logToTerminal("architect-agent", `-> Destinatario requiere factura fiscal. Generando propuesta de NCF Tipo B01 (Crédito Fiscal) DGII.`, "sys");
  
  setAgentSuccess("node-architect");
  logToTerminal("Stitch Mesh", "[/spec] completado con éxito.", "success");
}

async function runPlanCommand(isSilent = false) {
  if (!isSilent) resetAllAgents();
  setAgentActive("node-developer");
  animatePacket("developer");
  
  logToTerminal("developer-agent", "Iniciando [/plan] - Modelando la arquitectura y almacenamiento...", "agent");
  await sleep(1000);
  
  logToTerminal("developer-agent", "-> Tarea 1: Estructurar tabla 'Envio' de Prisma con restricción CHECK (peso > 0).", "sys");
  logToTerminal("developer-agent", "-> Tarea 2: Diseñar bloque $transaction para bloquear secuencias de facturas y evitar colisiones NCF.", "sys");
  logToTerminal("developer-agent", "-> Tarea 3: Configurar Redis stream de telemetría gps: TRK01 para ruta Autopista Duarte.", "sys");
  
  setAgentSuccess("node-developer");
  logToTerminal("Stitch Mesh", "[/plan] completado con éxito.", "success");
}

async function runBuildCommand(isSilent = false) {
  if (!isSilent) resetAllAgents();
  setAgentActive("node-developer");
  animatePacket("developer");
  
  logToTerminal("developer-agent", "Iniciando [/build] - Escribiendo e integrando código de backend...", "agent");
  await sleep(1000);
  
  logToTerminal("developer-agent", "Generando transacción transaccional segura en base de datos:", "sys");
  logToTerminal("Prisma ORM", `
<pre style="font-family:inherit; color:#06b6d4; font-size:11.5px; margin: 4px 0 4px 12px;">
await prisma.$transaction(async (tx) => {
  const ncf = await tx.ncfSequence.update({
    where: { tipo: 'B01' },
    data: { ultimo: { increment: 1 } }
  });
  return ncf.ultimo;
});
</pre>`, "sys");
  
  setAgentSuccess("node-developer");
  logToTerminal("Stitch Mesh", "[/build] completado con éxito.", "success");
}

async function runTestCommand(isSilent = false) {
  if (!isSilent) resetAllAgents();
  setAgentActive("node-tester");
  animatePacket("tester");
  
  logToTerminal("tester-agent", "Iniciando [/test] - Corriendo batería de pruebas unitarias y geográficas...", "agent");
  await sleep(1000);
  
  // Math check
  const w = parseFloat(elWeight.value) || 0;
  const val = parseFloat(elValue.value) || 0;
  const base = 350 + (w > 15 ? (w - 15) * 15 : 0);
  const correctItbis = base * 0.18;
  logToTerminal("tester-agent", `-> Pruebas Tributarias: Validando cálculo automático de ITBIS (18%) -> RD$ ${correctItbis.toFixed(2)}. ✅ PASÓ`, "sys");
  
  // Geofence check
  const destId = elDestSelect.value;
  const route = APP_STATE.routes[destId];
  logToTerminal("tester-agent", `-> Pruebas Geo: Simulando ubicación de GPS del camión dentro de Santiago Hub... ST_Contains(Geocerca_${route.destino}, Camion_GPS) => TRUE. ✅ PASÓ`, "sys");
  
  setAgentSuccess("node-tester");
  logToTerminal("Stitch Mesh", "[/test] completado con éxito.", "success");
}

async function runReviewCommand(isSilent = false) {
  if (!isSilent) resetAllAgents();
  setAgentActive("node-auditor");
  animatePacket("auditor");
  
  logToTerminal("auditor-agent", "Iniciando [/review] - Auditando seguridad y políticas de cumplimiento...", "agent");
  await sleep(1000);
  
  logToTerminal("auditor-agent", "-> Verificación de entorno: Credenciales secretas de la API de DGII encriptadas de forma segura en .env.", "sys");
  
  if (APP_STATE.driver.status === "ACTIVE") {
    logToTerminal("auditor-agent", "-> Verificación de conductor: Token JWT de chofer TRK-01 es válido y expira de forma segura.", "sys");
    setAgentSuccess("node-auditor");
  } else {
    logToTerminal("auditor-agent", "🚨 ALERTA: ¡Token JWT del chofer TRK-01 está corrupto o ha expirado! Se requiere rotación inmediata.", "error");
    document.getElementById("node-auditor").classList.add("active-node");
  }
  
  logToTerminal("Stitch Mesh", "[/review] completado con éxito.", "success");
}

async function runShipCommand(isSilent = false) {
  if (!isSilent) resetAllAgents();
  setAgentActive("node-orchestrator");
  
  logToTerminal("Stitch Mesh", "Iniciando [/ship] - Ejecutando proceso final de despliegue y facturación...", "agent");
  await sleep(1000);
  
  // Simulate Prisma database transactional update
  const w = parseFloat(elWeight.value) || 0;
  const val = parseFloat(elValue.value) || 0;
  const base = 350 + (w > 15 ? (w - 15) * 15 : 0);
  const itbis = base * 0.18;
  const total = base + itbis;
  const ncfStr = formatNcf(APP_STATE.ncfSequence);
  
  const destId = elDestSelect.value;
  const route = APP_STATE.routes[destId];
  
  // DGII sequence locking simulation
  logToTerminal("Prisma DB", `Incrementando y bloqueando NCF sequence de forma segura...`, "sys");
  await sleep(600);
  
  // Record shipment
  const nuevoEnvio = {
    ncf: ncfStr,
    destino: route.destino,
    peso: w,
    itbis: itbis,
    total: total,
    estado: "En Trayecto"
  };
  
  APP_STATE.envios.push(nuevoEnvio);
  APP_STATE.ncfSequence++;
  
  renderLedgerTable();
  updateLedgerCount();
  calculateBill();
  
  logToTerminal("DGII API", `Comprobante Fiscal de Crédito Fiscal emitido con éxito: NCF ${ncfStr}`, "success");
  logToSecurity(`Comprobante fiscal B01 registrado en libro diario: NCF ${ncfStr}`, "info");
  
  setAgentSuccess("node-orchestrator");
  logToTerminal("Stitch Mesh", "🏁 [ÉXITO]: ¡Módulo de Caribe Delivery desplegado y envío despachado!", "success");
  
  // Trigger interactive truck map run
  simulateTruckTrip(destId, () => {
    // Once arrived, update state in database to Delivered
    nuevoEnvio.estado = "Delivered";
    renderLedgerTable();
  });
}

// Full Sequential Agent Workflow
async function runFullMeshWorkflow() {
  if (APP_STATE.meshRunning) return;
  APP_STATE.meshRunning = true;
  resetAllAgents();
  
  document.getElementById("mesh-active-status").innerText = "SIMULANDO";
  document.getElementById("mesh-active-status").className = "pulse-indicator text-amber";
  
  logToTerminal("Stitch Mesh", "🚀 INICIALIZANDO MALLA DE AGENTES EN ANTIGRAVITY PARA: CARIBE DELIVERY", "success");
  logToTerminal("Stitch Mesh", "================================================================================", "sys");
  
  await runSpecCommand(true);
  await sleep(1500);
  
  await runPlanCommand(true);
  await sleep(1500);
  
  await runBuildCommand(true);
  await sleep(1500);
  
  await runTestCommand(true);
  await sleep(1500);
  
  await runReviewCommand(true);
  await sleep(1500);
  
  await runShipCommand(true);
  
  document.getElementById("mesh-active-status").innerText = "DISPONIBLE";
  document.getElementById("mesh-active-status").className = "pulse-indicator text-cyan";
  APP_STATE.meshRunning = false;
}

// Form terminal command parser
elTermForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = elTermInput.value.trim();
  elTermInput.value = "";
  
  if (!input) return;
  
  // User log
  logToTerminal("TÚ", input, "user");
  
  const cmd = input.toLowerCase();
  
  if (STITCH_COMMANDS[cmd]) {
    STITCH_COMMANDS[cmd]();
  } else {
    logToTerminal("SISTEMA", `Comando no reconocido: "${input}". Escribe <span class='text-green'>/help</span> para ayuda.`, "error");
  }
});

// Clickable quick shortcuts
quickCmdBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const cmd = btn.getAttribute("data-cmd");
    logToTerminal("TÚ", cmd, "user");
    if (STITCH_COMMANDS[cmd]) {
      STITCH_COMMANDS[cmd]();
    }
  });
});

// Clear log button
btnClearTerm.addEventListener("click", runClearCommand);

// =====================================================================
// SECURITY AUDIT CONTROLS & ACTIONS
// =====================================================================

// Corrupt Driver Token
btnCorruptToken.addEventListener("click", () => {
  APP_STATE.driver.status = "COMPROMISED";
  APP_STATE.driver.ttl = 0;
  
  elJwtBadgeStatus.innerText = "COMPROMETIDO";
  elJwtBadgeStatus.className = "status-pill jwt-compromised";
  elJwtAlertBadge.classList.remove("hidden");
  
  logToTerminal("AUDITOR", "🚨 [INTRUSIÓN DE TELEMETRÍA]: Token JWT del conductor detectado como corrupto o manipulado en Autopista Duarte. Bloqueando streams de telemetría de Redis.", "error");
  logToSecurity("JWT del chofer TRK-01 corrupto. Sistema en cuarentena preventiva.", "danger");
  
  // Set auditor node to glowing warning red
  document.getElementById("node-auditor").classList.add("active-node");
  
  // Pause/Stop active GPS animation stream
  if (APP_STATE.truckAnimation) {
    cancelAnimationFrame(APP_STATE.truckAnimation);
    elTelSpeed.innerText = "0 km/h (CERRADO)";
    logToTerminal("Redis Telemetry", "Stream de telemetría bloqueado por Security Auditor Agent.", "error");
  }
});

// Rotate symmetric Keys
btnRotateKeys.addEventListener("click", async () => {
  setAgentActive("node-auditor");
  animatePacket("auditor");
  
  logToTerminal("auditor-agent", "Iniciando rotación preventiva de llaves criptográficas...", "agent");
  await sleep(1000);
  
  // Regenerate jwt details
  const randomHash = Math.random().toString(36).substring(2, 14);
  APP_STATE.driver.signature = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.CD-TRK01-SD-STI.${randomHash}`;
  APP_STATE.driver.ttl = 3600;
  APP_STATE.driver.status = "ACTIVE";
  
  // Update view
  elJwtSignature.innerText = APP_STATE.driver.signature;
  elJwtBadgeStatus.innerText = "VALIDADO";
  elJwtBadgeStatus.className = "status-pill jwt-active";
  elJwtAlertBadge.classList.add("hidden");
  
  logToTerminal("auditor-agent", "🔄 Llaves criptográficas de la DGII rotadas y nuevo JWT seguro firmado para chofer TRK-01.", "success");
  logToSecurity("Rotación preventiva exitosa. Nuevas firmas simétricas distribuidas en la malla.", "info");
  
  setAgentSuccess("node-auditor");
});
