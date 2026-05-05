// SVG icon components — stroke-based, 2px stroke, no fill
// Each exported as a React component that accepts: size, stroke, strokeWidth

const defaultStroke = 'currentColor';
const defaultSize = 20;
const defaultSW = 2;

const svgProps = (size, stroke, sw) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: stroke || defaultStroke,
  strokeWidth: sw || defaultSW,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export function IconCalendar({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

export function IconDollar({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

export function IconReceipt({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <polyline points="6 2 3 6 3 20 21 20 21 6 18 2 6 2"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="12" y1="6" x2="12" y2="20"/>
    </svg>
  );
}

export function IconBarChart({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}

export function IconLightbulb({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <line x1="9" y1="18" x2="15" y2="18"/>
      <line x1="10" y1="22" x2="14" y2="22"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  );
}

export function IconActivity({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

export function IconCalculator({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="8" y1="6" x2="16" y2="6"/>
      <line x1="8" y1="11" x2="8" y2="11" strokeWidth="3"/>
      <line x1="12" y1="11" x2="12" y2="11" strokeWidth="3"/>
      <line x1="16" y1="11" x2="16" y2="11" strokeWidth="3"/>
      <line x1="8" y1="15" x2="8" y2="15" strokeWidth="3"/>
      <line x1="12" y1="15" x2="12" y2="15" strokeWidth="3"/>
      <line x1="16" y1="15" x2="16" y2="15" strokeWidth="3"/>
      <line x1="8" y1="19" x2="12" y2="19" strokeWidth="3"/>
      <line x1="16" y1="19" x2="16" y2="19" strokeWidth="3"/>
    </svg>
  );
}

export function IconTrendingDown({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
      <polyline points="17 18 23 18 23 12"/>
    </svg>
  );
}

export function IconLeaf({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  );
}

export function IconBuilding({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <rect x="4" y="2" width="16" height="20" rx="1"/>
      <path d="M9 22V12h6v10"/>
      <line x1="8" y1="6" x2="8" y2="6" strokeWidth="3"/>
      <line x1="12" y1="6" x2="12" y2="6" strokeWidth="3"/>
      <line x1="16" y1="6" x2="16" y2="6" strokeWidth="3"/>
      <line x1="8" y1="10" x2="8" y2="10" strokeWidth="3"/>
      <line x1="12" y1="10" x2="12" y2="10" strokeWidth="3"/>
      <line x1="16" y1="10" x2="16" y2="10" strokeWidth="3"/>
    </svg>
  );
}

export function IconMapPin({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

export function IconSettings({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export function IconSun({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

export function IconMoon({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export function IconLock({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

export function IconChevronRight({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// NavIcon: colored rounded-square container + SVG inside
// color: hex stroke color, bg: background tint color
export function IconShield({ size = defaultSize, stroke, strokeWidth } = {}) {
  return (
    <svg {...svgProps(size, stroke, strokeWidth)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

export function NavIcon({ color, bg, children, size = 28 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 8,
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div style={{ color, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}
