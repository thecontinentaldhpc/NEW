import { useId } from 'react';

export const LOGO_SRC = '/assets/aistudio/The_Continental_new_db2b725a.png';

export interface BrandLogoProps {
  alt?: string;
  tone?: 'auto' | 'light' | 'dark';
  className?: string;
  decorative?: boolean;
  showClouds?: boolean;
}

const OUTER_CLASS_PREFIXES = ['m-', 'mt-', 'mb-', 'ml-', 'mr-', 'mx-', 'my-', 'opacity-', 'block', 'inline-block', 'inline-flex'];

function splitLogoClasses(className: string): { outerClasses: string; imgClasses: string } {
  const tokens = className.trim().split(/\s+/).filter(Boolean);
  const outer: string[] = [];
  const img: string[] = [];

  for (const token of tokens) {
    const base = token.includes(':') ? token.split(':').pop() || token : token;
    if (OUTER_CLASS_PREFIXES.some((prefix) => base === prefix || base.startsWith(prefix))) {
      outer.push(token);
    } else {
      img.push(token);
    }
  }

  return {
    outerClasses: outer.join(' '),
    imgClasses: img.join(' '),
  };
}

export function BrandLogo({
  alt = 'THE CONTINENTAL',
  tone = 'auto',
  className = 'h-12 w-auto',
  decorative = false,
  showClouds = true,
}: BrandLogoProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '') || 'tc';
  const { outerClasses, imgClasses } = splitLogoClasses(className);

  const toneClass =
    tone === 'light'
      ? 'brightness-[2.6] saturate-[1.1] contrast-[1.05] drop-shadow-[0_1px_10px_rgba(96,165,250,0.2)]'
      : tone === 'dark'
        ? ''
        : 'dark:brightness-[2.6] dark:saturate-[1.1] dark:contrast-[1.05] dark:drop-shadow-[0_1px_10px_rgba(96,165,250,0.2)]';

  const imgEl = (
    <img
      src={LOGO_SRC}
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? true : undefined}
      width={2137}
      height={736}
      decoding="async"
      className={`relative z-10 object-contain select-none shrink-0 transition-[filter] duration-150 ${toneClass} ${
        decorative || !showClouds ? className : imgClasses
      }`}
    />
  );

  if (decorative || !showClouds) {
    return imgEl;
  }

  const turbBackId = `tc-cloud-turb-${uid}`;
  const turbWispId = `tc-cloud-wisp-${uid}`;
  const gradCumulusId = `tc-cloud-grad-${uid}`;
  const gradWispId = `tc-cloud-wisp-grad-${uid}`;

  return (
    <span
      data-testid="brand-logo-clouds-wrap"
      className={`relative inline-flex items-center justify-center shrink-0 ${outerClasses}`}
    >
      {/* Atmospheric Cloud Stage (Behind + Soft Foreground Wisps) */}
      <span
        aria-hidden="true"
        data-testid="brand-logo-clouds"
        className="tc-cloud-stage tc-cloud-cycle pointer-events-none select-none absolute -inset-x-4 -inset-y-3 sm:-inset-x-8 sm:-inset-y-4 overflow-hidden"
      >
        {/* Back Volumetric Cumulus Banks */}
        <svg
          viewBox="0 0 480 180"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full z-0"
        >
          <defs>
            <filter id={turbBackId} x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.022 0.036"
                numOctaves="5"
                seed="7"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="22"
                xChannelSelector="R"
                yChannelSelector="G"
                result="displaced"
              />
              <feGaussianBlur in="displaced" stdDeviation="2.4" />
            </filter>

            <linearGradient id={gradCumulusId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--tc-cloud-crest)" />
              <stop offset="55%" stopColor="var(--tc-cloud-mid)" />
              <stop offset="100%" stopColor="var(--tc-cloud-shadow)" />
            </linearGradient>
          </defs>

          {/* Cloud Formation A: Upper-left gliding across sky */}
          <g className="tc-cloud-bank-a" filter={`url(#${turbBackId})`}>
            <ellipse cx="122" cy="64" rx="60" ry="22" fill={`url(#${gradCumulusId})`} />
            <ellipse cx="152" cy="54" rx="40" ry="20" fill={`url(#${gradCumulusId})`} />
            <ellipse cx="94" cy="70" rx="34" ry="16" fill={`url(#${gradCumulusId})`} />
            <ellipse cx="184" cy="68" rx="32" ry="14" fill={`url(#${gradCumulusId})`} />
          </g>

          {/* Cloud Formation B: Mid-right billowing bank */}
          <g className="tc-cloud-bank-b" filter={`url(#${turbBackId})`}>
            <ellipse cx="348" cy="86" rx="66" ry="24" fill={`url(#${gradCumulusId})`} />
            <ellipse cx="320" cy="70" rx="42" ry="20" fill={`url(#${gradCumulusId})`} />
            <ellipse cx="382" cy="90" rx="38" ry="16" fill={`url(#${gradCumulusId})`} />
            <ellipse cx="288" cy="94" rx="34" ry="15" fill={`url(#${gradCumulusId})`} />
          </g>
        </svg>
      </span>

      {/* Crisp Brand Logo Artwork */}
      {imgEl}

      {/* Soft Translucent Foreground Wisps Flying Around Lower/Outer Edges */}
      <span
        aria-hidden="true"
        className="tc-cloud-stage tc-cloud-cycle pointer-events-none select-none absolute -inset-x-4 -inset-y-3 sm:-inset-x-8 sm:-inset-y-4 overflow-hidden z-20"
      >
        <svg
          viewBox="0 0 480 180"
          preserveAspectRatio="none"
          className="w-full h-full opacity-55"
        >
          <defs>
            <filter id={turbWispId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.017 0.044"
                numOctaves="4"
                seed="23"
                result="wispNoise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="wispNoise"
                scale="24"
                xChannelSelector="R"
                yChannelSelector="G"
                result="wispDisplaced"
              />
              <feGaussianBlur in="wispDisplaced" stdDeviation="3.2" />
            </filter>

            <radialGradient id={gradWispId} cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="var(--tc-cloud-crest)" />
              <stop offset="65%" stopColor="var(--tc-cloud-wisp)" />
              <stop offset="100%" stopColor="var(--tc-cloud-shadow)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="tc-cloud-bank-c" filter={`url(#${turbWispId})`}>
            <ellipse cx="152" cy="128" rx="64" ry="15" fill={`url(#${gradWispId})`} />
            <ellipse cx="326" cy="50" rx="54" ry="13" fill={`url(#${gradWispId})`} />
            <ellipse cx="246" cy="134" rx="48" ry="12" fill={`url(#${gradWispId})`} />
          </g>
        </svg>
      </span>
    </span>
  );
}

/**
 * Full-width volumetric clouds flying across the entire Masthead header:
 * left free space, center logo sky, and right free space.
 */
export function MastheadCloudSky() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '') || 'tc-sky';
  const turbId = `tc-sky-turb-${uid}`;
  const turbWispId = `tc-sky-wisp-${uid}`;
  const gradCumulusId = `tc-sky-grad-${uid}`;
  const gradWispId = `tc-sky-wisp-grad-${uid}`;

  return (
    <div
      aria-hidden="true"
      data-testid="masthead-header-clouds"
      className="tc-header-sky tc-cloud-cycle pointer-events-none select-none absolute inset-0 overflow-hidden z-0"
    >
      <svg
        viewBox="0 0 1440 220"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        <defs>
          <filter id={turbId} x="-25%" y="-35%" width="150%" height="170%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015 0.032"
              numOctaves="5"
              seed="11"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="28"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="2.6" />
          </filter>

          <filter id={turbWispId} x="-25%" y="-35%" width="150%" height="170%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.04"
              numOctaves="4"
              seed="29"
              result="wispNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="wispNoise"
              scale="24"
              xChannelSelector="R"
              yChannelSelector="G"
              result="wispDisplaced"
            />
            <feGaussianBlur in="wispDisplaced" stdDeviation="3.4" />
          </filter>

          <linearGradient id={gradCumulusId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--tc-cloud-crest)" />
            <stop offset="55%" stopColor="var(--tc-cloud-mid)" />
            <stop offset="100%" stopColor="var(--tc-cloud-shadow)" />
          </linearGradient>

          <radialGradient id={gradWispId} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="var(--tc-cloud-crest)" />
            <stop offset="65%" stopColor="var(--tc-cloud-wisp)" />
            <stop offset="100%" stopColor="var(--tc-cloud-shadow)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Left Free Space + Center-Left Cumulus Banks */}
        <g className="tc-cloud-bank-a" filter={`url(#${turbId})`}>
          {/* Far Left Sky Cloud */}
          <ellipse cx="155" cy="96" rx="92" ry="30" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="205" cy="80" rx="58" ry="26" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="110" cy="108" rx="54" ry="22" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="255" cy="104" rx="48" ry="18" fill={`url(#${gradCumulusId})`} />

          {/* Left-Center Cloud Flanking Logo */}
          <ellipse cx="445" cy="144" rx="76" ry="24" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="410" cy="130" rx="48" ry="21" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="490" cy="148" rx="44" ry="16" fill={`url(#${gradCumulusId})`} />

          {/* Center-Upper Logo Sky */}
          <ellipse cx="670" cy="54" rx="72" ry="22" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="712" cy="44" rx="46" ry="18" fill={`url(#${gradCumulusId})`} />
        </g>

        {/* Right Free Space + Center-Right Billowing Cumulus Banks */}
        <g className="tc-cloud-bank-b" filter={`url(#${turbId})`}>
          {/* Center-Right Cloud Flanking Logo */}
          <ellipse cx="975" cy="76" rx="82" ry="26" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="935" cy="60" rx="50" ry="22" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="1020" cy="82" rx="46" ry="18" fill={`url(#${gradCumulusId})`} />

          {/* Far Right Sky Cloud */}
          <ellipse cx="1265" cy="126" rx="98" ry="32" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="1215" cy="108" rx="60" ry="26" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="1325" cy="134" rx="56" ry="22" fill={`url(#${gradCumulusId})`} />
          <ellipse cx="1165" cy="136" rx="48" ry="18" fill={`url(#${gradCumulusId})`} />
        </g>

        {/* Sweeping Mid-Sky Wisps Bridging Left, Center & Right */}
        <g className="tc-cloud-bank-c" filter={`url(#${turbWispId})`} opacity="0.72">
          <ellipse cx="290" cy="48" rx="85" ry="18" fill={`url(#${gradWispId})`} />
          <ellipse cx="595" cy="176" rx="92" ry="20" fill={`url(#${gradWispId})`} />
          <ellipse cx="835" cy="170" rx="88" ry="18" fill={`url(#${gradWispId})`} />
          <ellipse cx="1120" cy="44" rx="82" ry="17" fill={`url(#${gradWispId})`} />
        </g>
      </svg>
    </div>
  );
}
