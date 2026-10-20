import type { ReactNode } from "react";
import { LOGO } from "../src/lib/logo-geometria";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { ICONS } from "../src/components/Icon";

const fraunces = loadFraunces("normal", { weights: ["500", "600"], subsets: ["latin"] }).fontFamily;
loadFraunces("italic", { weights: ["500"], subsets: ["latin"] });
const geist = loadGeist("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
const mono = loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

const C = {
  bg: "#06141d",
  brand600: "#0f766e",
  brand400: "#34b59a",
  gold400: "#e0b84a",
  gold300: "#ecd48a",
  ink900: "#0a1f2c",
  paper: "#f6f6f1",
};

type Status = "Conciliado" | "Divergente" | "Não pago" | "Não esperado";
const STATUS: Record<Status, string> = {
  Conciliado: "#34b59a",
  Divergente: "#e0b84a",
  "Não pago": "#f87171",
  "Não esperado": "#a78bfa",
};

// Valores ilustrativos
const ROWS: { data: string; hist: string; valor: string; status: Status; x: number; y: number; r: number }[] = [
  { data: "02/09", hist: "PIX RECEBIDO", valor: "R$ 1.250,00", status: "Conciliado", x: -420, y: -250, r: -4 },
  { data: "02/09", hist: "LIQ. BOLETO", valor: "R$ 3.480,90", status: "Conciliado", x: 380, y: -170, r: 3 },
  { data: "03/09", hist: "PIX RECEBIDO", valor: "R$ 742,15", status: "Divergente", x: -480, y: 20, r: 2.5 },
  { data: "03/09", hist: "LIQ. BOLETO", valor: "R$ 2.100,00", status: "Conciliado", x: 450, y: 70, r: -3 },
  { data: "04/09", hist: "TÍTULO EM ABERTO", valor: "R$ 980,00", status: "Não pago", x: -260, y: 220, r: -2 },
  { data: "04/09", hist: "TED RECEBIDA", valor: "R$ 615,40", status: "Não esperado", x: 330, y: 300, r: 4 },
  { data: "05/09", hist: "PIX RECEBIDO", valor: "R$ 4.020,00", status: "Conciliado", x: 60, y: -340, r: -1.5 },
];

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fade = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });
// segundos -> frames (60fps)
const S = (sec: number) => Math.round(sec * 60);
const soft = (f: number, start: number, dur: number) => interpolate(f, [start, start + dur], [0, 1], { ...clamp, easing: ease });

const Svg = ({ d, size, color, sw = 1.8 }: { d: string; size: number; color: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// Mesma geometria do app (src/lib/logo-geometria.ts não tem imports, então o Remotion resolve direto)
const LogoMark = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox={LOGO.viewBox} fill="none">
    <rect width="32" height="32" rx={LOGO.fundo.rx} fill={LOGO.fundo.cor} />
    <rect x="0.5" y="0.5" width="31" height="31" rx={LOGO.fundo.rx - 0.5} stroke={LOGO.borda.cor} strokeOpacity={LOGO.borda.opacidade} />
    <path d={LOGO.pecaOuro.d} fill={LOGO.pecaOuro.cor} />
    <path d={LOGO.pecaVerde.d} fill={LOGO.pecaVerde.cor} />
  </svg>
);

const Grid = () => (
  <AbsoluteFill
    style={{
      backgroundColor: C.bg,
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
      backgroundSize: "44px 44px",
    }}
  />
);

const Eyebrow = ({ text, opacity }: { text: string; opacity: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, opacity, fontFamily: geist, fontSize: 22, letterSpacing: 5, color: C.gold300, fontWeight: 500 }}>
    <div style={{ width: 44, height: 2, background: C.gold400 }} />
    {text}
  </div>
);

const Chip = ({ s, p }: { s: Status; p: number }) => {
  const c = STATUS[s];
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, boxSizing: "border-box",
        border: `1.5px solid ${c}66`, background: `${c}1f`, color: c, fontFamily: geist, fontSize: 21, fontWeight: 600,
        opacity: p, transform: `scale(${0.94 + 0.06 * p})`, width: 230, justifyContent: "center",
      }}
    >
      {s === "Conciliado" ? <Svg d={ICONS.check} size={20} color={C.gold400} sw={2.4} /> : <div style={{ width: 9, height: 9, borderRadius: 9, background: c }} />}
      {s}
    </div>
  );
};

const Statement = ({ f }: { f: number }) => {
  const out = fade(f, S(10), S(10.7));
  const counted = ROWS.filter((r, i) => r.status === "Conciliado" && f >= S(6.0 + i * 0.35)).length;
  const cam = 1 + 0.02 * interpolate(f, [0, S(10.7)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${Math.round(-24 * out)}px) scale(${cam})` }}>
      <div style={{ position: "absolute", top: 96, left: 160 }}>
        <Eyebrow text="RETORNO DO BANCO × TÍTULOS ESPERADOS" opacity={fade(f, S(0.15), S(0.9))} />
      </div>
      <div style={{ position: "absolute", top: 84, right: 160, opacity: fade(f, S(5.4), S(6.1)), display: "flex", alignItems: "baseline", gap: 16, fontFamily: geist, color: C.paper }}>
        <span style={{ fontSize: 22, color: "rgba(246,246,241,0.6)", letterSpacing: 3 }}>CONCILIADO</span>
        <span style={{ fontFamily: mono, fontSize: 46, color: C.brand400, fontWeight: 500 }}>{counted}</span>
        <span style={{ fontFamily: mono, fontSize: 28, color: "rgba(246,246,241,0.45)" }}>/ {ROWS.length}</span>
      </div>
      {ROWS.map((r, i) => {
        const enter = soft(f, S(0.3 + i * 0.15), S(1.1));
        const align = soft(f, S(4 + i * 0.12), S(2));
        const tableY = -264 + i * 88 + 50;
        const x = Math.round(interpolate(align, [0, 1], [r.x, 0]));
        const y = Math.round(interpolate(align, [0, 1], [r.y, tableY]));
        const rot = interpolate(align, [0, 1], [r.r, 0]);
        const chipP = soft(f, S(5.8 + i * 0.35), S(0.5));
        const w = Math.round(interpolate(align, [0, 1], [720, 1600], clamp) / 2) * 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: "50%", top: "50%", width: w, height: 72,
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg) translateY(${Math.round((1 - enter) * 18)}px)`,
              opacity: enter, display: "flex", alignItems: "center", padding: "0 30px", gap: 40, boxSizing: "border-box",
              background: "rgba(10,31,44,0.92)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14,
              fontFamily: mono, fontSize: 26, color: C.paper,
            }}
          >
            <span style={{ color: "rgba(246,246,241,0.55)", width: 90 }}>{r.data}</span>
            <span style={{ flex: 1, letterSpacing: 1, whiteSpace: "nowrap" }}>{r.hist}</span>
            <span style={{ width: 220, textAlign: "right", whiteSpace: "nowrap" }}>{r.valor}</span>
            <div style={{ width: 230 * Math.min(1, align), flexShrink: 0, marginLeft: -40 * (1 - Math.min(1, align)) }}>{chipP > 0 && <Chip s={r.status} p={chipP} />}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const QR = () => {
  const cells = ["1110101", "1010010", "1110111", "0001000", "1101011", "0100110", "1011101"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 14px)", gap: 3, padding: 12, background: C.paper, borderRadius: 10 }}>
      {cells.join("").split("").map((v, i) => (
        <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: v === "1" ? C.ink900 : "transparent" }} />
      ))}
    </div>
  );
};

const pill = (c: string) =>
  ({
    display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999,
    background: `${c}1f`, border: `1.5px solid ${c}66`, color: c, fontFamily: geist, fontSize: 22, fontWeight: 600,
  }) as const;

const Card = ({ f, start, icon, tag, title, children }: { f: number; start: number; icon: string; tag: string; title: string; children: ReactNode }) => {
  const p = soft(f, start, S(0.9));
  return (
    <div
      style={{
        width: 500, height: 440, borderRadius: 24, padding: 40, boxSizing: "border-box",
        background: "rgba(10,31,44,0.95)", border: "1px solid rgba(255,255,255,0.1)",
        opacity: p, transform: `translateY(${Math.round((1 - p) * 28)}px)`, display: "flex", flexDirection: "column", gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: "rgba(15,118,110,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Svg d={ICONS[icon]} size={32} color={C.brand400} />
        </div>
        <span style={{ fontFamily: geist, fontSize: 22, letterSpacing: 4, color: "rgba(246,246,241,0.6)", fontWeight: 500 }}>{tag}</span>
      </div>
      <div style={{ fontFamily: fraunces, fontSize: 40, lineHeight: 1.15, color: C.paper, fontWeight: 500 }}>{title}</div>
      <div style={{ marginTop: "auto" }}>{children}</div>
    </div>
  );
};

const Cards = ({ f }: { f: number }) => {
  const outP = fade(f, S(16.3), S(17));
  const cam = 1 + 0.02 * interpolate(f, [S(10.3), S(17)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: 1 - outP, transform: `translateY(${Math.round(-24 * outP)}px) scale(${cam})`, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 56 }}>
      <div style={{ display: "flex", gap: 44 }}>
        <Card f={f} start={S(10.4)} icon="cobranca" tag="COBRANÇA" title="Pix sem baixa duplicada">
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <QR />
            <span style={{ fontFamily: mono, fontSize: 22, color: C.brand400, lineHeight: 1.5 }}>
              1 pagamento
              <br />= 1 baixa
            </span>
          </div>
        </Card>
        <Card f={f} start={S(11.6)} icon="credito" tag="CRÉDITO" title="Score por regras, parecer rastreável">
          <div style={{ fontFamily: mono, fontSize: 56, color: C.paper }}>
            {Math.round(interpolate(f, [S(11.9), S(13.1)], [0, 742], { ...clamp, easing: ease }))}
            <span style={{ fontSize: 24, color: "rgba(246,246,241,0.45)" }}> score</span>
          </div>
          <div style={{ ...pill(C.brand400), marginTop: 14 }}>
            <Svg d={ICONS.check} size={20} color={C.gold400} sw={2.4} /> Parecer: aprovado
          </div>
        </Card>
        <Card f={f} start={S(12.8)} icon="pld" tag="PLD / COAF" title="Alerta de risco · dossiê gerado">
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={pill(C.gold400)}>
              <Svg d={ICONS.alert} size={20} color={C.gold400} /> Alerta
            </div>
            <Svg d={ICONS.arrow} size={26} color="rgba(246,246,241,0.4)" />
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: C.paper, fontFamily: geist, fontSize: 22 }}>
              <Svg d={ICONS.file} size={24} color={C.brand400} /> Dossiê
            </div>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

const Closing = ({ f }: { f: number }) => {
  const outP = fade(f, S(22), S(23.4));
  const l1 = soft(f, S(17), S(1.1));
  const l2 = soft(f, S(17.5), S(1.1));
  const lg = soft(f, S(18.2), S(1));
  const cam = 1 + 0.02 * interpolate(f, [S(17), S(23.4)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: 1 - outP, transform: `translateY(${Math.round(-20 * outP)}px) scale(${cam})`, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ fontFamily: fraunces, fontSize: 150, lineHeight: 1.05, color: C.paper, fontWeight: 500, opacity: l1, transform: `translateY(${Math.round((1 - l1) * 24)}px)` }}>
        Menos planilha.
      </div>
      <div style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: 150, lineHeight: 1.1, color: C.gold400, fontWeight: 500, opacity: l2, transform: `translateY(${Math.round((1 - l2) * 24)}px)` }}>
        Mais decisão.
      </div>
      <div style={{ marginTop: 80, display: "flex", alignItems: "center", gap: 22, opacity: lg, transform: `translateY(${Math.round((1 - lg) * 14)}px)` }}>
        <LogoMark size={64} />
        <div>
          <div style={{ fontFamily: fraunces, fontSize: 44, color: C.paper, fontWeight: 600 }}>Livingstone</div>
          <div style={{ fontFamily: geist, fontSize: 24, color: "rgba(246,246,241,0.65)" }}>Operações bancárias com inteligência artificial</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Hero = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Grid />
      {f < S(10.8) && <Statement f={f} />}
      {f >= S(10.2) && f < S(17.1) && <Cards f={f} />}
      {f >= S(16.9) && <Closing f={f} />}
    </AbsoluteFill>
  );
};
