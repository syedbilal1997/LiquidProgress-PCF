import { IInputs, IOutputs } from "./generated/ManifestTypes";

type SizeMode = "compact" | "medium" | "hero";
type ConfiguredSize = "auto" | SizeMode;

interface StatusDisplay {
  text: string;
  color?: string;
}

interface OptionMetadata {
  Value: number;
  Label: string;
  Color?: string;
}

/**
 * LiquidProgress
 * Animated liquid-filled sphere bound to a Decimal column (0..1).
 * Renders Compact / Medium / Hero based on the maker's choice (or Auto).
 */
export class LiquidProgress
  implements ComponentFramework.StandardControl<IInputs, IOutputs> {

  // --- state ---
  private _container!: HTMLDivElement;
  private _root!: HTMLDivElement;
  private _resizeObs?: ResizeObserver;
  private _lastRenderedMode: SizeMode | null = null;
  private _lastValueKey = "";

  // ---------------------------------------------------------------------
  // PCF lifecycle
  // ---------------------------------------------------------------------

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this._container = container;
    this._root = document.createElement("div");
    this._root.className = "lp-root";
    this._container.appendChild(this._root);

    // Re-render on container resize so Auto mode reacts to layout changes.
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObs = new ResizeObserver(() => this.render(context));
      this._resizeObs.observe(this._container);
    }
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.render(context);
  }

  public getOutputs(): IOutputs {
    // Read-only field control; we don't write back.
    return {};
  }

  public destroy(): void {
    if (this._resizeObs) {
      this._resizeObs.disconnect();
      this._resizeObs = undefined;
    }
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  private render(context: ComponentFramework.Context<IInputs>): void {
    const p = context.parameters;

    const rawValue = p.value.raw;
    const value = clamp01(rawValue);
    const label = (p.label?.raw ?? "").trim();
    const accent = (p.accentColor?.raw ?? "").trim();
    const statusText = (p.statusText?.raw ?? "").trim();

    const configured = (p.displaySize?.raw as ConfiguredSize) || "medium";
    const mode = this.resolveSize(configured, context);

    // Resolve the three meta items.
    const dueDate = this.resolveDueDate(p);
    const owner = this.resolveOwner(p);
    const statusDisplay = this.resolveStatus(p, statusText);

    // Skip DOM rewrite if nothing meaningful changed.
    const valueKey = [
      mode, value ?? "x", label, accent,
      dueDate ?? "",
      owner ? owner.name : "",
      statusDisplay ? statusDisplay.text + "|" + (statusDisplay.color ?? "") : ""
    ].join("|");
    if (this._lastRenderedMode === mode && this._lastValueKey === valueKey) {
      return;
    }
    this._lastRenderedMode = mode;
    this._lastValueKey = valueKey;

    // Apply accent colour as CSS variables on the root.
    if (accent && isHex(accent)) {
      this._root.style.setProperty("--lp-accent", accent);
      this._root.style.setProperty("--lp-accent-light", lighten(accent, 0.25));
    } else {
      this._root.style.removeProperty("--lp-accent");
      this._root.style.removeProperty("--lp-accent-light");
    }

    // Build new DOM for the chosen mode.
    const next = this.buildMode(mode, {
      value: value ?? 0,
      label,
      dueDate,
      owner,
      statusDisplay,
    });
    this._root.innerHTML = "";
    this._root.appendChild(next);
  }

  /**
   * Formats a bound Date column as friendly text:
   *  - "Due today"
   *  - "in 1 day" / "in 23 days" / "in 6 weeks"
   *  - "Overdue by 5 days" / "Overdue by 3 weeks"
   *  - "Due 30 Sep" for anything far out
   * Returns null when no date is bound.
   */
  private resolveDueDate(p: IInputs): string | null {
    const dueParam = (p as unknown as {
      dueDate?: { raw?: Date | null };
    }).dueDate;
    const raw = dueParam?.raw;
    if (!raw) return null;
    return formatDueDate(raw);
  }

  /**
   * Reads the bound Lookup column's first selected record and returns a
   * display name + 1-2 letter initials.
   */
  private resolveOwner(p: IInputs): { name: string; initials: string } | null {
    const ownerParam = (p as unknown as {
      owner?: { raw?: ({ id?: string; name?: string })[] | null };
    }).owner;
    const raw = ownerParam?.raw;
    if (!raw || !raw.length) return null;
    const name = (raw[0]?.name ?? "").trim();
    if (!name) return null;
    return { name, initials: getInitials(name) };
  }

  /**
   * Reads the OptionSet metadata exposed by the framework for the bound
   * Choice (or Choices) column. Returns the matching option(s) as a single
   * display with label(s) + colour. Falls back to plain statusText.
   */
  private resolveStatus(
    p: IInputs,
    statusText: string
  ): StatusDisplay | null {
    // The PCF framework exposes attributes.Options for both OptionSet
    // and MultiSelectOptionSet bindings. The generated type doesn't model
    // `attributes`, so we read it loosely.
    const choiceParam = (p as unknown as {
      statusChoice?: {
        raw?: number | number[] | null;
        attributes?: { Options?: OptionMetadata[] };
      };
    }).statusChoice;

    const raw = choiceParam?.raw;
    const options = choiceParam?.attributes?.Options;

    if (options && options.length) {
      // Multi-select (Choices) — raw is number[]
      if (Array.isArray(raw) && raw.length) {
        const matches = raw
          .map(v => options.find(o => o.Value === v))
          .filter((o): o is OptionMetadata => Boolean(o));
        if (matches.length) {
          return {
            text: matches.map(m => m.Label).join(", "),
            color: matches[0].Color
          };
        }
      }
      // Single Choice — raw is number
      else if (typeof raw === "number") {
        const opt = options.find(o => o.Value === raw);
        if (opt) {
          return { text: opt.Label, color: opt.Color };
        }
      }
    }

    return statusText ? { text: statusText } : null;
  }

  // ---------------------------------------------------------------------
  // Mode resolution
  // ---------------------------------------------------------------------

  private resolveSize(
    configured: ConfiguredSize,
    context: ComponentFramework.Context<IInputs>
  ): SizeMode {
    if (configured === "compact" || configured === "medium" || configured === "hero") {
      return configured;
    }
    // Auto: pick from allocated width.
    let w = context.mode.allocatedWidth || this._container.clientWidth || 0;
    if (w <= 0) w = this._container.getBoundingClientRect().width || 0;
    if (w < 200) return "compact";
    if (w < 360) return "medium";
    return "hero";
  }

  // ---------------------------------------------------------------------
  // DOM builders
  // ---------------------------------------------------------------------

  private buildMode(
    mode: SizeMode,
    s: ModeState
  ): HTMLElement {
    switch (mode) {
      case "compact": return this.buildCompact(s);
      case "medium":  return this.buildMedium(s);
      case "hero":    return this.buildHero(s);
    }
  }

  private buildCompact(s: ModeState): HTMLElement {
    const wrap = el("div", "lp-compact");
    wrap.appendChild(this.buildSphere(s.value, /*hideSubLabel*/ true));
    wrap.appendChild(el("span", "lp-num", pctText(s.value)));
    // In compact, show due date if bound — most useful single piece of context.
    if (s.dueDate) {
      wrap.appendChild(el("span", "lp-due", s.dueDate));
    }
    return wrap;
  }

  private buildMedium(s: ModeState): HTMLElement {
    const wrap = el("div", "lp-medium");
    wrap.appendChild(this.buildSphere(s.value, false, s.label || "PROGRESS"));

    const meta = el("div", "lp-meta");
    meta.appendChild(el("div", "lp-meta-h", s.label || "Progress"));

    if (s.dueDate) {
      meta.appendChild(this.metaRow("Due", s.dueDate));
    }
    if (s.owner) {
      meta.appendChild(this.ownerRow(s.owner));
    }
    if (s.statusDisplay) {
      meta.appendChild(this.metaRow("Status", s.statusDisplay.text, {
        color: s.statusDisplay.color
      }));
    }
    // If absolutely nothing else is set, at least show the value as a row
    // so the meta column isn't empty.
    if (!s.dueDate && !s.owner && !s.statusDisplay) {
      meta.appendChild(this.metaRow("Value", pctText(s.value)));
    }

    wrap.appendChild(meta);
    return wrap;
  }

  private buildHero(s: ModeState): HTMLElement {
    const wrap = el("div", "lp-hero");
    if (s.label) wrap.appendChild(el("div", "lp-title", s.label));
    wrap.appendChild(this.buildSphere(s.value, false, s.label || ""));

    if (s.dueDate || s.owner || s.statusDisplay) {
      const strip = el("div", "lp-meta-strip");
      if (s.dueDate) {
        strip.appendChild(this.heroCell("Due", s.dueDate));
      }
      if (s.owner) {
        strip.appendChild(this.ownerHeroCell(s.owner));
      }
      if (s.statusDisplay) {
        strip.appendChild(this.heroCell("Status", s.statusDisplay.text, {
          color: s.statusDisplay.color
        }));
      }
      wrap.appendChild(strip);
    }
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Sphere
  // ---------------------------------------------------------------------

  /** Renders the animated liquid sphere with the % label inside. */
  private buildSphere(value: number, hideSubLabel: boolean, subLabel = ""): HTMLElement {
    const isEmpty = value <= 0.001;
    const sphere = el("div", "lp-sphere" + (isEmpty ? " is-empty" : ""));

    // Wave top position: 0 → fully below sphere; 1 → fully above sphere top.
    // We translate the wave vertically using CSS `top`.
    // Value 0   -> top = 100% (waves entirely below view)
    // Value 1   -> top = -10% (waves above top so the sphere looks full)
    const waveTopPct = (1 - value) * 100 - 10; // -10..100 ish
    const topStyle = `top: ${waveTopPct.toFixed(2)}%`;

    const w1 = el("div", "lp-wave");
    w1.setAttribute("style", topStyle);
    const w2 = el("div", "lp-wave lp-wave--b");
    w2.setAttribute("style", topStyle);

    const labelEl = el("div", "lp-label");
    labelEl.appendChild(el("div", "lp-pct", pctText(value)));
    if (!hideSubLabel && subLabel) {
      labelEl.appendChild(el("div", "lp-sub", subLabel.toUpperCase()));
    }

    sphere.appendChild(w1);
    sphere.appendChild(w2);
    sphere.appendChild(labelEl);
    return sphere;
  }

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  /** Owner row for Medium mode: "Owner" label on the left, avatar + name on the right. */
  private ownerRow(owner: { name: string; initials: string }): HTMLElement {
    const row = el("div", "lp-meta-row");
    row.innerHTML =
      `<span>Owner</span>` +
      `<span class="lp-owner">` +
      `<span class="lp-avatar">${escapeHtml(owner.initials)}</span>` +
      `<b>${escapeHtml(owner.name)}</b>` +
      `</span>`;
    return row;
  }

  /** Owner cell for Hero mode: stacked label/value with avatar inline. */
  private ownerHeroCell(owner: { name: string; initials: string }): HTMLElement {
    const cell = el("div");
    cell.innerHTML =
      `<div class="k">Owner</div>` +
      `<div class="v lp-owner">` +
      `<span class="lp-avatar">${escapeHtml(owner.initials)}</span>` +
      `<span>${escapeHtml(owner.name)}</span>` +
      `</div>`;
    return cell;
  }

  private metaRow(
    k: string,
    v: string,
    opts: { cls?: string; color?: string } = {}
  ): HTMLElement {
    const row = el("div", "lp-meta-row");
    const cls = opts.cls ? ` class="${escapeHtml(opts.cls)}"` : "";
    const style = opts.color ? ` style="color:${escapeHtml(opts.color)}"` : "";
    row.innerHTML = `<span>${escapeHtml(k)}</span><b${cls}${style}>${escapeHtml(v)}</b>`;
    return row;
  }

  private heroCell(
    k: string,
    v: string,
    opts: { cls?: string; color?: string } = {}
  ): HTMLElement {
    const cell = el("div");
    const cls = opts.cls ? ` ${escapeHtml(opts.cls)}` : "";
    const style = opts.color ? ` style="color:${escapeHtml(opts.color)}"` : "";
    cell.innerHTML = `<div class="k">${escapeHtml(k)}</div>` +
      `<div class="v${cls}"${style}>${escapeHtml(v)}</div>`;
    return cell;
  }
}

/** Shared state passed to each size builder. */
interface ModeState {
  value: number;
  label: string;
  dueDate: string | null;
  owner: { name: string; initials: string } | null;
  statusDisplay: StatusDisplay | null;
}

// =====================================================================
// Pure helpers (kept outside the class — easier to test, no `this`)
// =====================================================================

function el(tag: string, cls = "", text = ""): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function clamp01(n: number | null | undefined): number | null {
  if (n === null || n === undefined || isNaN(n as number)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function pctText(v: number): string {
  return Math.round(v * 100) + "%";
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Formats a date as actual date + relative text in parens, e.g.:
 *   "30 Sep (today)"
 *   "30 Sep (in 23 days)"
 *   "30 Sep (in 6 weeks)"
 *   "30 Sep (5 days overdue)"
 *   "30 Sep 2027 (in 14 months)"  — year shown when different from current
 */
function formatDueDate(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayMs = 1000 * 60 * 60 * 24;
  const days = Math.round((due.getTime() - today.getTime()) / dayMs);

  // Absolute date — include the year only when it differs from today's.
  let dateStr = `${due.getDate()} ${MONTH_SHORT[due.getMonth()]}`;
  if (due.getFullYear() !== today.getFullYear()) {
    dateStr += ` ${due.getFullYear()}`;
  }

  // Relative phrase
  let rel: string;
  if (days === 0) rel = "today";
  else if (days === 1) rel = "in 1 day";
  else if (days === -1) rel = "1 day overdue";
  else if (days > 1 && days <= 13) rel = `in ${days} days`;
  else if (days < -1 && days >= -13) rel = `${-days} days overdue`;
  else if (days >= 14 && days <= 60) rel = `in ${Math.round(days / 7)} weeks`;
  else if (days <= -14 && days >= -60) rel = `${Math.round(-days / 7)} weeks overdue`;
  else if (days > 60) rel = `in ${Math.round(days / 30)} months`;
  else rel = `${Math.round(-days / 30)} months overdue`;

  return `${dateStr} (${rel})`;
}

/** Up to two initials from a full name (e.g. "Sara Noor" -> "SN"). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

function isHex(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

/** Lighten a hex colour by mixing it with white. amount is 0..1. */
function lighten(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
