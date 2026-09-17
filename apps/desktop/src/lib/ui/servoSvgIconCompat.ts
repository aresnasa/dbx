/**
 * Servo 内联引擎 SVG 图标颜色兼容层。
 *
 * Servo 0.5 把内联 `<svg>` 当作 replaced element：DOM 子树被**原样序列化**
 * 成一段独立 SVG 文本交给 usvg/resvg 光栅化（见 servo-script 的
 * `SVGSVGElement::serialize_and_cache_subtree`），整个 HTML 层 CSS 级联对
 * 光栅化路径完全不可见。lucide 图标默认 `stroke="currentColor"`，脱离
 * CSS 上下文后 usvg 在子树里找不到 `color`，按 SVG 规范退化为纯黑 ——
 * 深色主题下全部图标一律变黑、几乎不可见（文本走的是 HTML 染色路径，
 * 所以看起来正常）。
 *
 * 兼容做法：把每个 `<svg>` 的 CSS 计算色镜像为颜色**属性**
 * （`svg.setAttribute("color", …)`）。属性随子树一起被序列化，usvg 的
 * currentColor 解析（`find_attribute(AId::Color)`）会沿属性链继承到每个
 * 子节点。普通浏览器里 color 是表现属性（presentation attribute），
 * 优先级低于任何 CSS 规则，不改变既有渲染。
 *
 * usvg/svgtypes 只认 RGB 语法（rgb()/rgba()/hex/命名色），不懂
 * CSS Color 4 的 oklch()/oklab()，所以镜像前把计算色换算回 sRGB 字符串。
 * 换算不出的颜色直接跳过（保持现状，不产生新的错色）。
 */

const SERVO_USER_AGENT_HINT = "Servo/";
const COLOR_ATTR = "color";

/** Whether the SVG color mirror is needed (inline-Servo rasterizes SVG standalone). */
export function isServoEngine(userAgent: string = navigator.userAgent): boolean {
  return userAgent.includes(SERVO_USER_AGENT_HINT);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function linearToSrgbChannel(c: number): number {
  return c >= 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
}

function srgbChannelByte(c: number): number {
  return Math.round(clamp01(linearToSrgbChannel(c)) * 255);
}

/**
 * OKLab → sRGB byte triplet (Björn Ottosson 的标准矩阵，CSS Color 4 规范
 * 换算路径同样经由 OKLab/XYZ-D65，数值等价)。
 */
function oklabToSrgb(l: number, a: number, b: number): [number, number, number] {
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return [srgbChannelByte(r), srgbChannelByte(g), srgbChannelByte(bl)];
}

/**
 * 解析一个分量：`none` → 0；`88%` → 0.88 × max；纯数字 → 原值。
 * `max` 用于把百分比'量纲化（L 的 max=1，Chroma 的 max=0.4 覆盖 css 规范
 * 的 reference range）。
 */
function parseComponent(raw: string, max: number, angle = false): number | null {
  const s = raw.trim().toLowerCase();
  if (!s || s === "none") return 0;
  if (s.endsWith("%")) {
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : angle ? (n / 100) * 360 : (n / 100) * max;
  }
  if (s.endsWith("deg")) {
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** 规范种 `<alpha>`：` / 0.5` / ` / 50%`。没有 → 1。 */
function parseAlpha(raw: string | undefined): number {
  if (!raw) return 1;
  const v = parseComponent(raw, 1);
  return v === null ? 1 : clamp01(v);
}

function serializeRgb(r: number, g: number, b: number, alpha: number): string {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 把浏览器计算色（可能是 rgb()/rgba()/oklch()/oklab()/hex）换算成 usvg
 * 能解析的 sRGB 字符串。解析不出来的返回 null（调用方跳过，不镜像）。
 * RGB/hex/命名色原样返回 —— 它们本来 usvg 就能解析。
 */
export function toUsvgColor(computedColor: string): string | null {
  const color = computedColor.trim();

  // rgb()/rgba()/hex/命名色：usvg 原生支持，直接透传。
  if (/^(rgba?\(|#)/i.test(color)) return color;

  // oklch(L C H / A)
  let m = /^oklch\(([\s\S]+)\)$/i.exec(color);
  if (m) {
    const [main, alpha] = m[1].split("/");
    const parts = main.trim().split(/\s+/);
    if (parts.length >= 3) {
      const l = parseComponent(parts[0], 1);
      const c = parseComponent(parts[1], 0.4);
      const hDeg = parseComponent(parts[2], 360, true);
      if (l !== null && c !== null && hDeg !== null) {
        const hRad = (hDeg * Math.PI) / 180;
        const [r, g, b] = oklabToSrgb(clamp01(l), clamp01(c / 0.4) * 0.4 * Math.cos(hRad), clamp01(c / 0.4) * 0.4 * Math.sin(hRad));
        return serializeRgb(r, g, b, parseAlpha(alpha));
      }
    }
    return null;
  }

  // oklab(L a b / A)
  m = /^oklab\(([\s\S]+)\)$/i.exec(color);
  if (m) {
    const [main, alpha] = m[1].split("/");
    const parts = main.trim().split(/\s+/);
    if (parts.length >= 3) {
      const l = parseComponent(parts[0], 1);
      const a = parseComponent(parts[1], 0.4);
      const b = parseComponent(parts[2], 0.4);
      if (l !== null && a !== null && b !== null) {
        const [r, g, bb] = oklabToSrgb(clamp01(l), a, b);
        return serializeRgb(r, g, bb, parseAlpha(alpha));
      }
    }
    return null;
  }

  // lab()/lch()/color() 等其余 CSS Color 4 形式：本项目未使用，
  // 解析不了就返回 null（保持 Servo 现状，不做错误换算）。
  return null;
}

/** 把单个 svg 元素的 CSS 计算色镜像到 color 属性（供 usvg 解析 currentColor）。 */
function stampSvg(svg: SVGSVGElement): void {
  // 只处理依赖 currentColor 的 svg（lucide 等）；已显式染色的无需介入。
  if (!/currentColor/i.test(svg.outerHTML.slice(0, 4096))) return;
  const computed = getComputedStyle(svg).color;
  const mirrored = toUsvgColor(computed);
  if (mirrored && svg.getAttribute(COLOR_ATTR) !== mirrored) {
    svg.setAttribute(COLOR_ATTR, mirrored);
  }
}

function stampRoot(root: Element | Document): void {
  const svgs = root.querySelectorAll<SVGSVGElement>("svg");
  svgs.forEach(stampSvg);
}

let installed = false;

/**
 * 安装镜像逻辑：启动时全量打标 + MutationObserver 给后挂载的 svg 打标 +
 * 监听根元素 class 变化（`dark` 主题翻转）时全量重打。
 *
 * 返回卸载函数（测试中用于清理）；非 Servo 引擎返回 undefined（无需介入）。
 */
export function installServoSvgIconColorCompat(): (() => void) | undefined {
  if (installed || !isServoEngine()) return undefined;
  installed = true;

  stampRoot(document);

  const domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof SVGSVGElement) stampSvg(node);
        stampRoot(node);
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  const themeObserver = new MutationObserver(() => stampRoot(document));
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });

  return () => {
    domObserver.disconnect();
    themeObserver.disconnect();
    installed = false;
  };
}
