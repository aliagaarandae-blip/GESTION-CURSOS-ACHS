import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, Calendar, LogOut, RefreshCw, QrCode, FileText,
  Upload, AlertTriangle, CheckCircle2, XCircle, Users, MapPin, Clock,
  Send, BarChart3, Filter, ChevronLeft, ChevronRight, Image as ImageIcon, Ban, Mail,
  MessageCircle, Search, Copy,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ============================================================================
// CONFIGURACIÓN — pega aquí la URL de tu Apps Script (termina en /exec)
// Mientras esté vacío, la app corre en modo demo con datos de ejemplo.
// ============================================================================
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw-G7DnT7cXCMsg1CNplEBO4BaePAXjq9Ccz8D0mgzY7z8Q2TRQebvLwZMIsUN89T6G/exec",
  AUTO_REFRESH_MS: 10 * 60 * 1000, // 10 minutos
  ASISTENTES_REFRESH_MS: 15 * 1000, // 15 segundos
  NOMBRE_APP: "Gestión de Capacitaciones",
};

const DEMO_MODE = !CONFIG.APPS_SCRIPT_URL;

const COLORS = {
  bg: "#f5f7f9",
  panel: "#ffffff",
  primary: "#0f5c56",
  primaryDark: "#0a3d39",
  ink: "#152225",
  sub: "#5b6b6e",
  border: "#e1e7e8",
  Asignado: "#2563eb",
  Focalizado: "#7c3aed",
  Suspendido: "#d97706",
  "Cancelado dentro de plazo": "#ea580c",
  "Cancelado fuera de plazo": "#dc2626",
  Finalizado: "#16a34a",
};

// Colores usados SOLO en la agenda (vista día/semana/mes) — combinan estado +
// fechas + si ya se cargó la focalización, según lo pedido:
// en ejecución = gris, asignado = amarillo, focalizado exitoso = verde,
// focalizado pendiente = naranjo, cancelado/suspendido = rojo.
const AGENDA_COLORS = {
  ejecucion: "#6b7280",
  asignado: "#ca8a04",
  focalizadoExitoso: "#16a34a",
  focalizadoPendiente: "#f97316",
  cancelado: "#dc2626",
  finalizado: "#64748b",
};
const CANCEL_STATES = ["Suspendido", "Cancelado dentro de plazo", "Cancelado fuera de plazo"];

function parseFecha(v) {
  const d = new Date(v);
  d.setHours(0, 0, 0, 0);
  return d;
}
function hoySinHora() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeekMonday(d) {
  const x = hoyDe(d);
  const day = (x.getDay() + 6) % 7; // 0 = lunes
  return addDays(x, -day);
}
function hoyDe(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameYMD(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function cursoActivoEnDia(curso, dia) {
  const ini = parseFecha(curso.FechaInicio);
  const fin = parseFecha(curso.FechaTermino);
  const d = hoyDe(dia);
  return d >= ini && d <= fin;
}
function estadoVisual(curso) {
  if (CANCEL_STATES.includes(curso.Estado)) return { color: AGENDA_COLORS.cancelado, label: "Cancelado / Suspendido" };
  if (curso.Estado !== "Finalizado" && cursoActivoEnDia(curso, hoySinHora())) {
    return { color: AGENDA_COLORS.ejecucion, label: "En ejecución" };
  }
  if (curso.Estado === "Focalizado") {
    return curso.FocalizacionCargada
      ? { color: AGENDA_COLORS.focalizadoExitoso, label: "Focalizado (exitoso)" }
      : { color: AGENDA_COLORS.focalizadoPendiente, label: "Focalizado (pendiente)" };
  }
  if (curso.Estado === "Asignado") return { color: AGENDA_COLORS.asignado, label: "Asignado" };
  if (curso.Estado === "Finalizado") return { color: AGENDA_COLORS.finalizado, label: "Finalizado" };
  return { color: COLORS.sub, label: curso.Estado };
}

// ============================================================================
// CAPA DE API — habla con Apps Script (o con datos demo si no hay URL)
// ============================================================================
async function api(action, payload = {}) {
  if (DEMO_MODE) return mockApi(action, payload);
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    // text/plain evita el preflight CORS que Apps Script no maneja
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error("Error de red: " + res.status);
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// MOCK DATA (solo para previsualizar la interfaz sin backend desplegado)
// ---------------------------------------------------------------------------
const MOCK_CURSOS = [
  { OP: "OP-2201", FechaInicio: "2026-07-27", FechaTermino: "2026-07-28", HoraInicio: "09:00", HoraTermino: "13:00", Lugar: "Sede Maipú", Direccion: "Av. Pajaritos 1234", Estado: "Asignado", Relator: "Juan Pérez", FocalizacionCargada: false },
  { OP: "OP-2202", FechaInicio: "2026-07-27", FechaTermino: "2026-07-27", HoraInicio: "14:00", HoraTermino: "18:00", Lugar: "Sede Puente Alto", Direccion: "Av. Concha y Toro 55", Estado: "Focalizado", Relator: "Juan Pérez", FocalizacionCargada: true },
  { OP: "OP-2203", FechaInicio: "2026-07-30", FechaTermino: "2026-07-30", HoraInicio: "09:00", HoraTermino: "12:00", Lugar: "Sede Central", Direccion: "Alameda 1000", Estado: "Focalizado", Relator: "Juan Pérez", FocalizacionCargada: false },
  { OP: "OP-2204", FechaInicio: "2026-08-05", FechaTermino: "2026-08-06", HoraInicio: "09:00", HoraTermino: "17:00", Lugar: "Sede La Florida", Direccion: "Vicuña Mackenna 7500", Estado: "Finalizado", Relator: "Juan Pérez", FocalizacionCargada: true },
  { OP: "OP-2205", FechaInicio: "2026-08-03", FechaTermino: "2026-08-03", HoraInicio: "10:00", HoraTermino: "13:00", Lugar: "Sede Ñuñoa", Direccion: "Irarrázaval 3000", Estado: "Cancelado dentro de plazo", Relator: "Juan Pérez", FocalizacionCargada: false },
];
const MOCK_ASISTENTES = [
  { OP: "OP-2201", Nombre: "Ana Torres", RUT: "12.345.678-9", Correo: "ana@mail.cl", Telefono: "+56911111111", FechaHoraInscripcion: "2026-07-28 09:03" },
  { OP: "OP-2201", Nombre: "Pedro Ramírez", RUT: "9.876.543-2", Correo: "pedro@mail.cl", Telefono: "+56922222222", FechaHoraInscripcion: "2026-07-28 09:05" },
];
let mockDocs = [];

async function mockApi(action, payload) {
  await new Promise((r) => setTimeout(r, 250));
  switch (action) {
    case "login": {
      if (payload.password !== "demo") return { ok: false, error: "Usuario o contraseña incorrectos." };
      if (payload.usuario === "admin") return { ok: true, usuario: "admin", rol: "Administrador", nombreRelator: "" };
      return { ok: true, usuario: payload.usuario, rol: "Relator", nombreRelator: "Juan Pérez" };
    }
    case "getCursos": {
      let cursos = MOCK_CURSOS;
      if (payload.rol === "Relator") cursos = cursos.filter((c) => c.Relator === "Juan Pérez");
      const alerta = cursos.some((c) => CANCEL_STATES.includes(c.Estado));
      const notificaciones = cursos
        .filter((c) => CANCEL_STATES.includes(c.Estado))
        .map((c) => ({ tipo: "cancelacion", op: c.OP, mensaje: `El curso ${c.OP} fue marcado como "${c.Estado}". Revise su agenda antes de asistir.` }));
      return { ok: true, cursos, alerta, notificaciones };
    }
    case "getCursoDetalle":
      return { ok: true, curso: MOCK_CURSOS.find((c) => c.OP === payload.op) };
    case "getAsistentes":
      return { ok: true, asistentes: MOCK_ASISTENTES.filter((a) => a.OP === payload.op) };
    case "getCheckinUrl":
      return { ok: true, url: null }; // en modo demo no hay backend real que reciba el registro
    case "registrarAsistente":
      MOCK_ASISTENTES.push({ OP: payload.op, Nombre: payload.nombre, RUT: payload.rut, Correo: payload.correo, Telefono: payload.telefono, FechaHoraInscripcion: new Date().toLocaleString() });
      return { ok: true };
    case "actualizarEstadoCurso": {
      const c = MOCK_CURSOS.find((x) => x.OP === payload.op);
      if (c) c.Estado = payload.estado;
      return { ok: true };
    }
    case "subirArchivo": {
      const doc = { OP: payload.op, Tipo: payload.tipo, NombreArchivo: payload.nombreArchivo, URL: "#", FechaHora: new Date().toLocaleString(), Usuario: payload.usuario };
      mockDocs.push(doc);
      const curso = MOCK_CURSOS.find((c) => c.OP === payload.op);
      if (curso && payload.tipo === "Focalizacion") curso.FocalizacionCargada = true;
      if (curso && payload.tipo === "Cierre") curso.CierreCargado = true;
      return { ok: true, url: "#" };
    }
    case "getDocumentos":
      return { ok: true, documentos: mockDocs.filter((d) => d.OP === payload.op) };
    case "getStats": {
      const porEstado = {};
      Object.keys(COLORS).forEach(() => {});
      ["Asignado", "Focalizado", "Suspendido", "Cancelado dentro de plazo", "Cancelado fuera de plazo", "Finalizado"].forEach((e) => (porEstado[e] = MOCK_CURSOS.filter((c) => c.Estado === e).length));
      const porRelator = {};
      MOCK_CURSOS.forEach((c) => (porRelator[c.Relator] = (porRelator[c.Relator] || 0) + 1));
      return { ok: true, total: MOCK_CURSOS.length, porEstado, porRelator, porMes: { "2026-07": 3, "2026-08": 2 }, asistentesPorOP: { "OP-2201": 2 }, porcentajeFinalizados: 20 };
    }
    case "enviarNotificacion":
      return { ok: true, enviados: (payload.destinatarios || []).length };
    default:
      return { ok: false, error: "Acción demo no implementada: " + action };
  }
}

// ============================================================================
// COMPONENTES BASE
// ============================================================================
function StatusBadge({ estado }) {
  const color = COLORS[estado] || COLORS.sub;
  return (
    <span
      style={{ background: color + "1a", color, border: `1px solid ${color}40` }}
      className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
    >
      {estado}
    </span>
  );
}

function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.sub }}>
      <RefreshCw size={14} className="animate-spin" /> {label || "Cargando..."}
    </div>
  );
}

function TopBar({ title, onBack, onRefresh, refreshing, right }) {
  return (
    <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-black/5" style={{ color: COLORS.primary }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <h1 className="text-xl font-bold" style={{ color: COLORS.ink }}>{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {right}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border transition"
            style={{ borderColor: COLORS.border, color: COLORS.primary }}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Actualizar
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// LOGIN
// ============================================================================
function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api("login", { usuario, password });
      if (!res.ok) setError(res.error || "No se pudo iniciar sesión.");
      else onLogin(res);
    } catch (err) {
      setError("Error de conexión: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: COLORS.bg }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white font-bold text-xl"
            style={{ background: COLORS.primary }}
          >
            GC
          </div>
          <h1 className="text-2xl font-bold" style={{ color: COLORS.ink }}>{CONFIG.NOMBRE_APP}</h1>
          <p className="text-sm mt-1" style={{ color: COLORS.sub }}>Ingresa con tu usuario y contraseña</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl p-6 shadow-sm border" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: COLORS.ink }}>Usuario</label>
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="w-full mb-4 px-3 py-2.5 rounded-lg border outline-none focus:ring-2"
            style={{ borderColor: COLORS.border }}
            required
          />
          <label className="block text-sm font-semibold mb-1.5" style={{ color: COLORS.ink }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 px-3 py-2.5 rounded-lg border outline-none focus:ring-2"
            style={{ borderColor: COLORS.border }}
            required
          />
          {error && (
            <div className="text-sm mb-3 px-3 py-2 rounded-lg" style={{ background: "#fef2f2", color: "#b91c1c" }}>
              {error}
            </div>
          )}
          {DEMO_MODE && (
            <div className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
              Modo demo (sin backend conectado): usuario <b>admin</b> o <b>jperez</b>, contraseña <b>demo</b>.
            </div>
          )}
          <button
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-white font-semibold"
            style={{ background: COLORS.primary }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR
// ============================================================================
function Sidebar({ session, view, setView, onLogout }) {
  const items =
    session.rol === "Administrador"
      ? [
          { id: "cursos", label: "Cursos", icon: LayoutDashboard },
          { id: "stats", label: "Estadísticas", icon: BarChart3 },
          { id: "comunicaciones", label: "Comunicaciones", icon: Send },
        ]
      : [{ id: "agenda", label: "Mi agenda", icon: Calendar }];

  return (
    <div className="w-56 shrink-0 flex flex-col justify-between py-6 px-3 border-r" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
      <div>
        <div className="px-3 mb-8">
          <div className="w-10 h-10 rounded-xl mb-2 flex items-center justify-center text-white font-bold" style={{ background: COLORS.primary }}>GC</div>
          <div className="text-xs font-semibold" style={{ color: COLORS.sub }}>{session.rol}</div>
          <div className="text-sm font-bold truncate" style={{ color: COLORS.ink }}>{session.nombreRelator || session.usuario}</div>
        </div>
        <nav className="space-y-1">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition"
              style={{
                background: view === it.id ? COLORS.primary + "14" : "transparent",
                color: view === it.id ? COLORS.primary : COLORS.ink,
              }}
            >
              <it.icon size={18} /> {it.label}
            </button>
          ))}
        </nav>
      </div>
      <button onClick={onLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-black/5" style={{ color: COLORS.sub }}>
        <LogOut size={18} /> Cerrar sesión
      </button>
    </div>
  );
}

// ============================================================================
// AGENDA DEL RELATOR — solo sus cursos, vistas Día / Semana / Mes
// ============================================================================
function CourseCard({ curso, onOpen }) {
  const visual = estadoVisual(curso);
  return (
    <button
      onClick={onOpen}
      className="text-left w-full rounded-xl p-4 border shadow-sm hover:shadow-md transition border-l-4"
      style={{ background: COLORS.panel, borderColor: COLORS.border, borderLeftColor: visual.color }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold" style={{ color: COLORS.primary }}>{curso.OP}</span>
        <span style={{ background: visual.color + "1a", color: visual.color, border: `1px solid ${visual.color}40` }} className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
          {visual.label}
        </span>
      </div>
      <div className="text-sm flex items-center gap-1.5 mb-1" style={{ color: COLORS.ink }}>
        <Calendar size={14} /> {curso.FechaInicio} — {curso.FechaTermino}
      </div>
      <div className="text-sm flex items-center gap-1.5 mb-1" style={{ color: COLORS.sub }}>
        <Clock size={14} /> {curso.HoraInicio} a {curso.HoraTermino}
      </div>
      <div className="text-sm flex items-center gap-1.5" style={{ color: COLORS.sub }}>
        <MapPin size={14} /> {curso.Lugar} · {curso.Direccion}
      </div>
    </button>
  );
}

function LeyendaColores() {
  const items = [
    { color: AGENDA_COLORS.ejecucion, label: "En ejecución" },
    { color: AGENDA_COLORS.asignado, label: "Asignado" },
    { color: AGENDA_COLORS.focalizadoExitoso, label: "Focalizado exitoso" },
    { color: AGENDA_COLORS.focalizadoPendiente, label: "Focalizado pendiente" },
    { color: AGENDA_COLORS.cancelado, label: "Cancelado / Suspendido" },
  ];
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.sub }}>
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: it.color }} /> {it.label}
        </div>
      ))}
    </div>
  );
}

function VistaSelector({ vista, setVista }) {
  const opciones = [{ id: "dia", label: "Día" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mes" }];
  return (
    <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: COLORS.border }}>
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => setVista(o.id)}
          className="px-3 py-1.5 text-sm font-medium"
          style={{ background: vista === o.id ? COLORS.primary : COLORS.panel, color: vista === o.id ? "#fff" : COLORS.ink }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NavFecha({ fechaRef, setFechaRef, vista }) {
  const paso = vista === "dia" ? 1 : vista === "semana" ? 7 : 30;
  const etiqueta =
    vista === "dia"
      ? fechaRef.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : vista === "semana"
      ? `Semana del ${startOfWeekMonday(fechaRef).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}`
      : fechaRef.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setFechaRef((f) => (vista === "mes" ? new Date(f.getFullYear(), f.getMonth() - 1, 1) : addDays(f, -paso)))} className="p-1.5 rounded-lg border" style={{ borderColor: COLORS.border, color: COLORS.primary }}>
        <ChevronLeft size={16} />
      </button>
      <button onClick={() => setFechaRef(hoySinHora())} className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ color: COLORS.primary }}>Hoy</button>
      <span className="text-sm font-semibold capitalize" style={{ color: COLORS.ink }}>{etiqueta}</span>
      <button onClick={() => setFechaRef((f) => (vista === "mes" ? new Date(f.getFullYear(), f.getMonth() + 1, 1) : addDays(f, paso)))} className="p-1.5 rounded-lg border" style={{ borderColor: COLORS.border, color: COLORS.primary }}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function VistaDia({ cursos, fechaRef, onOpenCurso }) {
  const delDia = cursos.filter((c) => cursoActivoEnDia(c, fechaRef));
  if (delDia.length === 0) return <div className="text-sm" style={{ color: COLORS.sub }}>No tienes cursos este día.</div>;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {delDia.map((c) => <CourseCard key={c.OP} curso={c} onOpen={() => onOpenCurso(c.OP)} />)}
    </div>
  );
}

function VistaSemana({ cursos, fechaRef, onOpenCurso }) {
  const inicio = startOfWeekMonday(fechaRef);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(120px, 1fr))" }}>
      {dias.map((dia) => {
        const delDia = cursos.filter((c) => cursoActivoEnDia(c, dia));
        const esHoy = sameYMD(dia, hoySinHora());
        return (
          <div key={dia.toISOString()} className="rounded-lg border p-2 min-h-[140px]" style={{ borderColor: esHoy ? COLORS.primary : COLORS.border, background: COLORS.panel }}>
            <div className="text-xs font-semibold mb-2 capitalize" style={{ color: esHoy ? COLORS.primary : COLORS.sub }}>
              {dia.toLocaleDateString("es-CL", { weekday: "short", day: "numeric" })}
            </div>
            <div className="space-y-1.5">
              {delDia.map((c) => {
                const v = estadoVisual(c);
                return (
                  <button key={c.OP} onClick={() => onOpenCurso(c.OP)} className="w-full text-left text-xs px-2 py-1.5 rounded-md" style={{ background: v.color + "1a", color: v.color, border: `1px solid ${v.color}40` }}>
                    <div className="font-semibold">{c.OP}</div>
                    <div>{c.HoraInicio}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VistaMes({ cursos, fechaRef, onOpenCurso }) {
  const primerDiaMes = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), 1);
  const inicioGrilla = startOfWeekMonday(primerDiaMes);
  const celdas = Array.from({ length: 42 }, (_, i) => addDays(inicioGrilla, i));
  const nombresDias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {nombresDias.map((n) => <div key={n} className="text-xs font-semibold text-center py-1" style={{ color: COLORS.sub }}>{n}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia) => {
          const delDia = cursos.filter((c) => cursoActivoEnDia(c, dia));
          const enEsteMes = dia.getMonth() === fechaRef.getMonth();
          const esHoy = sameYMD(dia, hoySinHora());
          return (
            <div
              key={dia.toISOString()}
              className="rounded-lg border p-1.5 min-h-[86px]"
              style={{ borderColor: esHoy ? COLORS.primary : COLORS.border, background: enEsteMes ? COLORS.panel : COLORS.bg, opacity: enEsteMes ? 1 : 0.5 }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: esHoy ? COLORS.primary : COLORS.ink }}>{dia.getDate()}</div>
              <div className="space-y-1">
                {delDia.slice(0, 2).map((c) => {
                  const v = estadoVisual(c);
                  return (
                    <button key={c.OP} onClick={() => onOpenCurso(c.OP)} className="w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate" style={{ background: v.color + "1a", color: v.color }}>
                      {c.OP}
                    </button>
                  );
                })}
                {delDia.length > 2 && <div className="text-[10px]" style={{ color: COLORS.sub }}>+{delDia.length - 2} más</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RelatorAgenda({ session, onOpenCurso }) {
  const [cursos, setCursos] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vista, setVista] = useState("dia");
  const [fechaRef, setFechaRef] = useState(hoySinHora());

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api("getCursos", { usuario: session.usuario, rol: session.rol });
      if (res.ok) {
        setCursos(res.cursos);
        setNotificaciones(res.notificaciones || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), CONFIG.AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <TopBar title="Mi agenda" onRefresh={() => load(true)} refreshing={refreshing} />
      {notificaciones.length > 0 && (
        <div className="mb-5 space-y-2">
          {notificaciones.map((n, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: n.tipo === "reasignacion" ? "#eff6ff" : "#fffbeb", border: `1px solid ${n.tipo === "reasignacion" ? "#bfdbfe" : "#fde68a"}` }}>
              <AlertTriangle size={20} style={{ color: n.tipo === "reasignacion" ? "#1d4ed8" : "#b45309" }} className="mt-0.5 shrink-0" />
              <div className="text-sm font-medium" style={{ color: n.tipo === "reasignacion" ? "#1e40af" : "#92400e" }}>{n.mensaje}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <NavFecha fechaRef={fechaRef} setFechaRef={setFechaRef} vista={vista} />
        <VistaSelector vista={vista} setVista={setVista} />
      </div>
      <LeyendaColores />
      {loading ? (
        <Spinner label="Cargando cursos..." />
      ) : cursos.length === 0 ? (
        <div className="text-sm" style={{ color: COLORS.sub }}>No tienes cursos asignados por el momento.</div>
      ) : vista === "dia" ? (
        <VistaDia cursos={cursos} fechaRef={fechaRef} onOpenCurso={onOpenCurso} />
      ) : vista === "semana" ? (
        <VistaSemana cursos={cursos} fechaRef={fechaRef} onOpenCurso={onOpenCurso} />
      ) : (
        <VistaMes cursos={cursos} fechaRef={fechaRef} onOpenCurso={onOpenCurso} />
      )}
    </div>
  );
}

// ============================================================================
// FICHA DE CURSO — 6 pestañas
// ============================================================================
const TABS = [
  { id: "info", label: "Información", icon: FileText },
  { id: "asistentes", label: "Registro (QR)", icon: QrCode },
  { id: "cierre", label: "Cierre", icon: CheckCircle2 },
  { id: "focalizacion", label: "Focalización", icon: Upload },
  { id: "boletas", label: "Boletas", icon: ImageIcon },
  { id: "suspender", label: "Suspender", icon: Ban },
];

function CourseDetail({ op, session, onBack }) {
  const [curso, setCurso] = useState(null);
  const [tab, setTab] = useState("info");

  const loadCurso = useCallback(async () => {
    const res = await api("getCursoDetalle", { op });
    if (res.ok) setCurso(res.curso);
  }, [op]);

  useEffect(() => {
    loadCurso();
  }, [loadCurso]);

  if (!curso) return <Spinner label="Cargando ficha del curso..." />;

  const isRelator = session.rol === "Relator";
  const tabsVisibles = isRelator ? TABS : TABS.filter((t) => t.id !== "suspender" || true); // admin puede ver todo, solo no sube archivos

  return (
    <div>
      <TopBar
        title={`Curso ${curso.OP}`}
        onBack={onBack}
        right={<StatusBadge estado={curso.Estado} />}
      />
      <div className="flex gap-1 mb-5 border-b overflow-x-auto" style={{ borderColor: COLORS.border }}>
        {tabsVisibles.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition"
            style={{
              borderColor: tab === t.id ? COLORS.primary : "transparent",
              color: tab === t.id ? COLORS.primary : COLORS.sub,
            }}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && <TabInfo curso={curso} />}
      {tab === "asistentes" && <TabAsistentes curso={curso} />}
      {tab === "cierre" && <TabCierre curso={curso} session={session} isRelator={isRelator} onEstadoChange={loadCurso} />}
      {tab === "focalizacion" && <TabArchivos curso={curso} session={session} isRelator={isRelator} tipo="Focalizacion" formatos={[".pdf", ".xlsx"]} titulo="Focalización" />}
      {tab === "boletas" && <TabArchivos curso={curso} session={session} isRelator={isRelator} tipo="Boletas" formatos={["imagen", ".pdf"]} titulo="Boletas" multiple />}
      {tab === "suspender" && <TabSuspender curso={curso} session={session} isRelator={isRelator} onEstadoChange={loadCurso} />}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2.5 border-b" style={{ borderColor: COLORS.border }}>
      <span className="text-sm" style={{ color: COLORS.sub }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>{value}</span>
    </div>
  );
}

function TabInfo({ curso }) {
  return (
    <div className="max-w-xl rounded-xl border p-5" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
      <InfoRow label="OP" value={curso.OP} />
      <InfoRow label="Fecha" value={`${curso.FechaInicio} — ${curso.FechaTermino}`} />
      <InfoRow label="Horario" value={`${curso.HoraInicio} a ${curso.HoraTermino}`} />
      <InfoRow label="Lugar" value={curso.Lugar} />
      <InfoRow label="Dirección" value={curso.Direccion} />
      <InfoRow label="Relator asignado" value={curso.Relator} />
      <div className="flex justify-between py-2.5">
        <span className="text-sm" style={{ color: COLORS.sub }}>Estado</span>
        <StatusBadge estado={curso.Estado} />
      </div>
    </div>
  );
}

function TabAsistentes({ curso }) {
  const [asistentes, setAsistentes] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [checkinUrl, setCheckinUrl] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const load = useCallback(async () => {
    const res = await api("getAsistentes", { op: curso.OP });
    if (res.ok) setAsistentes(res.asistentes);
  }, [curso.OP]);

  useEffect(() => {
    load();
    const t = setInterval(load, CONFIG.ASISTENTES_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    // Pedimos la URL real al backend (usa ScriptApp.getService().getUrl(), así
    // que siempre coincide con el despliegue vigente, aunque haya cambiado).
    api("getCheckinUrl", { op: curso.OP }).then((res) => {
      if (res.ok && res.url) setCheckinUrl(res.url);
    });
  }, [curso.OP]);

  const qrImg = checkinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(checkinUrl)}`
    : null;

  function copiarEnlace() {
    navigator.clipboard.writeText(checkinUrl).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="rounded-xl border p-5 flex flex-col items-center justify-center text-center" style={{ background: COLORS.panel, borderColor: COLORS.border, minHeight: 280 }}>
        {!showQR ? (
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-lg text-white font-semibold"
            style={{ background: COLORS.primary }}
          >
            <QrCode size={18} /> Mostrar QR
          </button>
        ) : qrImg ? (
          <>
            <img src={qrImg} alt="Código QR de asistencia" className="rounded-lg border" style={{ borderColor: COLORS.border }} />
            <p className="text-xs mt-3 mb-2" style={{ color: COLORS.sub }}>Los asistentes escanean este código para registrar su asistencia.</p>
            <div className="flex items-center gap-2 max-w-full">
              <a href={checkinUrl} target="_blank" rel="noreferrer" className="text-xs underline truncate max-w-[220px]" style={{ color: COLORS.primary }}>
                {checkinUrl}
              </a>
              <button onClick={copiarEnlace} className="p-1.5 rounded-md border shrink-0" style={{ borderColor: COLORS.border, color: COLORS.primary }} title="Copiar enlace">
                <Copy size={13} />
              </button>
            </div>
            {copiado && <p className="text-xs mt-1" style={{ color: COLORS.Finalizado }}>¡Enlace copiado!</p>}
            <p className="text-xs mt-2" style={{ color: COLORS.sub }}>
              Consejo: si el QR no lleva a ningún lado, abre este enlace directamente en tu navegador para
              confirmar que el formulario de registro carga bien antes de compartirlo.
            </p>
          </>
        ) : DEMO_MODE ? (
          <p className="text-sm" style={{ color: COLORS.sub }}>El QR real se genera una vez que conectes la URL de Apps Script en CONFIG.</p>
        ) : (
          <Spinner label="Generando enlace de registro..." />
        )}
      </div>
      <div className="rounded-xl border p-5" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold" style={{ color: COLORS.ink }}>
            <Users size={16} /> Asistentes inscritos ({asistentes.length})
          </div>
          <span className="text-xs" style={{ color: COLORS.sub }}>Se actualiza cada 15s</span>
        </div>
        <div className="space-y-2 max-h-64 overflow-auto">
          {asistentes.length === 0 && <p className="text-sm" style={{ color: COLORS.sub }}>Aún no hay inscritos.</p>}
          {asistentes.map((a, i) => (
            <div key={i} className="flex justify-between text-sm py-2 border-b" style={{ borderColor: COLORS.border }}>
              <div>
                <div className="font-medium" style={{ color: COLORS.ink }}>{a.Nombre}</div>
                <div style={{ color: COLORS.sub }}>{a.RUT}</div>
              </div>
              <div className="text-right text-xs" style={{ color: COLORS.sub }}>{a.FechaHoraInscripcion}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadBox({ label, hint, accept, multiple, onUpload, uploading }) {
  const inputRef = useRef();
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer hover:bg-black/[0.02]"
      style={{ borderColor: COLORS.border }}
    >
      <Upload size={22} className="mx-auto mb-2" style={{ color: COLORS.primary }} />
      <div className="text-sm font-semibold" style={{ color: COLORS.ink }}>{uploading ? "Subiendo..." : label}</div>
      <div className="text-xs mt-1" style={{ color: COLORS.sub }}>{hint}</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files.length && onUpload(Array.from(e.target.files))}
      />
    </div>
  );
}

function TabCierre({ curso, session, isRelator, onEstadoChange }) {
  const [archivo, setArchivo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function handleUpload(files) {
    setUploading(true);
    try {
      const file = files[0];
      const base64Data = await fileToBase64(file);
      const res = await api("subirArchivo", {
        op: curso.OP, tipo: "Cierre", nombreArchivo: file.name,
        mimeType: file.type, base64Data, usuario: session.usuario,
      });
      if (res.ok) { setArchivo(file.name); setMensaje("Planilla cargada correctamente."); }
    } finally {
      setUploading(false);
    }
  }

  async function cerrarCurso() {
    setCerrando(true);
    try {
      await api("actualizarEstadoCurso", { op: curso.OP, estado: "Finalizado", usuario: session.usuario });
      setMensaje("Curso cerrado y enviado correctamente.");
      onEstadoChange();
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm" style={{ color: COLORS.sub }}>
        Para cerrar el curso solo se requiere cargar la planilla de cierre (foto o PDF).
      </p>
      {isRelator && (
        <UploadBox
          label={archivo ? `Cargado: ${archivo}` : "Subir foto o PDF de la planilla de cierre"}
          hint="Formatos: imagen o PDF"
          accept="image/*,.pdf"
          onUpload={handleUpload}
          uploading={uploading}
        />
      )}
      {mensaje && <div className="text-sm px-3 py-2 rounded-lg" style={{ background: "#f0fdf4", color: "#15803d" }}>{mensaje}</div>}
      {isRelator && (
        <button
          disabled={!archivo || cerrando || curso.Estado === "Finalizado"}
          onClick={cerrarCurso}
          className="w-full py-3 rounded-lg text-white font-semibold disabled:opacity-40"
          style={{ background: COLORS.primary }}
        >
          {curso.Estado === "Finalizado" ? "Curso ya finalizado" : cerrando ? "Enviando..." : "Cerrar y Enviar Curso"}
        </button>
      )}
    </div>
  );
}

function TabArchivos({ curso, session, isRelator, tipo, formatos, titulo, multiple }) {
  const [archivos, setArchivos] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api("getDocumentos", { op: curso.OP }).then((res) => {
      if (res.ok) setArchivos(res.documentos.filter((d) => d.Tipo === tipo));
    });
  }, [curso.OP, tipo]);

  async function handleUpload(files) {
    setUploading(true);
    try {
      for (const file of files) {
        const base64Data = await fileToBase64(file);
        await api("subirArchivo", { op: curso.OP, tipo, nombreArchivo: file.name, mimeType: file.type, base64Data, usuario: session.usuario });
        setArchivos((prev) => [...prev, { NombreArchivo: file.name, FechaHora: new Date().toLocaleString() }]);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm" style={{ color: COLORS.sub }}>
        {titulo} — pestaña independiente, no es requisito para cerrar el curso. Formatos: {formatos.join(", ")}.
      </p>
      {isRelator && (
        <UploadBox
          label={`Subir ${titulo.toLowerCase()}`}
          hint={multiple ? "Puedes subir varios archivos" : "Reemplaza el archivo por una versión más reciente si es necesario"}
          accept={formatos.includes("imagen") ? "image/*,.pdf" : ".pdf,.xlsx"}
          multiple={multiple}
          onUpload={handleUpload}
          uploading={uploading}
        />
      )}
      <div className="space-y-2">
        {archivos.map((a, i) => (
          <div key={i} className="flex justify-between items-center text-sm rounded-lg border px-3 py-2" style={{ borderColor: COLORS.border }}>
            <span style={{ color: COLORS.ink }}>{a.NombreArchivo}</span>
            <span className="text-xs" style={{ color: COLORS.sub }}>{a.FechaHora}</span>
          </div>
        ))}
        {archivos.length === 0 && <p className="text-sm" style={{ color: COLORS.sub }}>No hay archivos cargados aún.</p>}
      </div>
    </div>
  );
}

function TabSuspender({ curso, session, isRelator, onEstadoChange }) {
  const [planilla, setPlanilla] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ok, setOk] = useState(false);

  async function subir(files, esFoto) {
    setUploading(true);
    try {
      for (const file of files) {
        const base64Data = await fileToBase64(file);
        await api("subirArchivo", { op: curso.OP, tipo: "Suspension", nombreArchivo: file.name, mimeType: file.type, base64Data, usuario: session.usuario });
      }
      if (esFoto) setFotos((prev) => [...prev, ...files.map((f) => f.name)]);
      else setPlanilla(files[0].name);
    } finally {
      setUploading(false);
    }
  }

  async function confirmar() {
    setConfirmando(true);
    try {
      await api("actualizarEstadoCurso", { op: curso.OP, estado: "Suspendido", usuario: session.usuario });
      setOk(true);
      onEstadoChange();
    } finally {
      setConfirmando(false);
    }
  }

  if (!isRelator) return <p className="text-sm" style={{ color: COLORS.sub }}>Solo el relator puede suspender el curso.</p>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: "#fff7ed", color: "#9a3412" }}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Se requiere obligatoriamente la planilla de respaldo Y al menos una fotografía de evidencia.
      </div>
      <UploadBox label={planilla ? `Planilla: ${planilla}` : "Subir planilla de respaldo"} hint="PDF o imagen" accept="image/*,.pdf" onUpload={(f) => subir(f, false)} uploading={uploading} />
      <UploadBox label={fotos.length ? `${fotos.length} foto(s) cargada(s)` : "Subir fotografías de evidencia"} hint="Puedes subir varias" accept="image/*" multiple onUpload={(f) => subir(f, true)} uploading={uploading} />
      {ok && <div className="text-sm px-3 py-2 rounded-lg" style={{ background: "#f0fdf4", color: "#15803d" }}>Curso marcado como Suspendido. El administrador fue notificado.</div>}
      <button
        disabled={!planilla || fotos.length === 0 || confirmando || curso.Estado === "Suspendido"}
        onClick={confirmar}
        className="w-full py-3 rounded-lg text-white font-semibold disabled:opacity-40"
        style={{ background: "#dc2626" }}
      >
        {curso.Estado === "Suspendido" ? "Curso ya suspendido" : confirmando ? "Confirmando..." : "Confirmar Suspensión"}
      </button>
    </div>
  );
}

// ============================================================================
// PANEL ADMINISTRADOR
// ============================================================================
function AdminCursos({ onOpenCurso }) {
  const [cursos, setCursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroRelator, setFiltroRelator] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const load = useCallback(async (silent) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await api("getCursos", { rol: "Administrador" });
      if (res.ok) setCursos(res.cursos);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), CONFIG.AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const relatores = [...new Set(cursos.map((c) => c.Relator))];
  const filtrados = cursos.filter(
    (c) =>
      (!filtroEstado || c.Estado === filtroEstado) &&
      (!filtroRelator || c.Relator === filtroRelator) &&
      (!busqueda || c.OP.toLowerCase().includes(busqueda.toLowerCase()) || c.Lugar.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div>
      <TopBar title="Todos los cursos" onRefresh={() => load(true)} refreshing={refreshing} />
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
          <Search size={14} style={{ color: COLORS.sub }} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar OP o lugar" className="text-sm outline-none" />
        </div>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: COLORS.border }}>
          <option value="">Todos los estados</option>
          {Object.keys(COLORS).filter((k) => !["bg","panel","primary","primaryDark","ink","sub","border"].includes(k)).map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filtroRelator} onChange={(e) => setFiltroRelator(e.target.value)} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: COLORS.border }}>
          <option value="">Todos los relatores</option>
          {relatores.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["OP", "Fecha", "Lugar", "Relator", "Estado"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold" style={{ color: COLORS.sub }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.OP} className="border-t cursor-pointer hover:bg-black/[0.02]" style={{ borderColor: COLORS.border }} onClick={() => onOpenCurso(c.OP)}>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: COLORS.primary }}>{c.OP}</td>
                  <td className="px-4 py-2.5">{c.FechaInicio}</td>
                  <td className="px-4 py-2.5">{c.Lugar}</td>
                  <td className="px-4 py-2.5">{c.Relator}</td>
                  <td className="px-4 py-2.5"><StatusBadge estado={c.Estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.sub }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: COLORS.ink }}>{value}</div>
    </div>
  );
}

function AdminStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api("getStats", {}).then((r) => r.ok && setStats(r)); }, []);
  if (!stats) return <Spinner />;

  const estadoData = Object.entries(stats.porEstado).map(([name, value]) => ({ name, value }));
  const relatorData = Object.entries(stats.porRelator).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <TopBar title="Estadísticas" />
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <StatCard label="Total de cursos" value={stats.total} />
        <StatCard label="Asignados" value={stats.porEstado["Asignado"] || 0} />
        <StatCard label="Focalizados" value={stats.porEstado["Focalizado"] || 0} />
        <StatCard label="Suspendidos" value={stats.porEstado["Suspendido"] || 0} />
        <StatCard label="Finalizados" value={stats.porEstado["Finalizado"] || 0} />
        <StatCard label="% Finalizados" value={stats.porcentajeFinalizados + "%"} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Cursos por estado</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={estadoData} dataKey="value" nameKey="name" outerRadius={80}>
                {estadoData.map((d, i) => <Cell key={i} fill={COLORS[d.name] || COLORS.sub} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border p-4" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Cursos por relator</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={relatorData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function AdminComunicaciones() {
  const [canal, setCanal] = useState("email");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [destinatarios, setDestinatarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function enviar() {
    setEnviando(true);
    setResultado(null);
    try {
      const lista = destinatarios.split(",").map((d) => d.trim()).filter(Boolean);
      const res = await api("enviarNotificacion", { canal, asunto, mensaje, destinatarios: lista });
      setResultado(res);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <TopBar title="Comunicaciones" />
      <div className="max-w-lg rounded-xl border p-5 space-y-4" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
        <div className="flex gap-2">
          <button onClick={() => setCanal("email")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: canal === "email" ? COLORS.primary : COLORS.border, color: canal === "email" ? COLORS.primary : COLORS.sub }}>
            <Mail size={14} /> Correo
          </button>
          <button onClick={() => setCanal("whatsapp")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: canal === "whatsapp" ? COLORS.primary : COLORS.border, color: canal === "whatsapp" ? COLORS.primary : COLORS.sub }}>
            <MessageCircle size={14} /> WhatsApp
          </button>
        </div>
        <div>
          <label className="text-sm font-semibold" style={{ color: COLORS.ink }}>Destinatarios (separados por coma)</label>
          <input value={destinatarios} onChange={(e) => setDestinatarios(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.border }} placeholder={canal === "email" ? "correo1@mail.cl, correo2@mail.cl" : "+56911111111, +56922222222"} />
        </div>
        {canal === "email" && (
          <div>
            <label className="text-sm font-semibold" style={{ color: COLORS.ink }}>Asunto</label>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.border }} />
          </div>
        )}
        <div>
          <label className="text-sm font-semibold" style={{ color: COLORS.ink }}>Mensaje</label>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.border }} placeholder="Recordatorio, cambio de horario, cambio de lugar, reasignación, suspensión, cancelación o mensaje personalizado" />
        </div>
        {resultado && (
          <div className="text-sm px-3 py-2 rounded-lg" style={{ background: resultado.ok ? "#f0fdf4" : "#fef2f2", color: resultado.ok ? "#15803d" : "#b91c1c" }}>
            {resultado.ok ? `Enviado a ${resultado.enviados} destinatario(s).` : resultado.error}
          </div>
        )}
        <button onClick={enviar} disabled={enviando || !mensaje || !destinatarios} className="w-full py-2.5 rounded-lg text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: COLORS.primary }}>
          <Send size={15} /> {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// APP RAÍZ
// ============================================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("agenda");
  const [openOp, setOpenOp] = useState(null);

  function handleLogin(res) {
    setSession(res);
    setView(res.rol === "Administrador" ? "cursos" : "agenda");
  }

  if (!session) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen flex" style={{ background: COLORS.bg, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      <Sidebar session={session} view={view} setView={(v) => { setView(v); setOpenOp(null); }} onLogout={() => setSession(null)} />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        {openOp ? (
          <CourseDetail op={openOp} session={session} onBack={() => setOpenOp(null)} />
        ) : view === "agenda" ? (
          <RelatorAgenda session={session} onOpenCurso={setOpenOp} />
        ) : view === "cursos" ? (
          <AdminCursos onOpenCurso={setOpenOp} />
        ) : view === "stats" ? (
          <AdminStats />
        ) : view === "comunicaciones" ? (
          <AdminComunicaciones />
        ) : null}
      </div>
    </div>
  );
}
