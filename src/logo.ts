/*
 * App and companion plugin SVG logos loaded directly from assets/logo/.
 */

import appLogoSvg from "../assets/logo/logo.svg";
import noteflareLogoSvg from "../assets/logo/noteflare.svg";
import omnichatLogoSvg from "../assets/logo/omnichat.svg";

const SVG_NS = "http://www.w3.org/2000/svg";

export { appLogoSvg, noteflareLogoSvg, omnichatLogoSvg };

/**
 * Renders an SVG logo string into a parent container at the given pixel size.
 *
 * @param parent - The container element to append the logo into
 * @param svgXml - Raw SVG markup
 * @param size - Width and height in pixels (defaults to 64)
 * @param cls - Wrapper CSS class (defaults to `"mermaid-flow-app-logo"`)
 * @returns The wrapper element containing the rendered logo SVG
 */
export function renderSvgLogo(
	parent: HTMLElement,
	svgXml: string,
	size = 64,
	cls = "mermaid-flow-app-logo",
): HTMLElement {
	const wrap = parent.createDiv({ cls });
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(svgXml, "image/svg+xml");
		const svg = doc.querySelector("svg");
		if (svg) {
			svg.setAttribute("width", String(size));
			svg.setAttribute("height", String(size));
			wrap.appendChild(svg);
			return wrap;
		}
	} catch {
		/* fallback to DOM creation */
	}

	const fallback = activeDocument.createElementNS(SVG_NS, "svg");
	fallback.setAttribute("width", String(size));
	fallback.setAttribute("height", String(size));
	fallback.setAttribute("viewBox", "0 0 80 80");
	const rect = activeDocument.createElementNS(SVG_NS, "rect");
	rect.setAttribute("width", "80");
	rect.setAttribute("height", "80");
	rect.setAttribute("rx", "16");
	rect.setAttribute("fill", "#fb464c");
	fallback.appendChild(rect);
	wrap.appendChild(fallback);
	return wrap;
}

/**
 * Renders the Mermaid Flow app logo SVG into a parent container.
 *
 * @param parent - The container element to append the logo into
 * @param size - Width and height of the logo in pixels (defaults to 64)
 * @returns The wrapper element containing the rendered logo SVG
 */
export function renderAppLogo(parent: HTMLElement, size = 64): HTMLElement {
	return renderSvgLogo(parent, appLogoSvg, size, "mermaid-flow-app-logo");
}
