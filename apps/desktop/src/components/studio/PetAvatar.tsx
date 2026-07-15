import { cn } from "@/lib/utils";

// The pet characters: five little companions with faces, expressions, and
// walking legs. Pure SVG + CSS animation — no assets, theme-independent.

export type PetAvatarId = "exa" | "byte" | "pixel" | "quill" | "dot";
export type PetExpression = "idle" | "walk" | "work" | "happy" | "dizzy";

export const PET_AVATARS: { id: PetAvatarId; name: string; body: string; accent: string }[] = [
  { id: "exa", name: "Exa", body: "#5fc33b", accent: "#2f7d14" },
  { id: "byte", name: "Byte", body: "#4da3ff", accent: "#1d5fb8" },
  { id: "pixel", name: "Pixel", body: "#ff9f43", accent: "#c96a12" },
  { id: "quill", name: "Quill", body: "#b18cff", accent: "#6f42d8" },
  { id: "dot", name: "Dot", body: "#ffd54d", accent: "#c79a13" },
];

export function PetAvatar({
  avatar,
  expression = "idle",
  className,
}: {
  avatar: PetAvatarId;
  expression?: PetExpression;
  className?: string;
}) {
  const meta = PET_AVATARS.find((a) => a.id === avatar) ?? PET_AVATARS[0];
  const walking = expression === "walk";
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn(
        "pet-svg",
        walking && "pet-svg-walking",
        expression === "happy" && "pet-svg-happy",
        expression === "dizzy" && "pet-svg-dizzy",
        className,
      )}
      aria-hidden
    >
      {/* legs */}
      <g className="pet-legs" fill={meta.accent}>
        <ellipse className="pet-leg-l" cx="18" cy="44" rx="3.2" ry="2.6" />
        <ellipse className="pet-leg-r" cx="30" cy="44" rx="3.2" ry="2.6" />
      </g>
      {/* body per avatar */}
      <g className="pet-body">
        {meta.id === "exa" ? (
          <rect x="8" y="6" width="32" height="34" rx="11" fill={meta.body} />
        ) : meta.id === "byte" ? (
          <circle cx="24" cy="23" r="17" fill={meta.body} />
        ) : meta.id === "pixel" ? (
          <>
            <path d="M12 14 8 4l10 5z" fill={meta.body} />
            <path d="M36 14 40 4l-10 5z" fill={meta.body} />
            <rect x="8" y="9" width="32" height="31" rx="12" fill={meta.body} />
          </>
        ) : meta.id === "quill" ? (
          <path
            d="M8 22a16 16 0 0 1 32 0v14l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z"
            fill={meta.body}
          />
        ) : (
          <circle cx="24" cy="23" r="17" fill={meta.body} />
        )}
        {/* face */}
        <g className="pet-face">
          {expression === "dizzy" ? (
            <>
              {/* spiral eyes + wavy mouth */}
              <path d="M15.5 21a2.5 2.5 0 1 1 2.5 2.5 1.4 1.4 0 1 1 0-2.8" stroke="#0b1e04" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M27.5 21a2.5 2.5 0 1 1 2.5 2.5 1.4 1.4 0 1 1 0-2.8" stroke="#0b1e04" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M18 29q2-2 4 0t4 0" stroke="#0b1e04" strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          ) : expression === "happy" ? (
            <>
              <path d="M15 21q3-4 6 0" stroke="#0b1e04" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d="M27 21q3-4 6 0" stroke="#0b1e04" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d="M18 28q6 6 12 0" stroke="#0b1e04" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            </>
          ) : expression === "work" ? (
            <>
              <g className="pet-eyes">
                <rect x="15" y="19" width="6" height="2.8" rx="1.4" fill="#0b1e04" />
                <rect x="27" y="19" width="6" height="2.8" rx="1.4" fill="#0b1e04" />
              </g>
              <circle cx="24" cy="29" r="2.6" fill="#0b1e04" />
            </>
          ) : (
            <>
              <g className="pet-eyes">
                <circle cx="18" cy="21" r="2.8" fill="#0b1e04" />
                <circle cx="30" cy="21" r="2.8" fill="#0b1e04" />
                <circle cx="19" cy="20" r="0.9" fill="#fff" />
                <circle cx="31" cy="20" r="0.9" fill="#fff" />
              </g>
              <path d="M20 28q4 3 8 0" stroke="#0b1e04" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            </>
          )}
        </g>
        {/* blush */}
        <circle cx="13.5" cy="26" r="2.2" fill="#fff" opacity="0.28" />
        <circle cx="34.5" cy="26" r="2.2" fill="#fff" opacity="0.28" />
      </g>
    </svg>
  );
}
