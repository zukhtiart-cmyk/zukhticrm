/**
 * Zuki's look: a cheerful young interior designer — dark wavy hair in a top-knot with a brass tie,
 * a brass pencil tucked behind one ear, cream shirt and an olive designer's apron with a measuring tape.
 * Drawn in a 200×200 box. Class names (zk-eye, zk-smile, zk-arm-l…) are animated by the CSS in zuki.tsx.
 */
export const ZK = {
  skin: "#cf9468",
  skinShade: "#b97c52",
  hair: "#2a1c15",
  shirt: "#58779a",
  shirtShade: "#4a6687",
  apron: "#56704f",
  apronDark: "#475e41",
  pants: "#3a2c24",
  shoe: "#6b4a2f",
  brass: "#b0844f",
  pencil: "#d9a441",
  ink: "#1f1712",
  iris: "#5a3622",
  mouth: "#5a2620",
  cheek: "#e58f7a",
  tape: "#e2b84a",
};

/** Just the head, for small icons. */
export function ZukiHeadParts({ eyes = true }: { eyes?: boolean }) {
  return (
    <>
      {/* Ears */}
      <circle cx="55" cy="90" r="9" fill={ZK.skin} />
      <ellipse cx="55" cy="90" rx="4" ry="5" fill={ZK.skinShade} />
      <circle cx="145" cy="90" r="9" fill={ZK.skin} />
      <ellipse cx="145" cy="90" rx="4" ry="5" fill={ZK.skinShade} />
      {/* Pencil behind the right ear */}
      <g transform="rotate(-28 148 70)">
        <rect x="144" y="46" width="7" height="32" rx="1.5" fill={ZK.pencil} />
        <rect x="144" y="46" width="7" height="5" rx="1.5" fill="#e59a9a" />
        <rect x="144" y="50" width="7" height="2" fill="#c9c2b6" />
        <path d="M144 78 L151 78 L147.5 86 Z" fill="#f1d8b0" />
        <path d="M146.3 83 L148.7 83 L147.5 86 Z" fill={ZK.ink} />
      </g>
      {/* Face */}
      <ellipse cx="100" cy="86" rx="45" ry="43" fill={ZK.skin} />
      {/* Hair: top-knot with a brass tie, and a wavy fringe */}
      <circle cx="103" cy="31" r="13" fill={ZK.hair} />
      <rect
        className="zk-lamp"
        x="95"
        y="40"
        width="16"
        height="6"
        rx="3"
        fill={ZK.brass}
      />
      <path
        d="M54 90 C48 54 70 40 100 40 C132 40 154 56 146 90 C143 78 137 70 128 66 C122 74 108 78 96 72 C88 78 76 80 66 76 C60 80 56 84 54 90 Z"
        fill={ZK.hair}
      />
      <path
        d="M56 88 C52 96 54 104 58 108 C58 100 59 94 62 88 Z"
        fill={ZK.hair}
      />
      <path
        d="M144 88 C148 96 146 104 142 108 C142 100 141 94 138 88 Z"
        fill={ZK.hair}
      />
      {/* Brows */}
      <g
        className="zk-brows-n"
        fill="none"
        stroke={ZK.hair}
        strokeWidth="3.6"
        strokeLinecap="round"
      >
        <path d="M73 73 q9 -6 17 -1" />
        <path d="M110 72 q8 -5 17 1" />
      </g>
      {eyes && <ZukiEyes />}
      {/* Nose and cheeks */}
      <path
        d="M98 97 q4 4 0 7"
        fill="none"
        stroke={ZK.skinShade}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <ellipse cx="71" cy="104" rx="7" ry="4.5" fill={ZK.cheek} opacity="0.5" />
      <ellipse
        cx="129"
        cy="104"
        rx="7"
        ry="4.5"
        fill={ZK.cheek}
        opacity="0.5"
      />
      {/* Mouth: smile, talking, frown */}
      <path
        className="zk-smile"
        d="M88 111 q12 10 24 0"
        fill="none"
        stroke={ZK.mouth}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <ellipse
        className="zk-mouth"
        cx="100"
        cy="115"
        rx="8"
        ry="6"
        fill={ZK.mouth}
      />
      <path
        className="zk-frown"
        d="M90 117 q10 -6 20 0"
        fill="none"
        stroke={ZK.mouth}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </>
  );
}

export function ZukiEyes({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) {
  return (
    <>
      <g className="zk-eyes">
        {[82, 118].map((cx) => (
          <g key={cx} className="zk-eye">
            <ellipse cx={cx} cy="89" rx="9.5" ry="11" fill="#fffaf2" />
            <g
              style={{
                transform: `translate(${dx}px, ${dy}px)`,
                transition: "transform .12s ease-out",
              }}
            >
              <circle cx={cx + 1} cy="91" r="6.6" fill={ZK.iris} />
              <circle cx={cx + 1} cy="91" r="3.6" fill={ZK.ink} />
              <circle
                className="zk-glint"
                cx={cx + 3.5}
                cy="87.5"
                r="2.2"
                fill="#fff"
              />
            </g>
          </g>
        ))}
      </g>
      {/* Happy: eyes close into little arcs */}
      <g
        className="zk-happy-eyes"
        fill="none"
        stroke={ZK.ink}
        strokeWidth="3.8"
        strokeLinecap="round"
      >
        <path d="M73 91 q9 -10 18 0" />
        <path d="M109 91 q9 -10 18 0" />
      </g>
      {/* Worried brows */}
      <g
        className="zk-brows"
        stroke={ZK.hair}
        strokeWidth="3.6"
        strokeLinecap="round"
      >
        <path d="M74 76 L89 70" />
        <path d="M126 76 L111 70" />
      </g>
    </>
  );
}

/** The whole character. */
export function ZukiFigure() {
  return (
    <>
      {/* Listening waves by the ears */}
      <g
        className="zk-waves"
        fill="none"
        stroke="var(--color-olive)"
        strokeWidth="4.5"
        strokeLinecap="round"
      >
        <path className="zk-w1" d="M36 80 q-8 11 0 22" />
        <path className="zk-w2" d="M26 72 q-14 19 0 38" />
        <path className="zk-w1" d="M164 80 q8 11 0 22" />
        <path className="zk-w2" d="M174 72 q14 19 0 38" />
      </g>
      <ellipse
        className="zk-shadow"
        cx="100"
        cy="192"
        rx="34"
        ry="5"
        fill="#1f1c18"
        opacity="0.12"
      />
      <g className="zk-body">
        {/* Legs and shoes */}
        <rect x="86" y="168" width="11" height="17" rx="4" fill={ZK.pants} />
        <rect x="103" y="168" width="11" height="17" rx="4" fill={ZK.pants} />
        <ellipse cx="90" cy="186" rx="10" ry="5" fill={ZK.shoe} />
        <ellipse cx="110" cy="186" rx="10" ry="5" fill={ZK.shoe} />
        {/* Arms behind the body */}
        <g className="zk-arm-l">
          <path
            d="M77 134 L66 152"
            stroke={ZK.shirt}
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M66 152 L63 163"
            stroke={ZK.skin}
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx="62.5" cy="165" r="6" fill={ZK.skin} />
        </g>
        <g className="zk-arm-r">
          <path
            d="M123 134 L134 152"
            stroke={ZK.shirt}
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M134 152 L137 163"
            stroke={ZK.skin}
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx="137.5" cy="165" r="6" fill={ZK.skin} />
        </g>
        {/* Shirt, apron, pocket with a measuring tape */}
        <rect
          x="93"
          y="118"
          width="14"
          height="10"
          rx="3"
          fill={ZK.skinShade}
        />
        <rect x="72" y="124" width="56" height="50" rx="20" fill={ZK.shirt} />
        <path
          d="M86 125 L81 138 M114 125 L119 138"
          stroke={ZK.apron}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M79 138 H121 V168 Q121 174 115 174 H85 Q79 174 79 168 Z"
          fill={ZK.apron}
        />
        <rect
          x="91"
          y="152"
          width="18"
          height="13"
          rx="3"
          fill={ZK.apronDark}
        />
        <circle cx="104" cy="153" r="5.5" fill={ZK.tape} />
        <circle cx="104" cy="153" r="1.8" fill="#7a5a1e" />
        <ZukiHeadParts />
      </g>
    </>
  );
}
