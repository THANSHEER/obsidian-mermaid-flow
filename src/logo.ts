/*
 * App logo SVG and renderer for Mermaid Flow.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export const APP_LOGO_SVG_XML = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80" fill="none">
  <defs>
    <radialGradient id="mfGlow" cx="0.5" cy="1.3" r="0.9">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mfSheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <filter id="mfIconShadow" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="1" stdDeviation="0" flood-color="rgb(0,0,0)" flood-opacity="0.2"/>
    </filter>
    <clipPath id="mfTile"><rect width="80" height="80" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#mfTile)">
    <rect width="80" height="80" fill="#fb464c"/>
    <rect width="80" height="80" fill="url(#mfSheen)"/>
    <rect width="80" height="80" fill="url(#mfGlow)"/>
  </g>
  <rect x="0.5" y="0.5" width="79" height="79" rx="15.5" fill="none" stroke="rgb(255,255,255)" stroke-opacity="0.1" stroke-width="1"/>
  <g filter="url(#mfIconShadow)">
    <g transform="translate(20 20) scale(1.66667)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="8" height="8" x="3" y="3" rx="2"/>
      <path d="M7 11v4a2 2 0 0 0 2 2h4"/>
      <rect width="8" height="8" x="13" y="13" rx="2"/>
    </g>
  </g>
</svg>`;

/**
 * Renders the Mermaid Flow app logo SVG into a parent container.
 *
 * @param parent - The container element to append the logo into
 * @param size - Width and height of the logo in pixels (defaults to 64)
 * @returns The wrapper element containing the rendered logo SVG
 */
export function renderAppLogo(parent: HTMLElement, size = 64): HTMLElement {
	const wrap = parent.createDiv({ cls: "mermaid-flow-app-logo" });
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(APP_LOGO_SVG_XML, "image/svg+xml");
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
