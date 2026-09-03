import { useState, useEffect, useMemo, useRef, useContext, createContext } from "react";
import {
  Search, Plus, Star, Archive, Settings, Tag, Folder, FolderPlus,
  Globe, Github, Youtube, FileText, ExternalLink, Command, Keyboard,
  Download, Upload, Trash2, Pencil, X, ChevronLeft, ChevronDown,
  ChevronRight, Check, CornerDownLeft, RotateCcw, Filter, LayoutGrid,
  Menu, Sun, Moon, Home, ArrowRight, Zap, MoreHorizontal,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  MOCK DATA                                                          */
/* ------------------------------------------------------------------ */

const BOARDS = [
  { id: "ai", name: "AI" },
  { id: "webdev", name: "Web Development" },
  { id: "cloud", name: "Cloud" },
  { id: "sysdesign", name: "System Design" },
  { id: "dsa", name: "DSA" },
];

const BOARD_ACCENTS = {
  ai: "#A78BFA",
  webdev: "#60A5FA",
  cloud: "#2DD4BF",
  sysdesign: "#F0B429",
  dsa: "#F472B6",
};

let _id = 0;
const nid = () => `r${++_id}`;

// Real users start with an empty library — no sample resources are ever
// written into application storage. Demo resources for the landing-page
// workflow animation live separately in DEMO_WORKFLOWS below and are never
// read from or written to this store.
const RESOURCES_STORAGE_KEY = "curio.resources.v1";

function loadStoredResources() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(RESOURCES_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep the id counter ahead of anything restored from storage so newly
    // created resources never collide with a previously saved id.
    parsed.forEach((r) => {
      const n = parseInt(String(r.id).replace(/^r/, ""), 10);
      if (!Number.isNaN(n) && n > _id) _id = n;
    });
    return parsed;
  } catch {
    return [];
  }
}

function persistResources(resources) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(resources));
  } catch {
    // Storage unavailable (private browsing, quota exceeded, etc). The app
    // still works for this session — it just won't survive a refresh.
  }
}

const THEME_STORAGE_KEY = "curio.theme.v1";

function loadStoredTheme() {
  try {
    if (typeof localStorage === "undefined") return "dark";
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" ? "light" : "dark"; // default behavior preserved when nothing is stored
  } catch {
    return "dark";
  }
}

function persistTheme(theme) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable — theme still works for this session.
  }
}

/* ------------------------------------------------------------------ */
/*  THEME + ACTIONS CONTEXT                                            */
/* ------------------------------------------------------------------ */

const ThemeContext = createContext("dark");
const useTheme = () => useContext(ThemeContext);

const ResourceActionsContext = createContext(null);
const useResourceActions = () => useContext(ResourceActionsContext);

/* ------------------------------------------------------------------ */
/*  HELPERS                                                             */
/* ------------------------------------------------------------------ */

const TYPE_META = {
  web: { label: "Web", icon: Globe, dark: "#A78BFA", light: "#7C3AED" },
  github: { label: "GitHub", icon: Github, dark: "#D4D4D8", light: "#3F3F46" },
  youtube: { label: "YouTube", icon: Youtube, dark: "#F87171", light: "#DC2626" },
  note: { label: "Note", icon: FileText, dark: "#2DD4BF", light: "#0D9488" },
};

function typeColor(type, theme) {
  const m = TYPE_META[type] || TYPE_META.web;
  return theme === "light" ? m.light : m.dark;
}

function boardName(id) {
  return BOARDS.find((b) => b.id === id)?.name ?? id;
}

function boardAccent(id) {
  return BOARD_ACCENTS[id] || "var(--accent-light)";
}

function relTime(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diff = diffMs / 1000;
  if (diff < 0) return "Just now"; // clock skew safety net — never show negative/future relative time
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  const d = Math.round(diff / 86400);
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function fullDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
}

function guessTypeFromUrl(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("github.com")) return "github";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.startsWith("http")) return "web";
  return null;
}

// A URL typed/pasted without an explicit scheme (e.g. "react.dev/learn"
// instead of "https://react.dev/learn") is a *relative* URL as far as the
// browser is concerned, and an <a href> or window.open() with a relative
// URL resolves against Curio's own origin — which is exactly why "Open
// Resource" could end up back on Curio instead of the external site. This
// normalizes a stored/typed URL to always carry an explicit scheme before
// it's ever used to store or open a resource.
function normalizeUrl(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // other explicit schemes (mailto:, etc.) — leave as-is
  return `https://${trimmed}`;
}

// Validation is distinct from normalization: normalization fixes up a
// missing scheme ("react.dev/learn" -> "https://react.dev/learn"), while
// validation rejects input that still isn't a real address after that
// ("hello" -> "https://hello", which has no real domain and would 404).
function isLikelyValidUrl(rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return false;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(parsed.protocol)) return true; // non-http(s) explicit scheme — not this field's concern
  // Require something that looks like a real domain: at least one dot,
  // e.g. "react.dev", "github.com" — rejects bare words like "hello".
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(parsed.hostname);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", handler) : mq.removeListener(handler));
  }, []);
  return reduced;
}

function prefersReducedMotionNow() {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
}

function scrollToId(id) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotionNow() ? "auto" : "smooth", block: "start" });
}

function scrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: prefersReducedMotionNow() ? "auto" : "smooth" });
}

/* ------------------------------------------------------------------ */
/*  SHARED UI PRIMITIVES                                                */
/* ------------------------------------------------------------------ */

function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

function TypeIcon({ type, size = 13, color }) {
  const theme = useTheme();
  const meta = TYPE_META[type] || TYPE_META.web;
  const I = meta.icon;
  return <I size={size} color={color || typeColor(type, theme)} strokeWidth={2} />;
}

function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 24px", textAlign: "center" }}>
      <div className="surface-2" style={{ width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Icon size={20} color="var(--text-muted)" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 320, marginBottom: action ? 20 : 0 }}>{subtitle}</div>}
      {action}
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="surface modal-pop" style={{ width: 420, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 22 }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RESOURCE CARD + CONTEXT MENU                                        */
/* ------------------------------------------------------------------ */

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className="menu-item" style={{ color: danger ? "var(--error)" : "var(--text)" }}>
      <Icon size={13} /> <span>{label}</span>
    </button>
  );
}

function ResourceMenu({ resource }) {
  const { onEdit, onToggleFavorite, onToggleArchive, onMoveBoard, onDeleteRequest } = useResourceActions();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" aria-label="More actions" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="surface popover" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, width: 200, borderRadius: 10, padding: 6, zIndex: 50 }}>
          {resource.url && <MenuItem icon={ExternalLink} label="Open" onClick={() => { window.open(normalizeUrl(resource.url), "_blank", "noopener,noreferrer"); setOpen(false); }} />}
          <MenuItem icon={Pencil} label="Edit" onClick={() => { onEdit(resource); setOpen(false); }} />
          <MenuItem icon={Tag} label="Add Tag" onClick={() => { onEdit(resource); setOpen(false); }} />
          <MenuItem icon={Star} label={resource.favorite ? "Unfavorite" : "Favorite"} onClick={() => { onToggleFavorite(resource.id); setOpen(false); }} />
          <MenuItem icon={Archive} label={resource.archived ? "Unarchive" : "Archive"} onClick={() => { onToggleArchive(resource.id); setOpen(false); }} />
          {BOARDS.length > 1 && (
            <>
              <div className="menu-divider" />
              <div className="menu-label">Move to board</div>
              {BOARDS.filter((b) => b.id !== resource.board).map((b) => (
                <MenuItem key={b.id} icon={Folder} label={b.name} onClick={() => { onMoveBoard(resource.id, b.id); setOpen(false); }} />
              ))}
            </>
          )}
          <div className="menu-divider" />
          <MenuItem icon={Trash2} label="Delete" danger onClick={() => { onDeleteRequest(resource); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource, muted }) {
  const theme = useTheme();
  const { onOpen, onToggleFavorite } = useResourceActions();
  const meta = TYPE_META[resource.type];
  const visibleTags = resource.tags.slice(0, 3);
  const overflow = resource.tags.length - visibleTags.length;

  return (
    <div
      className="card resource-card"
      onClick={() => onOpen(resource)}
      style={{ padding: 16, cursor: "pointer", opacity: muted ? 0.55 : 1, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: typeColor(resource.type, theme), textTransform: "uppercase" }}>
          <TypeIcon type={resource.type} />
          {meta.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="fav-btn" onClick={(e) => { e.stopPropagation(); onToggleFavorite(resource.id); }} aria-label={resource.favorite ? "Remove favorite" : "Add favorite"}>
            <Star size={15} fill={resource.favorite ? "#A78BFA" : "none"} color={resource.favorite ? "#A78BFA" : "var(--text-muted)"} />
          </button>
          <ResourceMenu resource={resource} />
        </div>
      </div>

      <div>
        <div className="clamp-2" title={resource.title} style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35, marginBottom: 3 }}>{resource.title}</div>
        {resource.domain && resource.domain !== "note" && (
          <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{resource.domain}</div>
        )}
      </div>

      {resource.description?.trim() && (
        <div className="clamp-2" style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, flex: 1 }}>
          {resource.description}
        </div>
      )}

      {resource.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {visibleTags.map((t) => <span key={t} className="tag">#{t}</span>)}
          {overflow > 0 && <span className="tag" style={{ color: "var(--text-muted)" }}>+{overflow}</span>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: boardAccent(resource.board), flexShrink: 0 }} />
          {boardName(resource.board)}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 }}>{relTime(resource.date)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ADD / EDIT RESOURCE MODAL                                           */
/* ------------------------------------------------------------------ */

function ResourceModal({ initial, onSave, onClose }) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState(initial?.type ?? "web");
  const [typeManual, setTypeManual] = useState(!!initial);
  const [board, setBoard] = useState(initial?.board ?? BOARDS[0].id);
  const [tagsText, setTagsText] = useState(initial?.tags?.join(", ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [urlError, setUrlError] = useState(null); // null | "empty" | "invalid"
  const urlRef = useRef(null);

  useEffect(() => { urlRef.current?.focus(); }, []);

  const isEdit = !!initial;
  const recognized = !isEdit && !typeManual ? guessTypeFromUrl(url) : null;

  useEffect(() => {
    if (isEdit || typeManual) return;
    const guess = guessTypeFromUrl(url);
    if (guess) setType(guess);
  }, [url, isEdit, typeManual]);

  function handleSave() {
    if (!isEdit) {
      if (!url.trim()) { setUrlError("empty"); return; }
      if (!isLikelyValidUrl(url)) { setUrlError("invalid"); return; }
    }
    if (isEdit && !title.trim()) return;
    setSaving(true);
    setTimeout(() => {
      const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
      const normalizedUrl = normalizeUrl(url);
      const derivedTitle = title.trim() || (normalizedUrl ? normalizedUrl.replace(/^https?:\/\//, "").split("/")[0] : "Untitled resource");
      const domain = normalizedUrl ? normalizedUrl.replace(/^https?:\/\//, "").split("/")[0] : (type === "note" ? "note" : "");
      const nowIso = new Date().toISOString();
      onSave({
        ...(initial || {}),
        id: initial?.id ?? nid(),
        title: derivedTitle,
        url: normalizedUrl,
        domain,
        type,
        board,
        tags,
        notes,
        description: initial?.description ?? "",
        date: initial?.date ?? nowIso,
        updated: nowIso,
        favorite: initial?.favorite ?? false,
        archived: initial?.archived ?? false,
      });
      setSaving(false);
      setSaved(true);
      setTimeout(onClose, 550);
    }, 500);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="surface modal-pop" style={{ width: 480, borderRadius: 14, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{isEdit ? "Edit Resource" : "Add Resource"}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, maxHeight: "62vh", overflowY: "auto" }}>
          {!isEdit && (
            <Field label="URL">
              <input
                ref={urlRef}
                className={"input mono" + (urlError ? " input-error" : "")}
                style={{ width: "100%" }}
                placeholder="https://..."
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (urlError) setUrlError(null); }}
              />
              <div style={{ minHeight: 18, display: "flex", alignItems: "center", gap: 6 }}>
                {urlError === "empty" && <span style={{ fontSize: 11.5, color: "var(--error)" }}>Enter a URL to continue.</span>}
                {urlError === "invalid" && <span style={{ fontSize: 11.5, color: "var(--error)" }}>Please enter a valid URL.</span>}
                {!urlError && recognized && (
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                    <Check size={12} color="var(--success)" /> Recognized as {TYPE_META[recognized].label}
                  </span>
                )}
              </div>
            </Field>
          )}
          {!isEdit && (
            <Field label="Title" hint="optional — uses the URL if left blank">
              <input className="input" style={{ width: "100%" }} placeholder="Give it a name..." value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          )}
          {isEdit && (
            <Field label="Title">
              <input className="input" style={{ width: "100%" }} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Type" style={{ flex: 1 }}>
              <select className="input select" style={{ width: "100%" }} value={type} onChange={(e) => { setType(e.target.value); setTypeManual(true); }}>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Board" style={{ flex: 1 }}>
              <select className="input select" style={{ width: "100%" }} value={board} onChange={(e) => setBoard(e.target.value)}>
                {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Tags" hint="comma separated">
            <input className="input" style={{ width: "100%" }} placeholder="react, performance" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
          </Field>

          <Field label="Notes">
            <textarea className="input" style={{ width: "100%", minHeight: 72, resize: "vertical", fontFamily: "inherit" }} placeholder="Add a note..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 6, opacity: saved ? 1 : 0, transition: "opacity .2s" }}>
            <Check size={14} /> Saved to {boardName(board)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 118, justifyContent: "center" }}>
              {saving ? "Saving…" : "Save Resource"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", ...style }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 500, color: "var(--text)" }}>{label}</span>
        {hint && <span style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  RESOURCE DETAIL PANEL                                               */
/* ------------------------------------------------------------------ */

function ResourceDetail({ resource, onClose }) {
  const theme = useTheme();
  const { onEdit, onToggleFavorite, onToggleArchive, onDeleteRequest } = useResourceActions();
  const meta = TYPE_META[resource.type];
  return (
    <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="surface modal-pop" style={{ width: 460, borderRadius: 14, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, color: typeColor(resource.type, theme), textTransform: "uppercase", letterSpacing: 0.4 }}>
            <TypeIcon type={resource.type} /> {meta.label}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ padding: "20px 20px 4px", maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>{resource.title}</div>
          {resource.domain && resource.domain !== "note" ? (
            <a href={normalizeUrl(resource.url)} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12.5, color: "var(--accent-light)", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16, textDecoration: "none" }}>
              {resource.domain} <ExternalLink size={11} />
            </a>
          ) : <div style={{ marginBottom: 16 }} />}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: boardAccent(resource.board) }} /> {boardName(resource.board)}
            </span>
          </div>

          {resource.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {resource.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
            </div>
          )}

          <div style={{ height: 1, background: "var(--border)", margin: "0 0 16px" }} />

          <SectionLabel>Description</SectionLabel>
          <p style={{ fontSize: 13, color: resource.description ? "var(--text-secondary)" : "var(--text-muted)", lineHeight: 1.6, marginBottom: 18, fontStyle: resource.description ? "normal" : "italic" }}>
            {resource.description || "No description yet."}
          </p>

          <SectionLabel>My Notes</SectionLabel>
          <p style={{ fontSize: 13, color: resource.notes ? "var(--text-secondary)" : "var(--text-muted)", lineHeight: 1.6, marginBottom: 18, fontStyle: resource.notes ? "normal" : "italic" }}>
            {resource.notes || "No notes yet."}
          </p>

          <div style={{ height: 1, background: "var(--border)", margin: "0 0 16px" }} />

          <div style={{ display: "flex", gap: 28, marginBottom: 20, flexWrap: "wrap" }}>
            <div>
              <SectionLabel>Added</SectionLabel>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{fullDateTime(resource.date)}</div>
            </div>
            <div>
              <SectionLabel>Updated</SectionLabel>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{fullDateTime(resource.updated || resource.date)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
          {resource.url && (
            <a href={normalizeUrl(resource.url)} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Open Resource <ExternalLink size={13} />
            </a>
          )}
          <button className="btn btn-secondary" onClick={() => onEdit(resource)}><Pencil size={13} /> Edit</button>
          <button className="btn btn-secondary" onClick={() => onToggleFavorite(resource.id)}>
            <Star size={13} fill={resource.favorite ? "#A78BFA" : "none"} color={resource.favorite ? "#A78BFA" : "currentColor"} />
            {resource.favorite ? "Favorited" : "Favorite"}
          </button>
          <button className="btn btn-secondary" onClick={() => onToggleArchive(resource.id)}>
            <Archive size={13} /> {resource.archived ? "Unarchive" : "Archive"}
          </button>
          <button className="btn btn-danger-ghost" style={{ marginLeft: "auto" }} onClick={() => onDeleteRequest(resource)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 8 }}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  COMMAND PALETTE                                                     */
/* ------------------------------------------------------------------ */

function CommandPalette({ resources, onClose, onOpenResource, onNavigate, onAddResource }) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matchedResources = useMemo(() => {
    if (!query.trim()) return resources.filter((r) => !r.archived).slice(0, 5);
    const q = query.toLowerCase();
    return resources
      .filter((r) => !r.archived)
      .filter((r) => r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q)) || r.domain.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, resources]);

  const actions = useMemo(() => {
    const base = [
      { id: "add", label: "Add Resource", icon: Plus, run: () => onAddResource() },
      { id: "board", label: "Create Board", icon: FolderPlus, run: () => onNavigate("boards") },
      { id: "fav", label: "View Favorites", icon: Star, run: () => onNavigate("favorites") },
      { id: "archive", label: "View Archive", icon: Archive, run: () => onNavigate("archive") },
      { id: "settings", label: "Open Settings", icon: Settings, run: () => onNavigate("settings") },
    ];
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((a) => a.label.toLowerCase().includes(q));
  }, [query, onNavigate, onAddResource]);

  const items = [
    ...matchedResources.map((r) => ({ kind: "resource", data: r })),
    ...actions.map((a) => ({ kind: "action", data: a })),
  ];

  useEffect(() => { setIndex(0); }, [query]);

  function runItem(item) {
    if (!item) return;
    if (item.kind === "resource") onOpenResource(item.data);
    else item.data.run();
  }

  function highlight(text) {
    if (!query.trim()) return text;
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return text;
    return (
      <>
        {text.slice(0, i)}
        <span style={{ color: "var(--accent-light)" }}>{text.slice(i, i + query.length)}</span>
        {text.slice(i + query.length)}
      </>
    );
  }

  return (
    <div className="overlay overlay-top cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="surface modal-pop"
        role="dialog"
        aria-modal="true"
        style={{ width: 560, maxWidth: "92vw", borderRadius: 14, overflow: "hidden" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); runItem(items[index]); }
          if (e.key === "Escape") onClose();
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your research..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 14 }}
          />
          <Kbd>Esc</Kbd>
        </div>

        <div style={{ maxHeight: "56vh", overflowY: "auto", padding: 8 }}>
          {matchedResources.length > 0 && (
            <>
              <div style={{ padding: "8px 16px 4px", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--text-muted)" }}>Search</div>
              <div style={{ padding: "0 8px" }}>
                {matchedResources.map((r) => (
                  <PaletteRow key={r.id} active={items[index]?.kind === "resource" && items[index]?.data.id === r.id} onClick={() => runItem({ kind: "resource", data: r })}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: typeColor(r.type, theme), flexShrink: 0 }} />
                    <TypeIcon type={r.type} size={14} />
                    <span style={{ flex: 1, fontSize: 13.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{highlight(r.title)}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>{TYPE_META[r.type].label.toUpperCase()} · {boardName(r.board)}</span>
                  </PaletteRow>
                ))}
              </div>
            </>
          )}

          {matchedResources.length === 0 && query.trim() && (
            <div style={{ padding: "22px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No research found.</div>
          )}

          {actions.length > 0 && (
            <>
              <div style={{ padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--text-muted)" }}>Actions</div>
              <div style={{ padding: "0 8px 4px" }}>
                {actions.map((a) => (
                  <PaletteRow key={a.id} active={items[index]?.kind === "action" && items[index]?.data.id === a.id} onClick={() => runItem({ kind: "action", data: a })}>
                    <a.icon size={14} color="var(--text-secondary)" />
                    <span style={{ flex: 1, fontSize: 13.5 }}>{a.label}</span>
                    <ChevronRight size={13} color="var(--text-muted)" />
                  </PaletteRow>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Kbd><CornerDownLeft size={10} /></Kbd> Select</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Kbd>Esc</Kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({ children, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8,
        background: active ? "var(--selected-bg)" : "transparent", cursor: "pointer",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FILTER POPOVER                                                      */
/* ------------------------------------------------------------------ */

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterPopover({ filters, setFilters, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Filters"
      className="surface popover"
      style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 280, maxWidth: "90vw", borderRadius: 12, padding: 16, zIndex: 60 }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "var(--text-muted)", marginBottom: 12 }}>FILTERS</div>
      <PopoverGroup label="Type">
        <Chip active={filters.type.length === 0} onClick={() => setFilters((f) => ({ ...f, type: [] }))}>All</Chip>
        {["web", "github", "youtube", "note"].map((t) => (
          <Chip key={t} active={filters.type.includes(t)} onClick={() => setFilters((f) => ({ ...f, type: toggleInList(f.type, t) }))}>
            {TYPE_META[t].label}
          </Chip>
        ))}
      </PopoverGroup>

      <PopoverGroup label="Board" scroll>
        <Chip active={filters.board.length === 0} onClick={() => setFilters((f) => ({ ...f, board: [] }))}>All</Chip>
        {BOARDS.map((b) => (
          <Chip key={b.id} active={filters.board.includes(b.id)} onClick={() => setFilters((f) => ({ ...f, board: toggleInList(f.board, b.id) }))}>{b.name}</Chip>
        ))}
      </PopoverGroup>

      <PopoverGroup label="Status">
        {[["active", "Active"], ["favorites", "Favorites"], ["archived", "Archived"]].map(([s, label]) => (
          <Chip key={s} active={filters.status.includes(s)} onClick={() => setFilters((f) => ({ ...f, status: toggleInList(f.status, s) }))}>
            {label}
          </Chip>
        ))}
      </PopoverGroup>

      <button
        className="btn btn-ghost"
        style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
        onClick={() => setFilters((f) => ({ ...f, type: [], board: [], status: [] }))}
      >
        Clear filters
      </button>
    </div>
  );
}

function PopoverGroup({ label, children, scroll }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: scroll ? 128 : undefined, overflowY: scroll ? "auto" : undefined, paddingRight: scroll ? 2 : undefined }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="chip"
      style={{
        fontSize: 12, padding: "5px 10px", borderRadius: 999, border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
        background: active ? "rgba(139,92,246,0.14)" : "var(--surface-2)", color: active ? "var(--accent-light)" : "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  SIDEBAR                                                             */
/* ------------------------------------------------------------------ */

function Sidebar({ view, setView, resources, mobileOpen, setMobileOpen, onLogoClick }) {
  const counts = useMemo(() => {
    const active = resources.filter((r) => !r.archived);
    return {
      all: active.length,
      favorites: active.filter((r) => r.favorite).length,
      archive: resources.filter((r) => r.archived).length,
    };
  }, [resources]);

  const boardCounts = useMemo(() => {
    const m = {};
    BOARDS.forEach((b) => { m[b.id] = resources.filter((r) => r.board === b.id && !r.archived).length; });
    return m;
  }, [resources]);

  const topTags = useMemo(() => {
    const m = {};
    resources.filter((r) => !r.archived).forEach((r) => r.tags.forEach((t) => { m[t] = (m[t] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [resources]);

  const NavItem = ({ id, icon: Icon, label, count }) => (
    <button
      onClick={() => { setView({ name: id }); setMobileOpen(false); }}
      className="nav-item"
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 10px", borderRadius: 8,
        background: view.name === id ? "var(--selected-bg)" : "transparent",
        color: view.name === id ? "var(--text)" : "var(--text-secondary)",
        fontSize: 13, fontWeight: view.name === id ? 600 : 500, border: view.name === id ? "1px solid var(--border)" : "1px solid transparent",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <Icon size={15} color={view.name === id ? "var(--accent-light)" : "var(--text-muted)"} />
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{count}</span>}
    </button>
  );

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}>
        <button
          onClick={onLogoClick}
          aria-label="Curio — back to landing page"
          style={{ padding: "18px 16px 10px", display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
        >
          <Logo size={20} />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2, color: "var(--text)" }}>Curio</span>
        </button>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px 16px" }}>
          <SidebarLabel>Library</SidebarLabel>
          <NavItem id="dashboard" icon={Home} label="Your Research" />
          <NavItem id="all" icon={LayoutGrid} label="All Resources" count={counts.all} />
          <NavItem id="favorites" icon={Star} label="Favorites" count={counts.favorites} />
          <NavItem id="archive" icon={Archive} label="Archive" count={counts.archive} />

          <SidebarLabel style={{ marginTop: 20 }}>Boards</SidebarLabel>
          {BOARDS.map((b) => (
            <button
              key={b.id}
              onClick={() => { setView({ name: "boardDetail", boardId: b.id }); setMobileOpen(false); }}
              className="nav-item"
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 10px", borderRadius: 8,
                background: view.name === "boardDetail" && view.boardId === b.id ? "var(--selected-bg)" : "transparent",
                color: view.name === "boardDetail" && view.boardId === b.id ? "var(--text)" : "var(--text-secondary)",
                fontSize: 13, border: view.name === "boardDetail" && view.boardId === b.id ? "1px solid var(--border)" : "1px solid transparent",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 99, background: BOARD_ACCENTS[b.id], flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{b.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{boardCounts[b.id]}</span>
            </button>
          ))}
          <NavItem id="boards" icon={FolderPlus} label="All Boards" />

          <SidebarLabel style={{ marginTop: 20 }}>Tags</SidebarLabel>
          {topTags.map(([t, c]) => (
            <button
              key={t}
              onClick={() => { setView({ name: "all", tag: t }); setMobileOpen(false); }}
              className="nav-item"
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "6px 10px", borderRadius: 8, background: "transparent", color: "var(--text-secondary)", fontSize: 12.5, border: "1px solid transparent", cursor: "pointer", textAlign: "left" }}
            >
              <span className="mono" style={{ flex: 1, color: "var(--text-muted)" }}>#{t}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c}</span>
            </button>
          ))}
          <NavItem id="tags" icon={Tag} label="All Tags" />
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <NavItem id="settings" icon={Settings} label="Settings" />
        </div>
      </aside>
    </>
  );
}

function SidebarLabel({ children, style }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-muted)", padding: "6px 10px 8px", ...style }}>{children}</div>;
}

function Logo({ size = 22, color = "var(--accent-light)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="10.5" stroke={color} strokeWidth="2" />
      <path d="M16 3.5 L16 8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.6" fill={color} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  APP SHELL VIEWS                                                     */
/* ------------------------------------------------------------------ */

function useFilteredResources(resources, filters, extra) {
  return useMemo(() => {
    let list = resources;
    if (extra?.board) list = list.filter((r) => r.board === extra.board);
    if (extra?.onlyFavorites) list = list.filter((r) => r.favorite && !r.archived);
    else if (extra?.onlyArchived) list = list.filter((r) => r.archived);
    else if (filters.status.length > 0) {
      // Status is only meaningful when the view itself doesn't already impose
      // a hard archived/favorites scope (i.e. the "All Resources" view) — the
      // dedicated Favorites/Archive views above already handle their own case.
      list = list.filter((r) =>
        filters.status.some((s) => {
          if (s === "favorites") return r.favorite && !r.archived;
          if (s === "archived") return r.archived;
          if (s === "active") return !r.archived;
          return false;
        })
      );
    } else list = list.filter((r) => !r.archived);

    if (filters.type.length > 0) list = list.filter((r) => filters.type.includes(r.type));
    if (filters.board.length > 0 && !extra?.board) list = list.filter((r) => filters.board.includes(r.board));
    if (filters.tag) list = list.filter((r) => r.tags.includes(filters.tag));
    if (filters.query?.trim()) {
      const q = filters.query.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q)) || r.domain.toLowerCase().includes(q));
    }

    const sorted = [...list];
    if (filters.sort === "az") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (filters.sort === "za") sorted.sort((a, b) => b.title.localeCompare(a.title));
    else if (filters.sort === "oldest") sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
    else sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted;
  }, [resources, filters, extra]);
}

function ResourceGrid({ list, muted, emptyProps }) {
  if (list.length === 0) return <EmptyState {...emptyProps} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
      {list.map((r) => <ResourceCard key={r.id} resource={r} muted={muted} />)}
    </div>
  );
}

function TopBar({ onSearchClick, onAddResource, showFilters, filters, setFilters, mobileOpen, setMobileOpen }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const mac = isMac();
  const activeFilterCount = filters.type.length + filters.board.length + filters.status.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 20 }}>
      <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>

      <button className="search-trigger" onClick={onSearchClick}>
        <Search size={14} color="var(--text-muted)" />
        <span style={{ color: "var(--text-muted)", fontSize: 13, flex: 1, textAlign: "left" }}>Search your research...</span>
        <Kbd>{mac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>

      {showFilters && (
        <>
          <select
            className="input select hide-sm"
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
            style={{ flexShrink: 0 }}
          >
            <option value="recent">Recently Added</option>
            <option value="oldest">Oldest Added</option>
            <option value="az">Title A → Z</option>
            <option value="za">Title Z → A</option>
          </select>

          <div style={{ position: "relative" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setFilterOpen((o) => !o)}
              style={activeFilterCount > 0 ? { borderColor: "var(--accent)", color: "var(--accent-light)" } : undefined}
            >
              <Filter size={13} /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {filterOpen && <FilterPopover filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
          </div>
        </>
      )}

      <button className="btn btn-primary" onClick={onAddResource}>
        <Plus size={14} /> <span className="hide-sm">Add Resource</span>
      </button>
    </div>
  );
}

function StatPill({ value, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function DashboardView({ resources, onAddResource, setView }) {
  const active = resources.filter((r) => !r.archived);
  const recent = [...active].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  const weekCount = active.filter((r) => (Date.now() - new Date(r.date).getTime()) / 86400000 <= 7).length;

  return (
    <div style={{ padding: "28px 24px 60px" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3, marginBottom: 4 }}>Your Research</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Everything you've decided is worth keeping.</p>
      </div>

      <div style={{ display: "flex", gap: 28, marginBottom: 26, flexWrap: "wrap" }}>
        <StatPill value={active.length} label="Resources" />
        <StatPill value={BOARDS.length} label="Boards" />
        <StatPill value={active.filter((r) => r.favorite).length} label="Favorites" />
        <StatPill value={weekCount} label="Added this week" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 32, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={onAddResource}><Plus size={14} /> Add Resource</button>
        <button className="btn btn-secondary" onClick={() => setView({ name: "boards" })}><FolderPlus size={14} /> New Board</button>
        <button className="btn btn-secondary" onClick={() => setView({ name: "all" })}><Search size={14} /> Browse all</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-secondary)" }}>Recently Captured</h2>
        <button className="link-btn" onClick={() => setView({ name: "all" })}>View all <ChevronRight size={13} /></button>
      </div>

      <ResourceGrid
        list={recent}
        emptyProps={{ icon: LayoutGrid, title: "Your research library is empty.", subtitle: "Capture your first article, repo, video, or note.", action: <button className="btn btn-primary" onClick={onAddResource}>Add your first resource</button> }}
      />
    </div>
  );
}

function AllResourcesView({ title, resources, filters, emptyTitle, emptySubtitle, emptyIcon, onAddResource }) {
  return (
    <div style={{ padding: "28px 24px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, marginBottom: 4 }}>{title}</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>{resources.length} resource{resources.length !== 1 ? "s" : ""}{filters.tag ? ` tagged #${filters.tag}` : ""}</p>
      <ResourceGrid
        list={resources}
        emptyProps={{ icon: emptyIcon || Search, title: emptyTitle || "Nothing matched your search.", subtitle: emptySubtitle || "Try another keyword or clear your filters.", action: onAddResource ? <button className="btn btn-primary" onClick={onAddResource}>Add a resource</button> : null }}
      />
    </div>
  );
}

function ArchiveView({ resources }) {
  const { onOpen, onRestore, onDeleteRequest } = useResourceActions();
  if (resources.length === 0) {
    return (
      <div style={{ padding: "28px 24px 60px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 22 }}>Archive</h1>
        <EmptyState icon={Archive} title="Nothing archived yet." subtitle="Resources you archive will appear here." />
      </div>
    );
  }
  return (
    <div style={{ padding: "28px 24px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Archive</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>{resources.length} archived resource{resources.length !== 1 ? "s" : ""}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {resources.map((r) => (
          <div key={r.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", opacity: 0.65 }}>
            <TypeIcon type={r.type} size={16} />
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onOpen(r)}>
              <div className="clamp-1" style={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</div>
              {r.description?.trim() && <div className="clamp-1" style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{r.description}</div>}
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{boardName(r.board)} · {relTime(r.date)}</div>
            </div>
            <button className="btn btn-secondary" onClick={() => onRestore(r.id)}><RotateCcw size={13} /> Restore</button>
            <button className="btn btn-danger-ghost" onClick={() => onDeleteRequest(r)} aria-label="Delete permanently"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardsView({ resources, setView, onCreateBoard }) {
  return (
    <div style={{ padding: "28px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Your Boards</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Organize research by topic or project.</p>
        </div>
        <button className="btn btn-primary" onClick={onCreateBoard}><Plus size={14} /> New Board</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        {BOARDS.map((b) => {
          const count = resources.filter((r) => r.board === b.id && !r.archived).length;
          const accent = BOARD_ACCENTS[b.id];
          return (
            <div key={b.id} className="card" style={{ padding: 20, cursor: "pointer", borderTop: `2px solid ${accent}` }} onClick={() => setView({ name: "boardDetail", boardId: b.id })}>
              <div className="surface-2" style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Folder size={16} color={accent} />
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{count} resource{count !== 1 ? "s" : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardDetailView({ boardId, resources, setView, onAddResource }) {
  const board = BOARDS.find((b) => b.id === boardId);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("recent");

  const finalList = useMemo(() => {
    let l = resources;
    if (typeFilter !== "all") l = l.filter((r) => r.type === typeFilter);
    l = [...l];
    if (sort === "az") l.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "za") l.sort((a, b) => b.title.localeCompare(a.title));
    else if (sort === "oldest") l.sort((a, b) => new Date(a.date) - new Date(b.date));
    else l.sort((a, b) => new Date(b.date) - new Date(a.date));
    return l;
  }, [resources, typeFilter, sort]);

  return (
    <div style={{ padding: "20px 24px 60px" }}>
      <button className="link-btn" style={{ marginBottom: 14 }} onClick={() => setView({ name: "boards" })}><ChevronLeft size={14} /> Boards</button>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: BOARD_ACCENTS[boardId] }} />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{board?.name}</h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>{resources.length} resource{resources.length !== 1 ? "s" : ""}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "web", "github", "youtube", "note"].map((t) => (
            <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{t === "all" ? "All" : TYPE_META[t].label}</Chip>
          ))}
        </div>
        <select className="input select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Recently Added</option>
          <option value="oldest">Oldest Added</option>
          <option value="az">Title A → Z</option>
          <option value="za">Title Z → A</option>
        </select>
      </div>

      <ResourceGrid
        list={finalList}
        emptyProps={{ icon: Folder, title: "No resources in this board yet.", subtitle: "Add something worth keeping to " + board?.name + ".", action: <button className="btn btn-primary" onClick={onAddResource}>Add Resource</button> }}
      />
    </div>
  );
}

function TagsView({ resources, setView }) {
  const tagCounts = useMemo(() => {
    const m = {};
    resources.filter((r) => !r.archived).forEach((r) => r.tags.forEach((t) => { m[t] = (m[t] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [resources]);

  if (tagCounts.length === 0) {
    return (
      <div style={{ padding: "28px 24px 60px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 22 }}>Tags</h1>
        <EmptyState icon={Tag} title="No tags yet." subtitle="Tags you add to resources will show up here." />
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 24px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Tags</h1>
      <div className="card" style={{ padding: 6 }}>
        {tagCounts.map(([t, c], i) => (
          <button
            key={t}
            onClick={() => setView({ name: "all", tag: t })}
            style={{ display: "flex", alignItems: "center", width: "100%", padding: "12px 14px", borderBottom: i < tagCounts.length - 1 ? "1px solid var(--border)" : "none", background: "transparent", border: "none", cursor: "pointer" }}
          >
            <span className="mono" style={{ fontSize: 13.5, color: "var(--text)", flex: 1, textAlign: "left" }}>#{t}</span>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{c}</span>
            <ChevronRight size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ onExport, onImportFile, onClearRequest, theme, setTheme }) {
  const mac = isMac();
  const fileInputRef = useRef(null);
  const shortcuts = [
    [mac ? "⌘ K" : "Ctrl K", "Search"],
    ["N", "New resource"],
    ["B", "New board"],
    ["F", "Favorite"],
    ["E", "Edit"],
    ["Esc", "Close"],
  ];
  return (
    <div style={{ padding: "28px 24px 60px", maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 28 }}>Settings</h1>

      <SettingsSection title="Appearance" first>
        <div style={{ display: "flex", gap: 8 }}>
          {[["dark", Moon, "Dark"], ["light", Sun, "Light"]].map(([k, Icon, label]) => (
            <button key={k} onClick={() => setTheme(k)} className="btn btn-secondary" style={{ borderColor: theme === k ? "var(--accent)" : "var(--border)", color: theme === k ? "var(--accent-light)" : "var(--text-secondary)" }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Keyboard shortcuts">
        <div className="card" style={{ padding: 4 }}>
          {shortcuts.map(([k, label], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: i < shortcuts.length - 1 ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
              <Kbd>{k}</Kbd>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Data">
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
          Your research stays on your device. Export downloads a full backup; Import adds resources from a backup file without replacing your existing library.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={onExport}><Download size={13} /> Export Data</button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}><Upload size={13} /> Import Data</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
              e.target.value = ""; // allow re-selecting the same file next time
            }}
          />
          <button className="btn btn-danger-ghost" onClick={onClearRequest}><Trash2 size={13} /> Clear All Data</button>
        </div>
      </SettingsSection>

      <SettingsSection title="Privacy">
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Curio is local-first: your resources, boards, tags, and notes are stored on this device. No account is required to use it, and you can export your library as a backup at any time.
        </p>
      </SettingsSection>

      <SettingsSection title="About">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Logo size={18} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Curio</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Capture. Organize. Discover.</p>
        <p className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>Version 0.0.2</p>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, children, first }) {
  return (
    <div style={{ marginBottom: 30 }}>
      {!first && <div className="settings-divider" />}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  APP (post-landing)                                                  */
/* ------------------------------------------------------------------ */

function CurioApp({ onBackToLanding, theme, setTheme }) {
  const [resources, setResources] = useState(loadStoredResources);
  const [view, setView] = useState({ name: "dashboard" });
  const [filters, setFilters] = useState({ type: [], board: [], status: [], sort: "recent", tag: null, query: "" });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editResource, setEditResource] = useState(null);
  const [detailResource, setDetailResource] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'delete'|'clear', id, title }
  const [toast, setToast] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist every change (add/edit/favorite/archive/restore/move/delete/clear)
  // back to storage. An empty array is itself a valid, permanent state — this
  // effect never distinguishes "new user" from "user who deleted everything";
  // both are simply persisted as [].
  useEffect(() => {
    persistResources(resources);
  }, [resources]);

  useEffect(() => {
    if (view.name !== "all") setFilters((f) => ({ ...f, tag: null, query: "" }));
  }, [view]);

  useEffect(() => {
    if (view.tag) setFilters((f) => ({ ...f, tag: view.tag }));
  }, [view.tag]);

  // Represent meaningful in-app navigation (which view is showing, and
  // whether a resource detail is open) as real browser history entries, so
  // Back/Forward move through the app the way a user would expect instead of
  // jumping straight past everything to the landing page. The very first
  // entry for "/app" (pushed when the user clicked "Open Curio") is left
  // alone on mount — we only start pushing new entries for navigation that
  // happens *after* the app is already open, and we enrich that first entry
  // in place (via replaceState) so popping back to it restores the initial
  // view rather than landing on a blank state.
  const isPoppingRef = useRef(false);
  const historyInitRef = useRef(false);
  useEffect(() => {
    if (!historyInitRef.current) {
      historyInitRef.current = true;
      try {
        window.history.replaceState({ curioView: view, curioDetailId: detailResource ? detailResource.id : null }, "", "/app");
      } catch {}
      return;
    }
    if (isPoppingRef.current) {
      isPoppingRef.current = false;
      return;
    }
    try {
      window.history.pushState({ curioView: view, curioDetailId: detailResource ? detailResource.id : null }, "", "/app");
    } catch {}
  }, [view, detailResource]);

  useEffect(() => {
    function onPopState(e) {
      const state = e.state;
      if (state && state.curioView) {
        isPoppingRef.current = true;
        setView(state.curioView);
        setDetailResource(state.curioDetailId ? resources.find((r) => r.id === state.curioDetailId) || null : null);
      }
      // If this history entry doesn't carry curioView, we've popped back to
      // (or past) the landing/app boundary — useAppRoute's own popstate
      // listener (based on window.location.pathname) handles switching back
      // to the landing page in that case.
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [resources]);

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (addOpen) setAddOpen(false);
        else if (editResource) setEditResource(null);
        else if (detailResource) setDetailResource(null);
        else if (confirm) setConfirm(null);
        return;
      }
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (typing || paletteOpen || addOpen || editResource || detailResource) return;
      if (e.key.toLowerCase() === "n") { e.preventDefault(); setAddOpen(true); }
      if (e.key.toLowerCase() === "b") { e.preventDefault(); setView({ name: "boards" }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, addOpen, editResource, detailResource, confirm]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function toggleFavorite(id) {
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)));
  }
  function toggleArchive(id) {
    let archivedNow = false;
    setResources((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      archivedNow = !r.archived;
      return { ...r, archived: !r.archived };
    }));
    setDetailResource(null);
    setTimeout(() => showToast(archivedNow ? "Archived" : "Restored"), 0);
  }
  function restoreResource(id) {
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, archived: false } : r)));
    showToast("Restored");
  }
  function moveResourceBoard(id, boardId) {
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, board: boardId, updated: new Date().toISOString() } : r)));
    showToast(`Moved to ${boardName(boardId)}`);
  }
  function deleteResource(id) {
    setResources((rs) => rs.filter((r) => r.id !== id));
    setConfirm(null);
    setDetailResource(null);
    setEditResource(null);
    showToast("Deleted permanently");
  }
  function saveResource(data) {
    setResources((rs) => {
      const exists = rs.some((r) => r.id === data.id);
      return exists ? rs.map((r) => (r.id === data.id ? data : r)) : [data, ...rs];
    });
    showToast(`Saved to ${boardName(data.board)}`);
  }
  function clearAll() {
    setResources([]);
    setConfirm(null);
    showToast("All data cleared");
  }

  function exportBackup() {
    const payload = {
      curioExport: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      theme,
      resources,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `curio-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Backup downloaded");
    } catch {
      showToast("Export failed — couldn't create the file");
    }
  }

  function isPlausibleResource(r) {
    return r && typeof r === "object" && typeof r.title === "string" && typeof r.type === "string" && TYPE_META[r.type];
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onerror = () => showToast("Import failed — couldn't read the file");
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        showToast("Import failed — not a valid JSON file");
        return;
      }
      const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.resources) ? parsed.resources : null;
      if (!incoming) {
        showToast("Import failed — this doesn't look like a Curio backup");
        return;
      }
      const valid = incoming.filter(isPlausibleResource);
      if (valid.length === 0) {
        showToast("Import failed — no valid resources found in that file");
        return;
      }
      // Merge (least destructive): keep everything the user already has, add
      // the imported resources with fresh ids so they can never collide with
      // (or silently overwrite) an existing resource.
      const nowIso = new Date().toISOString();
      const imported = valid.map((r) => ({
        title: r.title,
        url: typeof r.url === "string" ? normalizeUrl(r.url) : "",
        domain: typeof r.domain === "string" ? r.domain : "",
        type: TYPE_META[r.type] ? r.type : "web",
        board: BOARDS.some((b) => b.id === r.board) ? r.board : BOARDS[0].id,
        tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string") : [],
        notes: typeof r.notes === "string" ? r.notes : "",
        description: typeof r.description === "string" ? r.description : "",
        favorite: !!r.favorite,
        archived: !!r.archived,
        date: typeof r.date === "string" ? r.date : nowIso,
        updated: nowIso,
        id: nid(),
      }));
      setResources((rs) => [...imported, ...rs]);
      showToast(`Imported ${imported.length} resource${imported.length !== 1 ? "s" : ""}`);
    };
    reader.readAsText(file);
  }

  const extra =
    view.name === "favorites" ? { onlyFavorites: true } :
    view.name === "archive" ? { onlyArchived: true } :
    view.name === "boardDetail" ? { board: view.boardId } :
    {};

  const filtered = useFilteredResources(resources, filters, extra);
  const hasAnyActive = resources.some((r) => !r.archived);

  function openResourceFromPalette(r) {
    setPaletteOpen(false);
    setDetailResource(r);
  }

  const actions = {
    onOpen: setDetailResource,
    onToggleFavorite: toggleFavorite,
    onToggleArchive: toggleArchive,
    onRestore: restoreResource,
    onEdit: (r) => setEditResource(r),
    onMoveBoard: moveResourceBoard,
    onDeleteRequest: (r) => setConfirm({ type: "delete", id: r.id, title: r.title }),
  };

  return (
    <ThemeContext.Provider value={theme}>
      <ResourceActionsContext.Provider value={actions}>
        <div className="curio" data-theme={theme} style={{ display: "flex" }}>
          <style>{CSS}</style>
          <Sidebar view={view} setView={setView} resources={resources} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogoClick={onBackToLanding} />

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <TopBar
              onSearchClick={() => setPaletteOpen(true)}
              onAddResource={() => setAddOpen(true)}
              showFilters={view.name === "all"}
              filters={filters}
              setFilters={setFilters}
              mobileOpen={mobileOpen}
              setMobileOpen={setMobileOpen}
            />

            {view.name === "dashboard" && (
              <DashboardView resources={resources} onAddResource={() => setAddOpen(true)} setView={setView} />
            )}
            {view.name === "all" && (
              <AllResourcesView
                title={filters.tag ? `#${filters.tag}` : "All Resources"}
                resources={filtered}
                filters={filters}
                onAddResource={() => setAddOpen(true)}
                emptyTitle={hasAnyActive ? undefined : "Your research library is empty."}
                emptySubtitle={hasAnyActive ? undefined : "Save your first resource to start building your research library."}
                emptyIcon={hasAnyActive ? undefined : LayoutGrid}
              />
            )}
            {view.name === "favorites" && (
              <AllResourcesView title="Favorites" resources={filtered} filters={filters} emptyTitle="Nothing saved to favorites yet." emptySubtitle="Favorite resources you want to return to quickly." emptyIcon={Star} onAddResource={() => setAddOpen(true)} />
            )}
            {view.name === "archive" && <ArchiveView resources={filtered} />}
            {view.name === "boards" && (
              <BoardsView resources={resources} setView={setView} onCreateBoard={() => showToast("Board creation is mocked in V0")} />
            )}
            {view.name === "boardDetail" && (
              <BoardDetailView boardId={view.boardId} resources={filtered} setView={setView} onAddResource={() => setAddOpen(true)} />
            )}
            {view.name === "tags" && <TagsView resources={resources} setView={setView} />}
            {view.name === "settings" && (
              <SettingsView
                theme={theme}
                setTheme={setTheme}
                onExport={exportBackup}
                onImportFile={importBackup}
                onClearRequest={() => setConfirm({ type: "clear" })}
              />
            )}
          </div>

          {paletteOpen && (
            <CommandPalette
              resources={resources}
              onClose={() => setPaletteOpen(false)}
              onOpenResource={openResourceFromPalette}
              onNavigate={(name) => { setView({ name }); setPaletteOpen(false); }}
              onAddResource={() => { setPaletteOpen(false); setAddOpen(true); }}
            />
          )}

          {addOpen && <ResourceModal onSave={saveResource} onClose={() => setAddOpen(false)} />}
          {editResource && <ResourceModal initial={editResource} onSave={(d) => { saveResource(d); setDetailResource(d); }} onClose={() => setEditResource(null)} />}

          {detailResource && !editResource && (
            <ResourceDetail
              resource={resources.find((r) => r.id === detailResource.id) || detailResource}
              onClose={() => setDetailResource(null)}
            />
          )}

          {confirm?.type === "delete" && (
            <ConfirmDialog
              title="Delete resource?"
              body={<>This will permanently remove <strong style={{ color: "var(--text)" }}>&ldquo;{confirm.title}&rdquo;</strong> from Curio. This cannot be undone.</>}
              confirmLabel="Delete"
              danger
              onConfirm={() => deleteResource(confirm.id)}
              onCancel={() => setConfirm(null)}
            />
          )}
          {confirm?.type === "clear" && (
            <ConfirmDialog
              title="Delete all Curio data?"
              body="This permanently removes all resources, boards, tags, and notes from this device. This cannot be undone."
              confirmLabel="Delete Everything"
              danger
              onConfirm={clearAll}
              onCancel={() => setConfirm(null)}
            />
          )}

          {toast && (
            <div className="toast">
              <Check size={14} color="var(--success)" /> {toast}
            </div>
          )}

          <button className="back-to-landing" onClick={onBackToLanding} title="Back to landing page"><ChevronLeft size={13} /> Site</button>
        </div>
      </ResourceActionsContext.Provider>
    </ThemeContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  LANDING PAGE                                                        */
/* ------------------------------------------------------------------ */

const DEMO_WORKFLOWS = [
  {
    type: "web", title: "React Performance Guide", domain: "react.dev",
    board: "webdev", boardName: "Web Development",
    tags: ["react", "performance"], searchQuery: "react performance",
    otherResult: "React Compiler Documentation",
  },
  {
    type: "github", title: "facebook/react", domain: "github.com",
    board: "webdev", boardName: "Web Development",
    tags: ["react", "javascript"], searchQuery: "react",
    otherResult: "React Compiler Documentation",
  },
  {
    type: "youtube", title: "How LLMs Actually Work", domain: "youtube.com",
    board: "ai", boardName: "AI",
    tags: ["ai", "llm"], searchQuery: "LLMs",
    otherResult: "Attention Is All You Need — walkthrough",
  },
];

// One pass = discover a resource, capture it, organize it, then find it again via search.
// stage: 0 = Capture (syncs hero), 1 = Organize, 2 = Discover.
const DEMO_STEPS = [
  { id: "enter", duration: 250, stage: 0, cursor: null },
  { id: "toSave", duration: 450, stage: 0, cursor: { x: 60, y: 40 } },
  { id: "pauseSave", duration: 250, stage: 0, cursor: { x: 60, y: 40 } },
  { id: "clickSave", duration: 400, stage: 0, cursor: { x: 60, y: 40 }, click: true, captured: true },
  { id: "settle", duration: 250, stage: 0, cursor: { x: 60, y: 40 }, captured: true },
  { id: "toBoard", duration: 300, stage: 1, cursor: { x: 40, y: 46 }, captured: true },
  { id: "clickBoard", duration: 400, stage: 1, cursor: { x: 40, y: 46 }, click: true, captured: true, boardShown: true },
  { id: "toTags", duration: 300, stage: 1, cursor: { x: 46, y: 58 }, captured: true, boardShown: true },
  { id: "clickTags", duration: 400, stage: 1, cursor: { x: 46, y: 58 }, click: true, captured: true, boardShown: true, tagsShown: true },
  { id: "pauseOrganized", duration: 250, stage: 1, cursor: { x: 46, y: 58 }, captured: true, boardShown: true, tagsShown: true },
  { id: "toSearch", duration: 350, stage: 2, cursor: { x: 30, y: 14 } },
  { id: "clickSearch", duration: 250, stage: 2, cursor: { x: 30, y: 14 }, click: true, searching: true },
  { id: "typing", duration: 650, stage: 2, cursor: null, searching: true, typed: true },
  { id: "toResult", duration: 350, stage: 2, cursor: { x: 45, y: 34 }, searching: true, typed: true, resultShown: true },
  { id: "selectResult", duration: 350, stage: 2, cursor: { x: 45, y: 34 }, click: true, searching: true, typed: true, resultShown: true, selected: true },
  { id: "pauseFinal", duration: 450, stage: 2, cursor: null, searching: true, typed: true, resultShown: true, selected: true },
  { id: "exit", duration: 250, stage: 2, cursor: null, searching: true, typed: true, resultShown: true, selected: true, fading: true },
];

const DEMO_STATIC_STEP = {
  id: "static", stage: 2, cursor: null, captured: true, boardShown: true, tagsShown: true,
  searching: true, typed: true, resultShown: true, selected: true,
};

function useWorkflowSequence() {
  const reduced = usePrefersReducedMotion();
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const step = DEMO_STEPS[stepIndex];
    const t = setTimeout(() => {
      if (stepIndex === DEMO_STEPS.length - 1) {
        setWorkflowIndex((w) => (w + 1) % DEMO_WORKFLOWS.length);
        setStepIndex(0);
      } else {
        setStepIndex((s) => s + 1);
      }
    }, step.duration);
    return () => clearTimeout(t);
  }, [stepIndex, reduced]);

  const step = reduced ? DEMO_STATIC_STEP : DEMO_STEPS[stepIndex];
  return { workflowIndex, step, reduced };
}

function HeroTagline({ stage, reduced }) {
  const words = ["Capture.", "Organize.", "Discover."];
  return (
    <div style={{ display: "flex", gap: "clamp(10px,3vw,26px)", justifyContent: "center", flexWrap: "wrap" }}>
      {words.map((w, i) => {
        const isActive = !reduced && stage === i;
        return (
          <span
            key={w}
            style={{
              fontWeight: 600,
              color: reduced ? "var(--text)" : isActive ? "var(--text)" : "var(--text-secondary)",
              textShadow: isActive ? "0 0 22px rgba(139,92,246,0.55), 0 0 44px rgba(139,92,246,0.22)" : "none",
              transform: isActive ? "scale(1.035)" : "scale(1)",
              display: "inline-block",
              transition: "color 1s ease, text-shadow 1s ease, transform 1s ease",
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

function LandingNav({ onOpen }) {
  const navItems = [
    { id: "product", label: "Product" },
    { id: "how", label: "How it works" },
    { id: "features", label: "Features" },
    { id: "about", label: "About" },
  ];
  return (
    <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 30, background: "var(--nav-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
        <button onClick={scrollToTop} aria-label="Curio — scroll to top" style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          <Logo size={20} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Curio</span>
        </button>
        <div className="landing-nav-links" style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 13.5, color: "var(--text-secondary)" }}>
          {navItems.map((n) => (
            <button key={n.id} className="nav-link nav-link-btn" onClick={() => scrollToId(n.id)}>{n.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-secondary hide-sm" onClick={() => window.open("https://github.com", "_blank")}><Github size={14} /> GitHub</button>
          <button className="btn btn-primary" onClick={onOpen}>Open Curio</button>
        </div>
      </div>
    </nav>
  );
}

/* -- Cursor icon used inside the product workflow demo -- */

function DemoCursor() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
      <path
        d="M1.2 1L1.2 14.3L4.6 11.2L7 16.6L9.2 15.6L6.9 10.4L11.4 10.1L1.2 1Z"
        fill="var(--text)"
        stroke="var(--bg)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -- Product workflow demo: cursor-driven Capture -> Organize -> Discover across 3 resources -- */

function WorkflowDemo({ workflowIndex, step, reduced }) {
  const theme = useTheme();
  const workflow = DEMO_WORKFLOWS[workflowIndex];
  const stageLabels = ["Capture", "Organize", "Discover"];
  const [cursorPos, setCursorPos] = useState({ x: 60, y: 40 });

  useEffect(() => {
    if (step.cursor) setCursorPos(step.cursor);
  }, [step]);

  const cursorVisible = !reduced && !!step.cursor;
  const showCardScene = step.stage < 2;

  return (
    <div className="surface" style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 40px 100px -30px rgba(0,0,0,0.55)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: "var(--border-hover)" }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: "var(--border-hover)" }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: "var(--border-hover)" }} />
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {stageLabels.map((l, i) => (
            <span key={l} className="mono" style={{ fontSize: 10.5, letterSpacing: 0.4, color: (reduced ? i === 2 : step.stage === i) ? "var(--accent-light)" : "var(--text-muted)", transition: "color .8s ease" }}>{l}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", minHeight: 380 }}>
        <div style={{ width: 190, borderRight: "1px solid var(--border)", padding: "16px 12px", flexShrink: 0 }} className="hide-sm-flex">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 18, paddingLeft: 4 }}>
            <Logo size={15} /> <span style={{ fontSize: 12.5, fontWeight: 700 }}>Curio</span>
          </div>
          {["Library", null, "All Resources", "Favorites", "Archive", "Boards", null, "AI", "Web Development", "Cloud", "System Design", "DSA", "Tags", null, "#react", "#ai", "#cloud"].map((l, i) =>
            l === null ? <div key={i} style={{ height: 8 }} /> : (
              ["Library", "Boards", "Tags"].includes(l) ? (
                <div key={i} style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, padding: "4px 4px" }}>{l.toUpperCase()}</div>
              ) : (
                <div
                  key={i}
                  style={{
                    fontSize: 11.5,
                    color: l === "All Resources" ? "var(--text)" : "var(--text-secondary)",
                    background: (l === workflow.boardName && step.captured && step.stage >= 1) ? "var(--selected-bg)" : (l === "All Resources" ? "var(--surface-2)" : "transparent"),
                    borderRadius: 6, padding: "5px 8px", marginBottom: 1, transition: "background .6s ease",
                  }}
                >
                  {l}
                </div>
              )
            )
          )}
        </div>

        <div style={{ flex: 1, padding: "16px 18px", minWidth: 0, position: "relative" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Your Research</div>
          <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12 }}>
            <Search size={12} color="var(--text-muted)" /> <span style={{ color: "var(--text-muted)", flex: 1 }}>Search your research...</span> <Kbd>⌘K</Kbd>
          </div>

          {showCardScene ? (
            <div key={`${workflowIndex}-card`} className="demo-fade" style={{ display: "flex", justifyContent: "center", paddingTop: 26 }}>
              <div className="card" style={{ width: 210, padding: 14, borderStyle: step.captured ? "solid" : "dashed" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                  <TypeIcon type={workflow.type} size={12} />
                  <span style={{ fontSize: 9, color: typeColor(workflow.type, theme), fontWeight: 700, textTransform: "uppercase" }}>{TYPE_META[workflow.type].label}</span>
                </div>
                <div className="clamp-1" style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{workflow.title}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: step.captured ? 10 : 0 }}>{workflow.domain}</div>

                {step.captured && (
                  <div className="demo-badge-in" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--success)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px", marginBottom: step.boardShown ? 10 : 0 }}>
                    <Check size={10} color="var(--success)" /> Saved to Curio
                  </div>
                )}

                {step.boardShown && (
                  <div className="demo-badge-in" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-muted)", marginBottom: step.tagsShown ? 8 : 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: BOARD_ACCENTS[workflow.board] }} /> {workflow.boardName}
                  </div>
                )}

                {step.tagsShown && (
                  <div className="demo-badge-in" style={{ display: "flex", gap: 5 }}>
                    {workflow.tags.map((t) => <span key={t} className="tag" style={{ fontSize: 9.5 }}>#{t}</span>)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={`${workflowIndex}-search`} className="demo-fade" style={{ paddingTop: 10 }}>
              <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 11 }}>
                <Search size={11} color="var(--text-muted)" />
                <span style={{ color: "var(--text)", flex: 1 }}>
                  {step.typed ? (
                    reduced ? (
                      <span>{workflow.searchQuery}</span>
                    ) : (
                      <span className="demo-type-text" key={`${workflowIndex}-type`} style={{ "--chars": workflow.searchQuery.length }}>{workflow.searchQuery}</span>
                    )
                  ) : (
                    !reduced && <span className="demo-cursor">|</span>
                  )}
                </span>
              </div>

              {step.resultShown && (
                <div
                  className="demo-badge-in"
                  style={{
                    padding: "9px 10px", borderRadius: 8,
                    background: step.selected ? "var(--selected-bg)" : "transparent",
                    borderLeft: step.selected ? "2px solid var(--accent)" : "2px solid transparent",
                    transition: "background .3s ease, border-color .3s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <TypeIcon type={workflow.type} size={11} />
                    <span className="clamp-1" style={{ fontSize: 11.5, fontWeight: 600 }}>{workflow.title}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 6 }}>{workflow.domain}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, color: "var(--text-muted)", marginBottom: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: BOARD_ACCENTS[workflow.board] }} /> {workflow.boardName}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {workflow.tags.map((t) => <span key={t} className="tag" style={{ fontSize: 8.5 }}>#{t}</span>)}
                  </div>
                </div>
              )}

              {workflow.otherResult && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginTop: 2, opacity: 0.5 }}>
                  <TypeIcon type={workflow.type} size={11} />
                  <span className="clamp-1" style={{ fontSize: 11 }}>{workflow.otherResult}</span>
                </div>
              )}
            </div>
          )}

          <div
            className="demo-pointer"
            aria-hidden="true"
            style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%`, opacity: cursorVisible ? 1 : 0 }}
          >
            <DemoCursor />
            {step.click && !reduced && <span key={`${workflowIndex}-${step.id}`} className="demo-pointer-ripple" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function HowStep({ n, title, body, visual }) {
  return (
    <div style={{ flex: 1, minWidth: 180, textAlign: "center" }}>
      <div className="mono" style={{ fontSize: 12, color: "var(--accent-light)", marginBottom: 10 }}>0{n}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: visual ? 16 : 0 }}>{body}</div>
      {visual}
    </div>
  );
}

function FlowConnector({ delay = 0 }) {
  return (
    <div className="flow-connector" aria-hidden="true">
      <div className="flow-track">
        <span className="flow-pulse-dot" style={{ animationDelay: `${delay}s` }} />
      </div>
      <ArrowRight size={13} color="var(--text-muted)" className="flow-arrow" />
    </div>
  );
}

function ExtensionDemo() {
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
      <div className="surface" style={{ width: 280, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--border-hover)" }} />
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--border-hover)" }} />
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--border-hover)" }} />
        </div>
        <div style={{ padding: "20px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>React Performance Guide</div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>react.dev</div>
          <div style={{ height: 60, borderRadius: 8, background: "var(--surface-2)", marginTop: 14, border: "1px solid var(--border)" }} />
        </div>
      </div>

      <div style={{ alignSelf: "center", color: "var(--text-muted)" }}>
        <ArrowRight size={22} />
      </div>

      <div className="surface" style={{ width: 255, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Save to Curio</div>
        <div style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>React Performance Guide</div>
        <Field label="Board"><div className="input" style={{ fontSize: 12 }}>Web Development</div></Field>
        <div style={{ height: 10 }} />
        <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
          <span className="tag">react</span><span className="tag">performance</span>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }}>
          {saved ? <><Check size={13} /> Saved</> : "Save"}
        </button>
      </div>
    </div>
  );
}

function DiagramArrow() {
  return <div style={{ width: 1, height: 22, background: "var(--border)" }} aria-hidden="true" />;
}

function LocalFirstDiagram() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      <div className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--accent-light)", marginBottom: 4 }}>CURIO</div>
      <DiagramArrow />
      <div style={{ position: "relative", border: "1px dashed var(--border)", borderRadius: 16, padding: "22px 24px 18px", marginTop: 4 }}>
        <span
          className="mono"
          style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", background: "var(--bg-secondary)", padding: "0 8px", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "var(--text-muted)", whiteSpace: "nowrap" }}
        >
          STORED LOCALLY
        </span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="surface" style={{ width: 210, borderRadius: 10, padding: "10px 16px", textAlign: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Your Research</div>
            <div className="mono" style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>248 resources</div>
          </div>
          <DiagramArrow />
          <div className="surface-2" style={{ borderRadius: 999, padding: "5px 14px", marginTop: 4, marginBottom: 4 }}>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>IndexedDB · local storage</div>
          </div>
          <DiagramArrow />
          <div className="mono" style={{ fontSize: 12, color: "var(--text)", fontWeight: 700, letterSpacing: 0.5, marginTop: 6 }}>YOUR DEVICE</div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <Icon size={17} color="var(--accent-light)" style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}

function Glow({ style }) {
  return <div className="ambient-glow" style={style} aria-hidden="true" />;
}

function Eyebrow({ children }) {
  return <div className="eyebrow">{children}</div>;
}

/* -- Small static product-UI snippets used as "illustrations" throughout the landing page -- */

function HowStepCaptureVisual() {
  const theme = useTheme();
  return (
    <div className="card" style={{ padding: 12, width: 180, margin: "0 auto", borderStyle: "dashed" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <TypeIcon type="web" size={11} />
        <span style={{ fontSize: 8.5, color: typeColor("web", theme), fontWeight: 700, textTransform: "uppercase" }}>Web</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>React Performance Guide</div>
      <div className="mono" style={{ fontSize: 9.5, color: "var(--text-muted)" }}>react.dev</div>
    </div>
  );
}

function HowStepOrganizeVisual() {
  const theme = useTheme();
  return (
    <div className="card" style={{ padding: 12, width: 180, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <TypeIcon type="web" size={11} />
        <span style={{ fontSize: 8.5, color: typeColor("web", theme), fontWeight: 700, textTransform: "uppercase" }}>Web</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>React Performance Guide</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, color: "var(--text-muted)", marginBottom: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: 99, background: BOARD_ACCENTS.webdev }} /> Web Development
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <span className="tag" style={{ fontSize: 8.5 }}>#react</span>
        <span className="tag" style={{ fontSize: 8.5 }}>#performance</span>
      </div>
    </div>
  );
}

function HowStepDiscoverVisual() {
  return (
    <div className="card" style={{ padding: 12, width: 180, margin: "0 auto" }}>
      <div className="input" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 10 }}>
        <Search size={10} color="var(--text-muted)" /> <span style={{ color: "var(--text)" }}>react performance</span>
      </div>
      <div style={{ padding: "6px 7px", borderRadius: 6, background: "var(--selected-bg)", borderLeft: "2px solid var(--accent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <TypeIcon type="web" size={10} /> <span style={{ fontSize: 10 }}>React Performance Guide</span>
        </div>
      </div>
    </div>
  );
}

function MiniResourceChip({ type, title, domain }) {
  const theme = useTheme();
  return (
    <div className="card" style={{ padding: 10, width: 148, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <TypeIcon type={type} size={11} />
        <span style={{ fontSize: 8.5, color: typeColor(type, theme), fontWeight: 700, textTransform: "uppercase" }}>{TYPE_META[type].label}</span>
      </div>
      <div className="clamp-1" style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      {domain && <div className="mono" style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{domain}</div>}
    </div>
  );
}

function StoryOrganizeVisual() {
  const theme = useTheme();
  return (
    <div className="card" style={{ padding: 16, width: 240 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <TypeIcon type="web" size={12} />
          <span style={{ fontSize: 9, color: typeColor("web", theme), fontWeight: 700, textTransform: "uppercase" }}>Web</span>
        </div>
        <Star size={13} fill="#A78BFA" color="#A78BFA" />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>React Performance Guide</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: BOARD_ACCENTS.webdev }} /> Web Development
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
        <span className="tag">react</span><span className="tag">performance</span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>Added 2h ago</div>
    </div>
  );
}

function StoryDiscoverVisual() {
  return (
    <div className="card" style={{ padding: 16, width: 260 }}>
      <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11.5 }}>
        <Search size={12} color="var(--text-muted)" /> <span style={{ color: "var(--text)", flex: 1 }}>react performance</span> <Kbd>⌘K</Kbd>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <Chip active>Web</Chip>
        <Chip>GitHub</Chip>
        <Chip>Favorites</Chip>
      </div>
      <div style={{ padding: "8px 9px", borderRadius: 8, background: "var(--selected-bg)", borderLeft: "2px solid var(--accent)", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <TypeIcon type="web" size={11} /> <span style={{ fontSize: 11.5, fontWeight: 600 }}>React Performance Guide</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", opacity: 0.55 }}>
        <TypeIcon type="github" size={11} /> <span style={{ fontSize: 11 }}>facebook/react</span>
      </div>
    </div>
  );
}

const FEATURE_CHIPS = [
  { icon: Folder, label: "Local-first" },
  { icon: Search, label: "Fast search" },
  { icon: LayoutGrid, label: "Boards" },
  { icon: Tag, label: "Tags" },
  { icon: Command, label: "Keyboard-first" },
  { icon: Github, label: "Browser capture" },
  { icon: Upload, label: "Import & Export" },
  { icon: Globe, label: "Resource types" },
];

const FAQ_ITEMS = [
  { q: "How is my research stored?", a: "Locally, on your device, in an IndexedDB-backed library — not on a Curio server." },
  { q: "Does Curio require an account?", a: "No. There's nothing to sign up for — Curio works the moment you open it." },
  { q: "Can I export my resources?", a: "Yes. Settings → Data lets you export a full backup whenever you want it." },
  { q: "What happens when I archive something?", a: "It's removed from your active library but not deleted — restore it from Archive anytime." },
  { q: "What types of resources can I save?", a: "Web pages, GitHub repositories, YouTube videos, and your own notes." },
];

function Landing({ onOpen, theme }) {
  const { workflowIndex, step, reduced } = useWorkflowSequence();
  return (
    <ThemeContext.Provider value={theme}>
      <div className="curio" data-theme={theme}>
        <style>{CSS}</style>
        <LandingNav onOpen={onOpen} />
        <div style={{ height: 62 }} aria-hidden="true" />

      {/* HERO */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <Glow style={{ width: 520, height: 520, top: -140, left: "50%", transform: "translateX(-50%)" }} />
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "58px 24px 24px", textAlign: "center", position: "relative" }}>
          <h1 style={{ fontSize: "clamp(38px, 6vw, 60px)", fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, marginBottom: 14 }}>
            Curio
          </h1>
          <div style={{ fontSize: "clamp(18px, 2.4vw, 24px)", marginBottom: 18 }}>
            <HeroTagline stage={step.stage} reduced={reduced} />
          </div>
          <p style={{ fontSize: 15.5, color: "var(--text-muted)", maxWidth: 500, margin: "0 auto 26px", lineHeight: 1.6 }}>
            A local-first research library for everything worth keeping from the web.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ padding: "11px 20px", fontSize: 14 }} onClick={onOpen}>Open Curio</button>
            <button className="btn btn-secondary" style={{ padding: "11px 20px", fontSize: 14 }} onClick={() => scrollToId("product")}>Explore the product</button>
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section id="product" style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px 80px", position: "relative" }}>
        <WorkflowDemo workflowIndex={workflowIndex} step={step} reduced={reduced} />
      </section>

      <div className="section-divider" />

      {/* HOW IT WORKS */}
      <section id="how" style={{ maxWidth: 1000, margin: "0 auto", padding: "56px 24px 68px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <Eyebrow>THE WORKFLOW</Eyebrow>
          <div style={{ fontSize: 22, fontWeight: 700 }}>One system, three moments.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <HowStep n={1} title="Capture" body="Save something worth keeping." visual={<HowStepCaptureVisual />} />
          <FlowConnector delay={0} />
          <HowStep n={2} title="Organize" body="Give it context." visual={<HowStepOrganizeVisual />} />
          <FlowConnector delay={1.6} />
          <HowStep n={3} title="Discover" body="Find it when you need it." visual={<HowStepDiscoverVisual />} />
        </div>
      </section>

      {/* PRODUCT STORY */}
      <section id="features" style={{ padding: "76px 24px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <Eyebrow>WHAT YOU CAN DO</Eyebrow>
            <div style={{ fontSize: 22, fontWeight: 700 }}>A research library that actually works like one.</div>
          </div>

          <div className="split" style={{ marginBottom: 40 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--accent-light)", marginBottom: 8 }}>01</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Keep everything worth coming back to.</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Articles, repos, videos, and your own notes — Curio gives every source you use one consistent research library, no matter where it came from.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <MiniResourceChip type="web" title="React Performance Guide" domain="react.dev" />
              <MiniResourceChip type="github" title="facebook/react" domain="github.com" />
              <MiniResourceChip type="youtube" title="How LLMs Actually Work" domain="youtube.com" />
              <MiniResourceChip type="note" title="Sliding window notes" />
            </div>
          </div>

          <div className="split" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", justifyContent: "center", order: 2 }}>
              <StoryOrganizeVisual />
            </div>
            <div style={{ order: 1 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--accent-light)", marginBottom: 8 }}>02</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Give your research some structure.</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                A captured resource becomes part of a board, picks up a few tags, and can be favorited for later — so it's never just sitting in a pile.
              </p>
            </div>
          </div>

          <div className="split">
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--accent-light)", marginBottom: 8 }}>03</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Find the thing you saved six months ago.</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Cmd/Ctrl+K opens search from anywhere in Curio. Filter by type, board, or status, and the result you're looking for is a couple of keystrokes away.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StoryDiscoverVisual />
            </div>
          </div>

          <div style={{ marginTop: 44, paddingTop: 28, borderTop: "1px solid var(--border)" }}>
            <div className="eyebrow" style={{ textAlign: "center", marginBottom: 18 }}>ALSO INCLUDED</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              {[FEATURE_CHIPS.slice(0, 4), FEATURE_CHIPS.slice(4)].map((row, i) => (
                <div key={i} className="feature-chip-row">
                  {row.map(({ icon: Icon, label }) => (
                    <span key={label} className="feature-chip">
                      <Icon size={13} color="var(--accent-light)" /> {label}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BROWSER CAPTURE */}
      <section style={{ padding: "70px 24px" }}>
        <div className="split split-capture" style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div>
            <Eyebrow>BROWSER CAPTURE</Eyebrow>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Save it before you close the tab.</div>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Found something worth keeping? The Curio browser extension saves it — with its type, source, and a place to organize it — in seconds. No context switch required.
            </p>
          </div>
          <div>
            <ExtensionDemo />
          </div>
        </div>
      </section>

      {/* LOCAL-FIRST */}
      <section id="about" style={{ padding: "70px 24px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="split" style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div>
            <Eyebrow>LOCAL-FIRST</Eyebrow>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Your research stays yours.</div>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
              Curio's library lives on your device, not on a server somewhere. There's nothing to sign up for and nothing syncing in the background.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["No account required", "No server storing your research", "Export your library anytime"].map((t) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                  <Check size={14} color="var(--success)" /> {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LocalFirstDiagram />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "70px 24px" }}>
        <div className="split" style={{ maxWidth: 1000, margin: "0 auto", alignItems: "start" }}>
          <div style={{ paddingTop: 6 }}>
            <Eyebrow>QUESTIONS</Eyebrow>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>Questions before you save everything here?</div>
          </div>
          <div>
            {FAQ_ITEMS.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: "70px 24px 90px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <Glow style={{ width: 460, height: 460, top: -80, left: "50%", transform: "translateX(-50%)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Stop losing the things worth remembering.</div>
          <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.6 }}>
            Capture it once. Curio keeps it organized and searchable for whenever you need it again.
          </p>
          <div className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 14px", marginBottom: 24 }}>
            <Search size={12} color="var(--text-muted)" /> react performance <ArrowRight size={11} color="var(--text-muted)" /> <span style={{ color: "var(--success)" }}>found in Curio</span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ padding: "11px 20px", fontSize: 14 }} onClick={onOpen}>Open Curio</button>
            <button className="btn btn-secondary" style={{ padding: "11px 20px", fontSize: 14 }} onClick={() => window.open("https://github.com", "_blank")}>View on GitHub</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Curio</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Capture. Organize. Discover.</div>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <a className="nav-link" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
            <span className="nav-link" style={{ cursor: "default" }}>Privacy</span>
            <span className="nav-link" style={{ cursor: "default" }}>About</span>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-muted)", marginTop: 20 }}>Built for people who are curious.</div>
        </footer>
      </div>
    </ThemeContext.Provider>
  );
}

function useAppRoute() {
  const getPath = () => {
    try {
      return window.location.pathname === "/app";
    } catch {
      return false;
    }
  };
  const [inApp, setInApp] = useState(getPath);

  useEffect(() => {
    function onPopState() {
      try {
        setInApp(window.location.pathname === "/app");
      } catch {
        /* sandboxed environment — state-only navigation still works */
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(toApp) {
    setInApp(toApp);
    try {
      const path = toApp ? "/app" : "/";
      if (window.location.pathname !== path) {
        window.history.pushState({ curioApp: toApp }, "", path);
      }
    } catch {
      /* sandboxed environment — state-only navigation still works */
    }
  }

  return [inApp, navigate];
}

/* ------------------------------------------------------------------ */
/*  ROOT                                                                */
/* ------------------------------------------------------------------ */

export default function CurioPrototype() {
  const [inApp, navigate] = useAppRoute();
  const [theme, setTheme] = useState(loadStoredTheme);

  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  return inApp
    ? <CurioApp onBackToLanding={() => navigate(false)} theme={theme} setTheme={setTheme} />
    : <Landing onOpen={() => navigate(true)} theme={theme} />;
}

/* ------------------------------------------------------------------ */
/*  CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
.curio {
  --bg: #0B0C0F;
  --bg-secondary: #111318;
  --surface: #17191F;
  --surface-2: #1D2027;
  --border: #272A32;
  --border-hover: #3a3d47;
  --text: #F4F4F5;
  --text-secondary: #A1A1AA;
  --text-muted: #71717A;
  --accent: #8B5CF6;
  --accent-light: #A78BFA;
  --success: #34D399;
  --warning: #F59E0B;
  --error: #EF4444;
  --overlay-bg: rgba(5,5,7,0.72);
  --nav-bg: rgba(11,12,15,0.85);
  --input-bg: var(--surface-2);
  --selected-bg: rgba(139,92,246,0.14);

  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  min-height: 100vh;
  width: 100%;
  position: relative;
  transition: background-color .25s ease, color .25s ease;
}
.curio[data-theme="light"] {
  --bg: #F5F5F7;
  --bg-secondary: #FFFFFF;
  --surface: #FFFFFF;
  --surface-2: #F1F1F4;
  --border: #DCDCE2;
  --border-hover: #C6C6CE;
  --text: #18181B;
  --text-secondary: #52525B;
  --text-muted: #71717A;
  --accent: #7C3AED;
  --accent-light: #6D28D9;
  --success: #059669;
  --warning: #B45309;
  --error: #DC2626;
  --overlay-bg: rgba(24,24,27,0.45);
  --nav-bg: rgba(245,245,247,0.85);
  --input-bg: #FFFFFF;
  --selected-bg: rgba(124,58,237,0.08);
}
.curio * { box-sizing: border-box; }
.mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
.curio input::placeholder, .curio textarea::placeholder { color: var(--text-muted); opacity: 1; }

.card, .surface, .input, .sidebar, .btn-secondary, .search-trigger {
  transition: background-color .2s ease, border-color .2s ease, color .2s ease, transform .12s ease;
}
.surface { background: var(--surface); border: 1px solid var(--border); }
.surface-2 { background: var(--surface-2); border: 1px solid var(--border); }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 8px; font-size: 13px; font-weight: 500;
  padding: 8px 14px; transition: all .15s ease; cursor: pointer;
  border: 1px solid transparent; font-family: inherit; white-space: nowrap;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-light); }
.btn-secondary { background: var(--surface-2); border-color: var(--border); color: var(--text); }
.btn-secondary:hover { border-color: var(--border-hover); }
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { color: var(--text); background: var(--surface-2); }
.btn-danger-ghost { background: transparent; color: var(--error); border: 1px solid var(--border); }
.btn-danger-ghost:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); }
.btn-danger { background: var(--error); color: #fff; }
.btn-danger:hover { filter: brightness(1.1); }
.btn:disabled { opacity: .6; cursor: default; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; background: transparent;
  border: none; color: var(--text-secondary); cursor: pointer; transition: all .15s ease;
}
.icon-btn:hover { background: var(--surface-2); color: var(--text); }

.input {
  background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 12px; font-size: 13px; color: var(--text); outline: none; font-family: inherit;
}
.input:focus { border-color: var(--accent); }
.input-error { border-color: var(--error) !important; }
.select { appearance: none; cursor: pointer; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
.resource-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }

.clamp-1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.tag { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

.kbd { font-family: monospace; font-size: 11px; padding: 2px 6px; border-radius: 5px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-secondary); display: inline-flex; align-items: center; }

.fav-btn { background: transparent; border: none; cursor: pointer; padding: 2px; display: flex; }

.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px; border-radius: 7px; background: transparent; border: none; font-size: 12.5px; cursor: pointer; text-align: left; font-family: inherit; }
.menu-item:hover { background: var(--surface-2); }
.menu-divider { height: 1px; background: var(--border); margin: 5px 2px; }
.menu-label { font-size: 10.5px; font-weight: 600; color: var(--text-muted); padding: 6px 9px 3px; text-transform: uppercase; letter-spacing: .4px; }

.nav-item:hover { background: var(--surface-2) !important; }
.nav-link { color: var(--text-secondary); text-decoration: none; transition: color .15s ease; }
.nav-link:hover { color: var(--text); }
.nav-link-btn { background: none; border: none; font: inherit; padding: 3px 1px; cursor: pointer; }
.settings-divider { height: 1px; background: var(--border); margin: 0 0 24px; }
.link-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-secondary); font-size: 12.5px; cursor: pointer; font-family: inherit; }
.link-btn:hover { color: var(--accent-light); }

.search-trigger {
  flex: 1; display: flex; align-items: center; gap: 10px; background: var(--input-bg);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; cursor: pointer;
  max-width: 420px;
}
.search-trigger:hover { border-color: var(--border-hover); }
.search-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.overlay {
  position: fixed; inset: 0; background: var(--overlay-bg); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
  animation: fadeIn .15s ease;
}
.overlay-top { align-items: flex-start; padding-top: 110px; }
.cmdk-overlay { backdrop-filter: blur(8px); }
.modal-pop { animation: popIn .18s cubic-bezier(.2,.9,.3,1); box-shadow: 0 30px 70px -25px rgba(0,0,0,0.45); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

.popover { animation: popIn .15s ease; box-shadow: 0 20px 50px -20px rgba(0,0,0,0.5); }

.toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 16px; font-size: 12.5px; color: var(--text); display: flex; align-items: center; gap: 8px;
  z-index: 200; box-shadow: 0 12px 30px -10px rgba(0,0,0,0.4); animation: popIn .18s ease;
}

.sidebar {
  width: 248px; flex-shrink: 0; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; height: 100vh; position: sticky; top: 0;
  background: var(--bg);
}
.sidebar-scrim { display: none; }
.back-to-landing {
  position: fixed; bottom: 16px; right: 16px; background: var(--surface); border: 1px solid var(--border);
  color: var(--text-secondary); font-size: 11.5px; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; gap: 4px; z-index: 60;
}

.demo-fade { animation: fadeSlide .5s ease; }
@keyframes fadeSlide { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.demo-badge-in { animation: fadeSlide .4s ease; }
.demo-cursor { display: inline-block; margin-left: 1px; animation: demoBlink 1s steps(2) infinite; color: var(--accent); }
@keyframes demoBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

.demo-type-text { display: inline-block; overflow: hidden; white-space: nowrap; vertical-align: bottom; width: 0; animation: demoType .6s steps(var(--chars, 20)) forwards; }
@keyframes demoType { to { width: calc(var(--chars, 20) * 1ch); } }

.demo-pointer {
  position: absolute; width: 14px; height: 18px; pointer-events: none; z-index: 5;
  transition: left .5s cubic-bezier(.4,0,.2,1), top .5s cubic-bezier(.4,0,.2,1), opacity .3s ease;
}
.demo-pointer-ripple {
  position: absolute; left: -3px; top: -3px; width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid var(--accent); animation: demoRipple .45s ease-out forwards; pointer-events: none;
}
@keyframes demoRipple { from { transform: scale(.3); opacity: .85; } to { transform: scale(1.9); opacity: 0; } }

.ambient-glow {
  position: absolute; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(139,92,246,0.16), transparent 70%);
  filter: blur(50px); z-index: 0;
}

.section-divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border), transparent); max-width: 1000px; margin: 0 auto; }

#product, #how, #features, #about { scroll-margin-top: 78px; }

.flow-connector { position: relative; display: flex; align-items: center; justify-content: center; gap: 0; padding-top: 44px; flex: 1 1 24px; min-width: 24px; max-width: 60px; }
.flow-track { position: relative; width: 100%; height: 1px; background: var(--border-hover); }
.flow-pulse-dot {
  position: absolute; top: 50%; left: 0; width: 5px; height: 5px; border-radius: 99px;
  background: var(--accent-light); box-shadow: 0 0 6px var(--accent-light); transform: translate(-50%, -50%);
  opacity: 0; animation: flowPulse 3.2s ease-in-out infinite;
}
@keyframes flowPulse { 0% { left: 0%; opacity: 0; } 12% { opacity: .85; } 88% { opacity: .85; } 100% { left: 100%; opacity: 0; } }
.flow-arrow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg); padding: 0 3px; }

.eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent-light); margin-bottom: 10px; }

.split { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.split-capture { grid-template-columns: 0.7fr 1.3fr; }

.feature-chip { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-secondary); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; }
.feature-chip-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

.faq-item { border-bottom: 1px solid var(--border); padding: 14px 0; }
.faq-item:last-child { border-bottom: none; }
.faq-item summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text); list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after { content: '+'; font-size: 18px; line-height: 1; color: var(--text-muted); font-weight: 400; flex-shrink: 0; transition: transform .2s ease; }
.faq-item[open] summary::after { transform: rotate(45deg); }
.faq-item p { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 10px 0 0; }

*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@media (max-width: 860px) {
  .hide-sm { display: none; }
  .landing-nav-links { display: none !important; }
  .flow-connector { display: none; }
  .split { grid-template-columns: 1fr; gap: 28px; }
  .split-capture { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .sidebar { position: fixed; left: -260px; top: 0; z-index: 90; transition: left .2s ease; box-shadow: 20px 0 60px rgba(0,0,0,0.4); }
  .sidebar-open { left: 0 !important; }
  .sidebar-scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 80; }
  .mobile-only { display: inline-flex !important; }
  .hide-sm-flex { display: none !important; }
}
@media (min-width: 641px) {
  .mobile-only { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .demo-fade { animation: none; }
  .modal-pop, .popover { animation: none; }
  .demo-badge-in { animation: none; opacity: 1; }
  .demo-cursor { display: none; }
  .demo-pointer, .demo-pointer-ripple { display: none; }
  .demo-type-text { animation: none; width: auto; }
  .flow-pulse-dot { animation: none; opacity: 0; }
}
`;
