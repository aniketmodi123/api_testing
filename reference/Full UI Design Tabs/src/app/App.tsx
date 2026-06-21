import { useState } from "react";
import {
  Palette, Droplet, Type, Code2, AlignVerticalJustifyCenter, CornerUpRight,
  Layers, Waves, Shapes, Component, LayoutTemplate, BarChart2, Terminal,
  Accessibility, SlidersHorizontal, Download, Upload, ShoppingBag, Search,
  Copy, Share2, Plus, Check, FileCode, Settings2, X, Minus, Square
} from "lucide-react";

// ─── Types & Data ───────────────────────────────────────────────────────────

type Tab = "appearance" | "builder" | "marketplace";
type NavItem = { id: string; label: string; icon: React.ReactNode };
type ColorThemeKey = "light" | "middark" | "deepdark" | "github" | "linear";

interface ColorTheme {
  label: string;
  bg: string;
  surface: string;
  accent: string;
  accentLabel: string;
  text: string;
  border: string;
}

const COLOR_THEMES: Record<ColorThemeKey, ColorTheme> = {
  light:    { label: "Light Pro",   bg: "#FFFFFF",   surface: "#F0F2F5", accent: "#2563EB", accentLabel: "Blue",   text: "#15181C", border: "#E3E6EA" },
  middark:  { label: "Mid Dark",    bg: "#1A1C1F",   surface: "#25282D", accent: "#2DD4BF", accentLabel: "Teal",   text: "#E7EAEE", border: "#2A2E34" },
  deepdark: { label: "Deep Dark",   bg: "#0A0B0D",   surface: "#16181C", accent: "#818CF8", accentLabel: "Indigo", text: "#EDEFF2", border: "#1E2024" },
  github:   { label: "GitHub",      bg: "#0D1117",   surface: "#161B22", accent: "#2F81F7", accentLabel: "GH Blue",text: "#E6EDF3", border: "#30363D" },
  linear:   { label: "Linear",      bg: "#0B0C0E",   surface: "#16171A", accent: "#5E6AD2", accentLabel: "Violet", text: "#F7F8F8", border: "#1F2023" },
};

const ACCENT_COLORS = [
  { key: "teal",   hex: "#2DD4BF" },
  { key: "blue",   hex: "#3B82F6" },
  { key: "indigo", hex: "#6366F1" },
  { key: "cyan",   hex: "#06B6D4" },
  { key: "green",  hex: "#22C55E" },
  { key: "orange", hex: "#F97316" },
  { key: "red",    hex: "#EF4444" },
];

const MARKETPLACE_THEMES = [
  { id: "tokyo",      name: "Tokyo Night Pro",    author: "enkia",          installs: "48.2k", tag: "Dark",  pal: ["#1a1b26","#24283b","#7AA2F7","#BB9AF7"], installed: false },
  { id: "catppuccin", name: "Catppuccin Mocha",   author: "catppuccin",     installs: "91.7k", tag: "Dark",  pal: ["#1e1e2e","#313244","#cba6f7","#94e2d5"], installed: true  },
  { id: "gruvbox",    name: "Gruvbox",             author: "morhetz",        installs: "33.0k", tag: "Warm",  pal: ["#282828","#3c3836","#fabd2f","#b8bb26"], installed: false },
  { id: "nord",       name: "Nord",                author: "arcticicestudio", installs: "71.4k", tag: "Cool",  pal: ["#2e3440","#3b4252","#88c0d0","#a3be8c"], installed: false },
  { id: "rosepine",   name: "Rosé Pine",           author: "rose-pine",      installs: "56.8k", tag: "Dark",  pal: ["#191724","#26233a","#ebbcba","#9ccfd8"], installed: false },
  { id: "solarized",  name: "Solarized Light",     author: "altercation",    installs: "40.1k", tag: "Light", pal: ["#FFFFFF","#FDF6E3","#268BD2","#2AA198"], installed: false },
  { id: "dracula",    name: "Dracula",             author: "dracula",        installs: "102k",  tag: "Dark",  pal: ["#282a36","#44475a","#ff79c6","#50fa7b"], installed: false },
  { id: "monokai",    name: "Monokai Pro",         author: "monokai",        installs: "29.3k", tag: "Dark",  pal: ["#272822","#3e3d32","#F92672","#A6E22E"], installed: false },
  { id: "onedark",    name: "One Dark Pro",        author: "binaryify",      installs: "65.5k", tag: "Dark",  pal: ["#282c34","#353b45","#61afef","#98c379"], installed: false },
];

// ─── Shared styles ───────────────────────────────────────────────────────────

const S = {
  bg:        "#161719",
  surface1:  "#1B1D20",
  surface2:  "#202327",
  surface3:  "#25282D",
  inset:     "#131417",
  border:    "#2A2E34",
  borderStr: "#383D44",
  text1:     "#E6E9ED",
  text2:     "#99A1AC",
  text3:     "#7E8691",
  text4:     "#5b626b",
  accent:    "#2DD4BF",
  accentFg:  "#08312A",
  accentSoft:"rgba(45,212,191,.14)",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function TitleBar({ activeTab, onTab }: { activeTab: Tab; onTab: (t: Tab) => void }) {
  return (
    <>
      {/* Traffic + window title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: S.surface1, borderBottom: `1px solid ${S.border}` }}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#F0626A", display: "inline-block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#D29922", display: "inline-block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#3FB950", display: "inline-block" }} />
        <span style={{ marginLeft: 8, fontSize: 12, color: S.text2 }}>
          Forge <span style={{ color: S.text4 }}>·</span> Appearance
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 14, color: S.text4 }}>
          <Minus size={14} /><Square size={14} /><X size={14} />
        </span>
      </div>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 11px", borderBottom: `1px solid ${S.border}`, fontSize: 12 }}>
        {(["appearance","builder","marketplace"] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => onTab(tab)}
            style={{
              padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer",
              background: activeTab === tab ? S.surface2 : "transparent",
              color: activeTab === tab ? S.text1 : S.text2,
              fontSize: 12, fontFamily: "Inter, sans-serif",
            }}
          >
            {tab === "appearance" ? "Appearance" : tab === "builder" ? "Theme builder" : "Marketplace"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[{ icon: <Download size={13} />, label: "Import" }, { icon: <Upload size={13} />, label: "Export" }].map(b => (
            <button key={b.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${S.border}`, borderRadius: 6, background: "transparent", color: S.text2, fontSize: 11.5, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
              {b.icon}{b.label}
            </button>
          ))}
        </span>
      </div>
    </>
  );
}

// ─── Nav items ───────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "color",       label: "Color theme",    icon: <Palette size={15} /> },
  { id: "accent",      label: "Accent",         icon: <Droplet size={15} /> },
  { id: "typography",  label: "Typography",     icon: <Type size={15} /> },
  { id: "codefont",    label: "Code font",      icon: <Code2 size={15} /> },
  { id: "density",     label: "Density",        icon: <AlignVerticalJustifyCenter size={15} /> },
  { id: "radius",      label: "Radius",         icon: <CornerUpRight size={15} /> },
  { id: "shadows",     label: "Shadows",        icon: <Layers size={15} /> },
  { id: "motion",      label: "Motion",         icon: <Waves size={15} /> },
  { id: "icons",       label: "Icons",          icon: <Shapes size={15} /> },
  { id: "components",  label: "Components",     icon: <Component size={15} /> },
  { id: "layout",      label: "Layout",         icon: <LayoutTemplate size={15} /> },
  { id: "charts",      label: "Charts",         icon: <BarChart2 size={15} /> },
  { id: "editor",      label: "Code editor",    icon: <Terminal size={15} /> },
  { id: "a11y",        label: "Accessibility",  icon: <Accessibility size={15} /> },
];

// ─── Segmented control ────────────────────────────────────────────────────────

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${S.border}`, borderRadius: 7, overflow: "hidden", background: S.surface1 }}>
      {options.map((opt, i) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "5px 10px", fontSize: 11.5, border: "none", borderRight: i < options.length - 1 ? `1px solid ${S.border}` : "none",
            background: value === opt ? S.surface2 : "transparent",
            color: value === opt ? S.text1 : S.text2,
            cursor: "pointer", fontFamily: "Inter, sans-serif",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function LivePreview({ colorTheme, accentHex }: { colorTheme: ColorThemeKey; accentHex: string }) {
  const theme = COLOR_THEMES[colorTheme];
  const isLight = colorTheme === "light";
  const methodColors = isLight
    ? { GET: "#16803C", POST: "#B45309", PUT: "#1D4ED8", DEL: "#DC2626" }
    : { GET: "#3FB950", POST: "#D29922", PUT: "#4C8DF6", DEL: "#F0626A" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "15px 0 7px" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentHex, display: "inline-block" }} />
        <span style={{ fontSize: 11, color: S.text2 }}>Live preview</span>
        <span style={{ fontSize: 10, color: S.text4, marginLeft: "auto" }}>
          {colorTheme} · standard · modern
        </span>
      </div>
      <div style={{ border: `1px solid ${S.border}`, borderRadius: 8, overflow: "hidden", background: theme.bg, transition: "all 200ms ease" }}>
        <div style={{ display: "flex", minHeight: 218 }}>
          {/* Sidebar */}
          <div style={{ width: 118, flexShrink: 0, borderRight: `1px solid ${theme.border}`, padding: "8px 7px", background: theme.bg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: theme.text, marginBottom: 8 }}>
              <span style={{ fontSize: 13, opacity: 0.5 }}>📁</span> Users API
            </div>
            {[
              { method: "GET", path: "/users", active: true },
              { method: "POST", path: "/users", active: false },
              { method: "PUT", path: "/users/:id", active: false },
              { method: "DEL", path: "/users/:id", active: false },
            ].map(r => (
              <div key={r.method + r.path} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 5px", borderRadius: 5, marginBottom: 2, background: r.active ? theme.surface : "transparent" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 10.5, color: methodColors[r.method as keyof typeof methodColors], minWidth: 28 }}>{r.method}</span>
                <span style={{ fontSize: 10.5, color: r.active ? theme.text : (isLight ? "#5A626E" : S.text2) }}>{r.path}</span>
              </div>
            ))}
            <div style={{ height: 1, background: theme.border, margin: "7px 0" }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 5px" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 10.5, color: methodColors.GET }}>GET</span>
              <span style={{ fontSize: 10.5, color: isLight ? "#5A626E" : S.text2 }}>/orders</span>
            </div>
          </div>
          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0, padding: "9px 10px", background: theme.bg }}>
            {/* Request bar */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, color: methodColors.GET }}>GET</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: isLight ? "#15181C" : "#C7CDD4", background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "5px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                api.forge.dev/v1/users?limit=20
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: colorTheme === "light" ? "#FFFFFF" : S.accentFg, background: accentHex, borderRadius: 6, padding: "5px 11px", cursor: "pointer", transition: "opacity 150ms" }}>
                Send
              </span>
            </div>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 13, fontSize: 10.5, margin: "9px 0 7px", color: isLight ? "#5A626E" : S.text3 }}>
              <span style={{ color: theme.text, borderBottom: `1.5px solid ${accentHex}`, paddingBottom: 3 }}>Body</span>
              <span>Params</span><span>Headers</span><span>Auth</span>
            </div>
            {/* Code block */}
            <div style={{ background: "#16161E", border: "1px solid #23232f", borderRadius: 6, padding: "8px 9px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, lineHeight: 1.7 }}>
              <div><span style={{ color: "#565F89" }}>{"{"}</span></div>
              <div style={{ paddingLeft: 12 }}><span style={{ color: "#7AA2F7" }}>"role"</span><span style={{ color: "#565F89" }}>: </span><span style={{ color: "#9ECE6A" }}>"admin"</span><span style={{ color: "#565F89" }}>,</span></div>
              <div style={{ paddingLeft: 12 }}><span style={{ color: "#7AA2F7" }}>"active"</span><span style={{ color: "#565F89" }}>: </span><span style={{ color: "#BB9AF7" }}>true</span><span style={{ color: "#565F89" }}>,</span></div>
              <div style={{ paddingLeft: 12 }}><span style={{ color: "#7AA2F7" }}>"limit"</span><span style={{ color: "#565F89" }}>: </span><span style={{ color: "#FF9E64" }}>20</span></div>
              <div><span style={{ color: "#565F89" }}>{"}"}</span></div>
            </div>
            {/* Response */}
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9, fontSize: 10.5 }}>
              <span style={{ color: "#3FB950", fontWeight: 500 }}>200 OK</span>
              <span style={{ color: S.text3 }}>142 ms</span>
              <span style={{ color: S.text3 }}>2.4 KB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Appearance tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const [activeNav, setActiveNav] = useState("color");
  const [colorTheme, setColorTheme] = useState<ColorThemeKey>("middark");
  const [accentIdx, setAccentIdx] = useState(0);
  const [density, setDensity] = useState("Standard");
  const [radius, setRadius] = useState("Modern");
  const [shadow, setShadow] = useState("Subtle");
  const [motion, setMotion] = useState("Premium");

  const accentHex = ACCENT_COLORS[accentIdx].hex;

  const panelContent: Record<string, React.ReactNode> = {
    color: (
      <>
        <div style={{ fontSize: 14, fontWeight: 500, color: S.text1 }}>Color theme</div>
        <div style={{ fontSize: 11.5, color: S.text3, marginTop: 2 }}>Each preset ships its own personality. Accent isn&apos;t forced across themes.</div>

        {/* 5 theme cards + custom */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 11 }}>
          {(Object.entries(COLOR_THEMES) as [ColorThemeKey, ColorTheme][]).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setColorTheme(key)}
              style={{
                background: colorTheme === key ? (key === "light" ? "#fff8f0" : "#1d2422") : S.surface1,
                border: `1px solid ${colorTheme === key ? accentHex : S.border}`,
                borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left",
                transition: "border-color 180ms",
              }}
            >
              <div style={{ display: "flex", gap: 3, marginBottom: 7 }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: t.bg, border: `1px solid ${t.border}`, display: "inline-block" }} />
                <span style={{ width: 13, height: 13, borderRadius: 4, background: t.surface, display: "inline-block" }} />
                <span style={{ width: 13, height: 13, borderRadius: 4, background: t.accent, display: "inline-block" }} />
              </div>
              <div style={{ fontSize: 11.5, color: S.text1 }}>{t.label}</div>
              <div style={{ fontSize: 10, color: colorTheme === key ? accentHex : S.text3 }}>
                {t.accentLabel}{colorTheme === key ? " · active" : ""}
              </div>
            </button>
          ))}
          <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: S.surface1, border: `1px dashed ${S.borderStr}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", color: S.text3, fontSize: 11.5, fontFamily: "Inter, sans-serif" }}>
            <Plus size={13} /> Custom
          </button>
        </div>

        {/* Accent swatches */}
        <div style={{ fontSize: 11.5, color: S.text2, margin: "13px 0 7px" }}>Accent color</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {ACCENT_COLORS.map((a, i) => (
            <button
              key={a.key}
              onClick={() => setAccentIdx(i)}
              style={{
                width: 20, height: 20, borderRadius: 4, background: a.hex, border: "none", cursor: "pointer",
                outline: accentIdx === i ? `2px solid ${a.hex}` : "none", outlineOffset: 2,
              }}
            />
          ))}
          <button style={{ width: 20, height: 20, borderRadius: 4, border: `1px dashed ${S.borderStr}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: S.text3 }}>
            <Plus size={10} />
          </button>
        </div>

        {/* Segmented controls */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 13 }}>
          {[
            { label: "Density", opts: ["Compact","Standard","Comfort"], val: density, set: setDensity },
            { label: "Radius",  opts: ["Sharp","Modern","Soft"],         val: radius,  set: setRadius  },
            { label: "Shadow",  opts: ["Flat","Subtle","Elevated"],      val: shadow,  set: setShadow  },
            { label: "Motion",  opts: ["Off","Fast","Premium"],           val: motion,  set: setMotion  },
          ].map(c => (
            <div key={c.label}>
              <div style={{ fontSize: 10.5, color: S.text3, marginBottom: 4 }}>{c.label}</div>
              <Segmented options={c.opts} value={c.val} onChange={c.set} />
            </div>
          ))}
        </div>

        <LivePreview colorTheme={colorTheme} accentHex={accentHex} />
      </>
    ),
    accent: <PlaceholderPanel title="Accent" desc="Fine-tune the active accent across your theme." />,
    typography: <PlaceholderPanel title="Typography" desc="Choose your UI font family." />,
    codefont: <PlaceholderPanel title="Code font" desc="Select the monospace font for code blocks." />,
    density: <PlaceholderPanel title="Density" desc="Control spacing and control sizes." />,
    radius: <PlaceholderPanel title="Radius" desc="Corner rounding for cards and controls." />,
    shadows: <PlaceholderPanel title="Shadows" desc="Depth style — flat, subtle, or elevated." />,
    motion: <PlaceholderPanel title="Motion" desc="Animation speed and easing." />,
    icons: <PlaceholderPanel title="Icons" desc="Switch between icon libraries." />,
    components: <PlaceholderPanel title="Components" desc="Button, input, table, and badge style variants." />,
    layout: <PlaceholderPanel title="Layout" desc="Panel layout structure presets." />,
    charts: <PlaceholderPanel title="Charts" desc="Data visualization color themes." />,
    editor: <PlaceholderPanel title="Code editor" desc="Syntax highlight theme for code blocks." />,
    a11y: <PlaceholderPanel title="Accessibility" desc="High contrast, large text, and reduced motion modes." />,
    advanced: <PlaceholderPanel title="Advanced editor" desc="Edit raw design tokens directly." />,
  };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Left nav */}
      <div style={{ width: 152, flexShrink: 0, padding: 8, borderRight: `1px solid ${S.border}`, background: "#18191C", overflowY: "auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.06em", color: S.text4, padding: "3px 9px 5px" }}>CUSTOMIZE</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 6,
              fontSize: 12.5, width: "100%", border: "none", cursor: "pointer", textAlign: "left",
              background: activeNav === item.id ? S.surface2 : "transparent",
              color: activeNav === item.id ? S.text1 : S.text2,
              fontFamily: "Inter, sans-serif",
            }}
          >
            <span style={{ color: activeNav === item.id ? S.accent : S.text3, display: "flex" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div style={{ height: 1, background: S.border, margin: "6px 4px" }} />
        <button
          onClick={() => setActiveNav("advanced")}
          style={{
            display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 6,
            fontSize: 12.5, width: "100%", border: "none", cursor: "pointer", textAlign: "left",
            background: activeNav === "advanced" ? S.surface2 : "transparent",
            color: activeNav === "advanced" ? S.text1 : S.text2,
            fontFamily: "Inter, sans-serif",
          }}
        >
          <span style={{ color: activeNav === "advanced" ? S.accent : S.text3, display: "flex" }}><SlidersHorizontal size={15} /></span>
          Advanced editor
        </button>
      </div>

      {/* Panel */}
      <div style={{ flex: 1, minWidth: 0, padding: "14px 15px", overflowY: "auto" }}>
        {panelContent[activeNav] || panelContent.color}
      </div>
    </div>
  );
}

function PlaceholderPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, color: S.text1 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: S.text3, marginTop: 2 }}>{desc}</div>
      <div style={{ marginTop: 20, padding: "32px 0", textAlign: "center", border: `1px dashed ${S.border}`, borderRadius: 8, color: S.text4, fontSize: 12 }}>
        Panel coming soon
      </div>
    </div>
  );
}

// ─── Theme Builder tab ────────────────────────────────────────────────────────

interface TokenRow { name: string; value: string; group: string; active?: boolean }

const DEFAULT_TOKENS: TokenRow[] = [
  { group: "SURFACES",        name: "surface-primary",   value: "#1A1C1F" },
  { group: "SURFACES",        name: "surface-secondary",  value: "#202327" },
  { group: "SURFACES",        name: "surface-elevated",   value: "#25282D" },
  { group: "BORDERS & TEXT",  name: "border-default",    value: "#2E3237" },
  { group: "BORDERS & TEXT",  name: "text-primary",      value: "#E7EAEE" },
  { group: "BORDERS & TEXT",  name: "text-secondary",    value: "#9BA3AE" },
  { group: "BORDERS & TEXT",  name: "accent-primary",    value: "#2DD4BF", active: true },
];

function ThemeBuilderTab() {
  const [tokens, setTokens] = useState<TokenRow[]>(DEFAULT_TOKENS);
  const [themeName] = useState("Midnight Teal");
  const [radius, setRadius] = useState(8);
  const [spacing, setSpacing] = useState(4);
  const [copied, setCopied] = useState(false);

  const updateToken = (name: string, value: string) => {
    setTokens(prev => prev.map(t => t.name === name ? { ...t, value } : t));
  };

  const jsonStr = JSON.stringify({
    name: themeName,
    extends: "mid-dark",
    tokens: {
      "accent-primary": tokens.find(t => t.name === "accent-primary")?.value ?? "#2DD4BF",
      "radius-base": radius,
      "space-unit": spacing,
    },
    typography: "inter",
    codeFont: "jetbrains",
    editor: "tokyo-night",
  }, null, 2);

  const groupedTokens = tokens.reduce<Record<string, TokenRow[]>>((acc, t) => {
    if (!acc[t.group]) acc[t.group] = [];
    acc[t.group].push(t);
    return acc;
  }, {});

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Builder header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: S.surface1, borderBottom: `1px solid ${S.border}` }}>
        <Settings2 size={15} style={{ color: S.accent }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: S.text1 }}>Theme builder</span>
        <span style={{ fontSize: 11, color: S.text3 }}>· {themeName} (draft)</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, fontSize: 11 }}>
          {["Duplicate","Reset"].map(lbl => (
            <button key={lbl} style={{ padding: "4px 9px", border: `1px solid ${S.border}`, borderRadius: 6, background: "transparent", color: S.text2, cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 11 }}>{lbl}</button>
          ))}
          <button style={{ padding: "4px 9px", borderRadius: 6, border: "none", background: S.accent, color: S.accentFg, fontWeight: 500, cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 11 }}>Save theme</button>
        </span>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left: token rows */}
        <div style={{ flex: 1, minWidth: 0, padding: "12px 13px", borderRight: `1px solid ${S.border}`, overflowY: "auto" }}>
          {Object.entries(groupedTokens).map(([group, rows]) => (
            <div key={group}>
              <div style={{ fontSize: 10, letterSpacing: "0.06em", color: S.text4, marginBottom: 7, marginTop: group !== "SURFACES" ? 11 : 0 }}>{group}</div>
              {rows.map(token => (
                <div
                  key={token.name}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "6px 8px",
                    border: `1px solid ${token.active ? S.accent : S.border}`,
                    borderRadius: 7, background: S.surface1, marginBottom: 6,
                  }}
                >
                  <input
                    type="color"
                    value={token.value}
                    onChange={e => updateToken(token.name, e.target.value)}
                    style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid #3a3f46`, padding: 0, cursor: "pointer", flexShrink: 0, background: "transparent" }}
                  />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: token.active ? S.text1 : "#C7CDD4", flex: 1, minWidth: 0 }}>{token.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: token.active ? S.accent : S.text3 }}>{token.value.toUpperCase()}</span>
                </div>
              ))}
            </div>
          ))}

          {/* Radius + spacing sliders */}
          <div style={{ display: "flex", gap: 18, marginTop: 13 }}>
            {[
              { label: "Radius", unit: "px", val: radius, min: 0, max: 24, set: setRadius },
              { label: "Spacing unit", unit: "px", val: spacing, min: 2, max: 8, set: setSpacing },
            ].map(sl => (
              <div key={sl.label} style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: S.text2, marginBottom: 5 }}>
                  <span>{sl.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: S.text3 }}>{sl.val}px</span>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type="range" min={sl.min} max={sl.max} value={sl.val}
                    onChange={e => sl.set(Number(e.target.value))}
                    style={{ width: "100%", accentColor: S.accent, cursor: "pointer" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: JSON view */}
        <div style={{ width: "40%", flexShrink: 0, padding: "12px 13px", background: S.inset, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <FileCode size={13} style={{ color: S.text3 }} />
            <span style={{ fontSize: 11, color: S.text2 }}>theme.json</span>
            <button onClick={handleCopy} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: copied ? S.accent : S.text3, display: "flex" }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, lineHeight: 1.75 }}>
            <SyntaxJson json={jsonStr} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
            {[
              { icon: <Upload size={12} />, label: "Export" },
              { icon: <Share2 size={12} />, label: "Share" },
            ].map(b => (
              <button key={b.label} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 10.5, padding: "6px 0", border: `1px solid ${S.border}`, borderRadius: 6, background: "transparent", color: S.text2, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
                {b.icon} {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SyntaxJson({ json }: { json: string }) {
  const lines = json.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        const keyMatch = line.match(/^(\s*)("[\w-]+")\s*:/);
        const strMatch = line.match(/:\s*(".*?")/);
        const numMatch = line.match(/:\s*(\d+)/);
        const punctOnly = !keyMatch;

        return (
          <div key={i}>
            {keyMatch ? (
              <span>
                <span style={{ color: "#565F89" }}>{line.slice(0, keyMatch.index! + keyMatch[1].length)}</span>
                <span style={{ color: strMatch ? "#7AA2F7" : "#73DACA" }}>{keyMatch[2]}</span>
                <span style={{ color: "#565F89" }}>: </span>
                {strMatch && <span style={{ color: "#9ECE6A" }}>{strMatch[1]}</span>}
                {numMatch && <span style={{ color: "#FF9E64" }}>{numMatch[1]}</span>}
                <span style={{ color: "#565F89" }}>{line.slice(line.lastIndexOf(strMatch?.[1] ?? (numMatch?.[1] ?? keyMatch[2])) + (strMatch?.[1] ?? numMatch?.[1] ?? "").length)}</span>
              </span>
            ) : (
              <span style={{ color: "#565F89" }}>{line}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Marketplace tab ──────────────────────────────────────────────────────────

function MarketplaceTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Popular");
  const [installed, setInstalled] = useState<Set<string>>(new Set(["catppuccin"]));

  const filtered = MARKETPLACE_THEMES.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.author.toLowerCase().includes(search.toLowerCase())
  );

  const filterOpts = ["Popular","Newest","Dark","Light"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Marketplace header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", background: S.surface1, borderBottom: `1px solid ${S.border}` }}>
        <ShoppingBag size={15} style={{ color: S.accent }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: S.text1 }}>Marketplace</span>
        {/* Search */}
        <div style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 6, flex: 1, maxWidth: 230, background: S.inset, border: `1px solid ${S.border}`, borderRadius: 7, padding: "5px 9px" }}>
          <Search size={13} style={{ color: S.text4, flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search themes"
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 11, color: search ? S.text1 : S.text4, width: "100%", fontFamily: "Inter, sans-serif" }}
          />
        </div>
        {/* Filters */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 5, fontSize: 10.5 }}>
          {filterOpts.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ padding: "4px 9px", borderRadius: 6, border: "none", cursor: "pointer", background: filter === f ? S.surface3 : "transparent", color: filter === f ? S.text1 : S.text2, fontFamily: "Inter, sans-serif", fontSize: 10.5 }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: 13 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(176px, 1fr))", gap: 11 }}>
          {filtered.map(theme => {
            const isInstalled = installed.has(theme.id);
            return (
              <div key={theme.id} style={{ border: `1px solid ${S.border}`, borderRadius: 9, overflow: "hidden", background: S.surface1, transition: "border-color 180ms" }}>
                {/* Palette strip */}
                <div style={{ display: "flex", height: 46 }}>
                  {theme.pal.map((c, i) => (
                    <div key={i} style={{ flex: 1, background: c }} />
                  ))}
                </div>
                {/* Card footer */}
                <div style={{ padding: "9px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: S.text1 }}>{theme.name}</span>
                    <span style={{ fontSize: 9.5, color: S.text2, background: S.surface3, borderRadius: 4, padding: "2px 6px" }}>{theme.tag}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: S.text3, margin: "3px 0 8px" }}>
                    by {theme.author} · <Download size={11} style={{ display: "inline", verticalAlign: "middle" }} /> {theme.installs}
                  </div>
                  <button
                    onClick={() => setInstalled(prev => { const n = new Set(prev); isInstalled ? n.delete(theme.id) : n.add(theme.id); return n; })}
                    style={{
                      display: "block", width: "100%", textAlign: "center", fontSize: 11, fontWeight: 500,
                      padding: "5px 0", borderRadius: 6, cursor: "pointer", fontFamily: "Inter, sans-serif",
                      border: isInstalled ? `1px solid ${S.border}` : "none",
                      background: isInstalled ? "transparent" : S.accent,
                      color: isInstalled ? S.text2 : S.accentFg,
                      transition: "all 180ms",
                    }}
                  >
                    {isInstalled ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Check size={12} /> Installed
                      </span>
                    ) : "Install"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: S.text4, fontSize: 12 }}>No themes match &quot;{search}&quot;</div>
        )}
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("appearance");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0E0F11",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* App window frame */}
      <div
        style={{
          background: S.bg,
          border: `1px solid ${S.border}`,
          borderRadius: 10,
          overflow: "hidden",
          color: S.text1,
          width: "100%",
          maxWidth: 1100,
          minHeight: 640,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }}
      >
        <TitleBar activeTab={activeTab} onTab={setActiveTab} />

        {/* Tab content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "builder" && <ThemeBuilderTab />}
          {activeTab === "marketplace" && <MarketplaceTab />}
        </div>
      </div>
    </div>
  );
}
