import { previewSvgLines } from "../model/wall-trace.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ID = "floorer-wall-preview";
const COLOR = "#ff6400";
const STROKE = 4;
const DOT = 3;
const Z_INDEX = 20;

function svgElement(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function dot(x, y) {
  return svgElement("line", { x1: x, y1: y, x2: x, y2: y, stroke: COLOR, "stroke-width": DOT * 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" });
}

function viewTransform() {
  const rect = canvas.app.view.getBoundingClientRect();
  const screen = canvas.app.renderer.screen;
  return `translate(${rect.left} ${rect.top}) scale(${rect.width / screen.width} ${rect.height / screen.height})`;
}

function stageTransform() {
  const m = canvas.stage.worldTransform;
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;
}

export class WallPreview {
  #svg = null;
  #outer = null;
  #inner = null;
  #hooks = [];
  #onResize = () => this.sync();

  show() {
    if (this.#svg) return;
    this.#svg = svgElement("svg", { id: ID });
    Object.assign(this.#svg.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: String(Z_INDEX) });
    this.#outer = this.#svg.appendChild(svgElement("g", {}));
    this.#inner = this.#outer.appendChild(svgElement("g", {}));
    document.body.appendChild(this.#svg);
    this.#hooks = [["canvasPan", Hooks.on("canvasPan", () => this.sync())]];
    window.addEventListener("resize", this.#onResize);
    this.sync();
  }

  sync() {
    if (!this.#svg || !canvas.ready) return;
    this.#outer.setAttribute("transform", viewTransform());
    this.#inner.setAttribute("transform", stageTransform());
  }

  draw(segments) {
    if (!this.#svg) return;
    this.#inner.replaceChildren();
    for (const { x1, y1, x2, y2 } of previewSvgLines(segments)) {
      this.#inner.appendChild(svgElement("line", { x1, y1, x2, y2, stroke: COLOR, "stroke-width": STROKE, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }));
      this.#inner.appendChild(dot(x1, y1));
      this.#inner.appendChild(dot(x2, y2));
    }
    this.sync();
  }

  hide() {
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
    window.removeEventListener("resize", this.#onResize);
    this.#svg?.remove();
    this.#svg = this.#outer = this.#inner = null;
  }
}
