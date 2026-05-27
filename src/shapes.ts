/*
 * Single source of truth for node-shape geometry. Both the editor canvas and
 * the shape-palette icons build their SVG from these functions, so a shape
 * always looks the same wherever it is drawn.
 */

import { NodeShape } from "./model";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
	name: K,
): SVGElementTagNameMap[K] {
	return document.createElementNS(SVG_NS, name);
}

function polygon(points: Array<[number, number]>): SVGPolygonElement {
	const p = el("polygon");
	p.setAttribute("points", points.map(([x, y]) => `${x},${y}`).join(" "));
	return p;
}

/**
 * Build the SVG element(s) that draw `shape` centred at (cx, cy) within a w×h
 * box. The caller adds CSS classes. Most shapes are a single element; a few
 * (subroutine, cylinder, double circle) return several stacked elements.
 */
export function createShapeElements(
	shape: NodeShape,
	cx: number,
	cy: number,
	w: number,
	h: number,
): SVGElement[] {
	const hw = w / 2;
	const hh = h / 2;
	const left = cx - hw;
	const right = cx + hw;
	const top = cy - hh;
	const bottom = cy + hh;

	switch (shape) {
		case "round": {
			const r = el("rect");
			setRect(r, left, top, w, h, Math.min(14, hh));
			return [r];
		}
		case "stadium": {
			const r = el("rect");
			setRect(r, left, top, w, h, hh);
			return [r];
		}
		case "subroutine": {
			const r = el("rect");
			setRect(r, left, top, w, h, 3);
			const inset = 7;
			const l1 = vline(left + inset, top, bottom);
			const l2 = vline(right - inset, top, bottom);
			return [r, l1, l2];
		}
		case "cylinder": {
			const ry = Math.min(hh * 0.5, 9);
			const body = el("rect");
			setRect(body, left, top + ry, w, h - 2 * ry, 0);
			const cap = el("ellipse");
			cap.setAttribute("cx", String(cx));
			cap.setAttribute("cy", String(top + ry));
			cap.setAttribute("rx", String(hw));
			cap.setAttribute("ry", String(ry));
			return [body, cap];
		}
		case "circle": {
			const c = el("circle");
			c.setAttribute("cx", String(cx));
			c.setAttribute("cy", String(cy));
			c.setAttribute("r", String(Math.min(hw, hh)));
			return [c];
		}
		case "double-circle": {
			const r = Math.min(hw, hh);
			const outer = el("circle");
			outer.setAttribute("cx", String(cx));
			outer.setAttribute("cy", String(cy));
			outer.setAttribute("r", String(r));
			const inner = el("circle");
			inner.setAttribute("cx", String(cx));
			inner.setAttribute("cy", String(cy));
			inner.setAttribute("r", String(Math.max(r - 5, 2)));
			inner.setAttribute("fill", "none");
			return [outer, inner];
		}
		case "diamond": {
			return [
				polygon([
					[cx, top],
					[right, cy],
					[cx, bottom],
					[left, cy],
				]),
			];
		}
		case "hexagon": {
			const inset = Math.min(hw * 0.3, hh);
			return [
				polygon([
					[left, cy],
					[left + inset, top],
					[right - inset, top],
					[right, cy],
					[right - inset, bottom],
					[left + inset, bottom],
				]),
			];
		}
		case "parallelogram": {
			const s = Math.min(hw * 0.5, 20);
			return [
				polygon([
					[left + s, top],
					[right, top],
					[right - s, bottom],
					[left, bottom],
				]),
			];
		}
		case "parallelogram-alt": {
			const s = Math.min(hw * 0.5, 20);
			return [
				polygon([
					[left, top],
					[right - s, top],
					[right, bottom],
					[left + s, bottom],
				]),
			];
		}
		case "trapezoid": {
			const s = Math.min(hw * 0.5, 20);
			return [
				polygon([
					[left + s, top],
					[right - s, top],
					[right, bottom],
					[left, bottom],
				]),
			];
		}
		case "trapezoid-alt": {
			const s = Math.min(hw * 0.5, 20);
			return [
				polygon([
					[left, top],
					[right, top],
					[right - s, bottom],
					[left + s, bottom],
				]),
			];
		}
		case "asymmetric": {
			const ind = Math.min(hw * 0.35, 16);
			return [
				polygon([
					[left, top],
					[right, top],
					[right, bottom],
					[left, bottom],
					[left + ind, cy],
				]),
			];
		}
		case "rect":
		default: {
			const r = el("rect");
			setRect(r, left, top, w, h, 4);
			return [r];
		}
	}
}

function setRect(
	r: SVGRectElement,
	x: number,
	y: number,
	w: number,
	h: number,
	radius: number,
): void {
	r.setAttribute("x", String(x));
	r.setAttribute("y", String(y));
	r.setAttribute("width", String(w));
	r.setAttribute("height", String(h));
	r.setAttribute("rx", String(radius));
	r.setAttribute("ry", String(radius));
}

function vline(x: number, y0: number, y1: number): SVGLineElement {
	const l = el("line");
	l.setAttribute("x1", String(x));
	l.setAttribute("y1", String(y0));
	l.setAttribute("x2", String(x));
	l.setAttribute("y2", String(y1));
	l.setAttribute("fill", "none");
	return l;
}

/** A small preview icon for the shape palette. */
export function createShapeIcon(shape: NodeShape): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 36 24");
	svg.classList.add("mermaid-flow-shape-icon");
	for (const node of createShapeElements(shape, 18, 12, 28, 16)) {
		node.classList.add("mermaid-flow-shape");
		svg.appendChild(node);
	}
	return svg;
}
