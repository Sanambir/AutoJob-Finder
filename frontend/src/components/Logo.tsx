/**
 * WorkfinderX geometric logo mark.
 * Two crossing beam shapes (upper X) + double upward chevrons with dashes (lower).
 * Pass size for uniform scaling; color defaults to white.
 */
interface LogoProps {
  size?: number
  color?: string
  className?: string
}

export function LogoMark({ size = 32, color = 'white', className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="WorkfinderX logo"
    >
      {/* Upper section — two crossing diagonal beams forming the X */}
      <polygon points="10,8 43,8 63,46 28,46" />
      <polygon points="90,8 57,8 37,46 72,46" />

      {/* Lower section — double upward chevrons */}
      <polygon points="46,53 13,87 34,87" />
      <polygon points="54,53 66,87 87,87" />

      {/* Side accent dashes */}
      <polygon points="6,73 15,61 20,64 11,76" />
      <polygon points="94,73 85,61 80,64 89,76" />
    </svg>
  )
}

/** Full lockup: mark + "WORKFINDERX" wordmark stacked vertically. */
export function LogoFull({ size = 48, color = 'white', className }: LogoProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} color={color} />
      <span
        style={{
          color,
          fontSize: size * 0.27,
          fontWeight: 900,
          letterSpacing: '0.15em',
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1,
        }}
      >
        WORKFINDERX
      </span>
    </div>
  )
}
