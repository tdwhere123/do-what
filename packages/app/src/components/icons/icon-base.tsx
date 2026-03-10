import type { CSSProperties, ReactElement, SVGAttributes } from 'react';

export interface SvgIconProps extends SVGAttributes<SVGSVGElement> {
  readonly size?: number;
  readonly title?: string;
}

const DEFAULT_VIEWBOX = '0 0 300 300';
const SVG_OPEN_RE = /^<svg\b[^>]*>/i;
const SVG_CLOSE_RE = /<\/svg>\s*$/i;
const VIEWBOX_RE = /\bviewBox="([^"]+)"/i;
const FILLED_ATTR_RE = /fill="(?!none)([^"]+)"/gi;
const STROKED_ATTR_RE = /stroke="(?!none)([^"]+)"/gi;

function extractViewBox(markup: string): string {
  return markup.match(VIEWBOX_RE)?.[1] ?? DEFAULT_VIEWBOX;
}

function normalizeInnerMarkup(markup: string): string {
  return markup
    .replace(SVG_OPEN_RE, '')
    .replace(SVG_CLOSE_RE, '')
    .replace(FILLED_ATTR_RE, 'fill="currentColor"')
    .replace(STROKED_ATTR_RE, 'stroke="currentColor"')
    .trim();
}

function mergeStyle(style: CSSProperties | undefined, size: number): CSSProperties {
  return {
    flexShrink: 0,
    height: size,
    width: size,
    ...style,
  };
}

export function createRawSvgIcon(markup: string, displayName: string) {
  const innerMarkup = normalizeInnerMarkup(markup);
  const viewBox = extractViewBox(markup);

  function RawSvgIcon({
    className,
    size = 20,
    style,
    title,
    ...rest
  }: SvgIconProps): ReactElement {
    return (
      <svg
        aria-hidden={title ? undefined : true}
        className={className}
        fill="none"
        focusable="false"
        role={title ? 'img' : 'presentation'}
        style={mergeStyle(style, size)}
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        <g dangerouslySetInnerHTML={{ __html: innerMarkup }} />
      </svg>
    );
  }

  RawSvgIcon.displayName = displayName;
  return RawSvgIcon;
}
