import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { LOGO } from "../src/lib/logo-geometria";

const fraunces = loadFraunces("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily;
const geist = loadGeist("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

// Tokens de src/app/globals.css
const C = {
  creme: "#fbf6e6",
  white: "#ffffff",
  ink900: "#0a1f2c",
  ink700: "#1f3d49",
  ink500: "#4b6470",
  brand600: "#0f766e",
  brand400: "#34b59a",
  brand50: "#effaf7",
  gold400: "#e0b84a",
  gold300: "#ecd48a",
  line: "#e6e2d6",
  heart: "#e0607e",
};

const FPS = 30;
const S = (s: number) => Math.round(s * FPS);
export const AMANDA_DURACAO = S(75);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const soft = (f: number, a: number, dur = S(0.7)) => interpolate(f, [a, a + dur], [0, 1], { ...clamp, easing: ease });
const lerp = (p: number, a: number, b: number) => a + (b - a) * p;
const typed = (f: number, start: number, text: string, cps = 18) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor(((f - start) / FPS) * cps))));

const Heart = ({ size, color = C.heart }: { size: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "-0.12em" }}>
    <path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.9 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.8 0 5.8 4.1 4.3 7.4C19.5 16.4 12 21 12 21z" fill={color} />
  </svg>
);

const LogoMark = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox={LOGO.viewBox} fill="none">
    <rect width="32" height="32" rx={LOGO.fundo.rx} fill={LOGO.fundo.cor} />
    <path d={LOGO.pecaOuro.d} fill={LOGO.pecaOuro.cor} />
    <path d={LOGO.pecaVerde.d} fill={LOGO.pecaVerde.cor} />
  </svg>
);

const Spark = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />
  </svg>
);

const Check = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

const Cursor = ({ x, y, press }: { x: number; y: number; press: number }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `scale(${1 - 0.18 * press})`, transformOrigin: "4px 4px", zIndex: 20 }}>
    {press > 0.01 && (
      <div style={{ position: "absolute", left: 4 - 40, top: 4 - 40, width: 80, height: 80, borderRadius: 80, background: C.gold400, opacity: 0.35 * press }} />
    )}
    <svg width={56} height={56} viewBox="0 0 24 24" style={{ position: "relative", filter: "drop-shadow(0 4px 6px rgba(10,31,44,0.3))" }}>
      <path d="M4 3l15 7.5-6.5 1.8L9.5 19z" fill={C.white} stroke={C.ink900} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  </div>
);

// clique: 0 -> 1 -> 0 em ~0.4s
const clickAt = (f: number, at: number) => interpolate(f, [at - 4, at, at + 8], [0, 1, 0], clamp);

// Moldura de cena: texto à esquerda, ilustração à direita
const Scene = ({ dur, text, children, textTop }: { dur: number; text: ReactNode; children?: ReactNode; textTop?: ReactNode }) => {
  const f = useCurrentFrame();
  const inn = soft(f, 0, S(0.8));
  const out = interpolate(f, [dur - S(0.6), dur], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out) }}>
      <div style={{ position: "absolute", left: 130, top: 0, bottom: 0, width: 820, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36, transform: `translateY(${(1 - inn) * 24}px)` }}>
        {textTop}
        <div style={{ fontFamily: fraunces, fontSize: 68, lineHeight: 1.18, color: C.ink900, fontWeight: 600 }}>{text}</div>
      </div>
      <div style={{ position: "absolute", left: 1020, right: 100, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </AbsoluteFill>
  );
};

const Num = ({ n }: { n: number }) => (
  <div style={{ width: 96, height: 96, borderRadius: 96, background: C.ink900, color: C.gold300, fontFamily: fraunces, fontSize: 56, display: "grid", placeItems: "center" }}>{n}</div>
);

// ---------- Mock do chat ----------
const Panel = ({ children, opacity = 1, scale = 1 }: { children: ReactNode; opacity?: number; scale?: number }) => (
  <div style={{ width: 720, height: 860, background: C.white, borderRadius: 32, overflow: "hidden", boxShadow: "0 30px 60px -20px rgba(10,31,44,0.35)", border: `2px solid ${C.line}`, opacity, transform: `scale(${scale})`, transformOrigin: "bottom right", display: "flex", flexDirection: "column" }}>
    <div style={{ background: C.ink900, padding: "28px 34px", display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 60, height: 60, borderRadius: 60, background: "rgba(255,255,255,0.1)", display: "grid", placeItems: "center" }}><Spark size={34} color={C.gold300} /></div>
      <div style={{ fontFamily: geist, fontSize: 40, fontWeight: 600, color: C.white }}>Assistente</div>
    </div>
    <div style={{ flex: 1, padding: 30, display: "flex", flexDirection: "column", gap: 22, background: "#fcfbf7" }}>{children}</div>
  </div>
);

const Bubble = ({ text, me, p = 1, caret }: { text: string; me?: boolean; p?: number; caret?: boolean }) => (
  <div style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "88%", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, background: me ? C.ink900 : C.white, color: me ? C.white : C.ink900, border: me ? "none" : `2px solid ${C.line}`, borderRadius: 26, borderBottomRightRadius: me ? 8 : 26, borderTopLeftRadius: me ? 26 : 8, padding: "18px 26px", fontFamily: geist, fontSize: 36, lineHeight: 1.3 }}>
    {text}
    {caret && <span style={{ display: "inline-block", width: 3, height: 36, background: C.gold300, marginLeft: 4, verticalAlign: "-6px" }} />}
  </div>
);

const Btn = ({ label, kind, glow = 0 }: { label: string; kind: "sim" | "nao"; glow?: number }) => (
  <div style={{ flex: 1, textAlign: "center", padding: "16px 0", borderRadius: 18, fontFamily: geist, fontSize: 32, fontWeight: 600, background: kind === "sim" ? C.brand600 : C.white, color: kind === "sim" ? C.white : C.ink900, border: kind === "sim" ? "none" : `2px solid ${C.ink500}`, boxShadow: glow ? `0 0 0 ${8 * glow}px ${C.gold400}66` : "none" }}>
    {label}
  </div>
);

const Card = ({ lines, p = 1, hi = -1, hiP = 0, done = 0, glowSim = 0, glowNao = 0 }: { lines: string[]; p?: number; hi?: number; hiP?: number; done?: number; glowSim?: number; glowNao?: number }) => (
  <div style={{ background: C.white, borderRadius: 24, border: `3px solid ${C.gold400}`, opacity: p, transform: `translateY(${(1 - p) * 20}px)`, overflow: "hidden" }}>
    <div style={{ padding: "22px 28px 18px", fontFamily: geist, fontSize: 34, fontWeight: 600, color: C.ink900 }}>O que eu entendi:</div>
    <div style={{ borderTop: `3px dashed ${C.line}`, padding: "18px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: geist, fontSize: 32, color: C.ink700, borderRadius: 10, background: i === hi ? `rgba(224,184,74,${0.3 * hiP})` : "transparent", padding: "2px 8px" }}>
          <div style={{ width: 12, height: 12, borderRadius: 12, background: C.brand400, flexShrink: 0 }} />
          {l}
        </div>
      ))}
    </div>
    <div style={{ borderTop: `3px dashed ${C.line}`, padding: "20px 28px", display: "flex", gap: 18, position: "relative" }}>
      <Btn label="Sim, é isso" kind="sim" glow={glowSim} />
      <Btn label="Não, ajustar" kind="nao" glow={glowNao} />
      {done > 0 && (
        <div style={{ position: "absolute", inset: 0, background: C.brand50, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, opacity: done, fontFamily: geist, fontSize: 36, fontWeight: 600, color: C.brand600 }}>
          <div style={{ width: 64, height: 64, borderRadius: 64, background: C.brand600, display: "grid", placeItems: "center", transform: `scale(${done})` }}><Check size={40} color={C.white} /></div>
          Combinado!
        </div>
      )}
    </div>
  </div>
);

const PEDIDO = "Quero ver só os clientes que pagaram com cartão";
const LINHAS_1 = ["Mostrar os clientes", "Só quem pagou com cartão", "De todos os meses"];
const AJUSTE = "Só deste mês, por favor";
const LINHAS_2 = ["Mostrar os clientes", "Só quem pagou com cartão", "Só deste mês"];

// ---------- Cenas ----------
const Cena1 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f, fps, config: { damping: 200 } });
  const t1 = soft(f, S(0.8), S(1));
  const t2 = soft(f, S(2.2), S(1));
  const out = interpolate(f, [dur - S(0.6), dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 44, opacity: out }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, opacity: logo, transform: `scale(${0.9 + 0.1 * logo})` }}>
        <LogoMark size={96} />
        <div style={{ fontFamily: fraunces, fontSize: 64, color: C.ink900, fontWeight: 600 }}>Livingstone</div>
      </div>
      <div style={{ fontFamily: fraunces, fontSize: 120, color: C.ink900, fontWeight: 600, opacity: t1, transform: `translateY(${(1 - t1) * 20}px)` }}>
        Oi, Amanda! <Heart size={104} />
      </div>
      <div style={{ fontFamily: geist, fontSize: 56, color: C.ink700, textAlign: "center", maxWidth: 1400, lineHeight: 1.3, opacity: t2, transform: `translateY(${(1 - t2) * 20}px)` }}>
        Vou te mostrar como pedir o que você precisa.
      </div>
    </AbsoluteFill>
  );
};

const Cena2 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const clickF = S(4);
  const mv = soft(f, S(1.6), S(2.2));
  const cx = lerp(mv, 120, 560);
  const cy = lerp(mv, 200, 880);
  const open = soft(f, clickF + 4, S(0.9));
  const press = clickAt(f, clickF);
  return (
    <Scene dur={dur} textTop={<Num n={1} />} text={<>Clique na assistente,<br />no cantinho da tela.</>}>
      <div style={{ position: "relative", width: 760, height: 960, background: C.white, borderRadius: 28, border: `2px solid ${C.line}`, overflow: "hidden" }}>
        {/* "tela" simplificada */}
        <div style={{ height: 70, background: "#f1efe7", borderBottom: `2px solid ${C.line}` }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ margin: "40px 50px 0", height: 28, width: [520, 400, 600, 340][i], borderRadius: 14, background: "#efece2" }} />
        ))}
        <div style={{ position: "absolute", right: 30, bottom: 30, display: "flex", alignItems: "center", gap: 14, background: C.ink900, borderRadius: 60, padding: "14px 30px 14px 14px", opacity: 1 - open, boxShadow: press ? `0 0 0 ${10 * press}px ${C.gold400}55` : "none" }}>
          <div style={{ width: 56, height: 56, borderRadius: 56, background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center" }}><Spark size={32} color={C.gold300} /></div>
          <div style={{ fontFamily: geist, fontSize: 34, fontWeight: 600, color: C.white }}>Assistente</div>
        </div>
        <div style={{ position: "absolute", right: 20, bottom: 20, opacity: open }}>
          <div style={{ transform: "scale(0.98)", transformOrigin: "bottom right" }}>
            <Panel scale={0.85 + 0.15 * open}>
              <Bubble text="Oi! Como posso te ajudar?" p={soft(f, clickF + S(0.8))} />
            </Panel>
          </div>
        </div>
        <Cursor x={cx} y={cy} press={press} />
      </div>
    </Scene>
  );
};

const Cena3 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const start = S(1.5);
  const t = typed(f, start, PEDIDO, 16);
  return (
    <Scene dur={dur} textTop={<Num n={2} />} text={<>Escreva do seu jeito, como se falasse com uma pessoa.</>}>
      <Panel>
        <Bubble text="Oi! Como posso te ajudar?" />
        {t.length > 0 && <Bubble me text={t} caret={t.length < PEDIDO.length} />}
      </Panel>
    </Scene>
  );
};

const Cena4 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  return (
    <Scene dur={dur} textTop={<Num n={3} />} text={<>Ela conta o que entendeu e pergunta:<br /><span style={{ color: C.brand600 }}>É isso?</span></>}>
      <Panel>
        <Bubble me text={PEDIDO} />
        <Card lines={LINHAS_1} p={soft(f, S(1.2), S(1))} />
      </Panel>
    </Scene>
  );
};

const Cena5 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const c1 = S(1.6); // clica em "Não, ajustar"
  const typeStart = S(2.6);
  const t = typed(f, typeStart, AJUSTE, 16);
  const upd = S(4.6);
  const c2 = S(7.2); // clica em "Sim"
  const ajustado = f >= upd;
  // cursor: posição relativa ao painel (720x860)
  const m1 = soft(f, S(0.3), S(1.2));
  const m2 = soft(f, S(5.8), S(1.3));
  const naoX = 520, naoY = 790, simX = 200, simY = 790;
  const cx = m2 > 0 ? lerp(m2, naoX, simX) : lerp(m1, 640, naoX);
  const cy = m2 > 0 ? lerp(m2, naoY, simY) : lerp(m1, 500, naoY);
  return (
    <Scene dur={dur} text={<>Se não estiver certo, é só explicar de novo.<br /><span style={{ color: C.brand600 }}>Quando estiver certo, clique em Sim.</span></>}>
      <div style={{ position: "relative" }}>
        <Panel>
          {t.length > 0 && <Bubble me text={t} caret={t.length < AJUSTE.length} />}
          <div style={{ flex: 1 }} />
          <Card lines={ajustado ? LINHAS_2 : LINHAS_1} hi={ajustado ? 2 : -1} hiP={soft(f, upd, S(0.6))} glowNao={clickAt(f, c1)} glowSim={clickAt(f, c2)} done={soft(f, c2 + 6, S(0.6))} />
        </Panel>
        <div style={{ position: "absolute", left: 0, top: 0 }}>
          <Cursor x={cx} y={cy} press={Math.max(clickAt(f, c1), clickAt(f, c2))} />
        </div>
      </div>
    </Scene>
  );
};

const Cena6 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const fly = soft(f, S(1.2), S(1.8));
  const arrived = soft(f, S(3), S(0.6));
  const reply = soft(f, S(3.8), S(0.8));
  return (
    <Scene dur={dur} textTop={<Num n={4} />} text={<>Você também pode mandar uma planilha ou foto.<br /><span style={{ color: C.brand600 }}>Ela explica e aprende para a próxima vez.</span></>}>
      <div style={{ position: "relative" }}>
        <Panel>
          <div style={{ alignSelf: "flex-end", opacity: arrived, display: "flex", alignItems: "center", gap: 16, background: C.ink900, color: C.white, borderRadius: 24, padding: "16px 24px", fontFamily: geist, fontSize: 34 }}>
            <Sheet size={56} /> planilha.xlsx
          </div>
          <Bubble text="Recebi! Esta planilha mostra as vendas do mês. Vou lembrar disso." p={reply} />
        </Panel>
        <div style={{ position: "absolute", left: lerp(fly, -260, 420), top: lerp(fly, 700, 170) - Math.sin(fly * Math.PI) * 160, opacity: 1 - arrived, transform: `rotate(${lerp(fly, -12, 0)}deg)` }}>
          <Sheet size={150} />
        </div>
      </div>
    </Scene>
  );
};

const Sheet = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <path d="M10 4h20l10 10v30H10z" fill={C.white} stroke={C.brand600} strokeWidth={2.5} strokeLinejoin="round" />
    <path d="M30 4v10h10" fill="none" stroke={C.brand600} strokeWidth={2.5} strokeLinejoin="round" />
    <rect x="15" y="20" width="20" height="18" rx="1.5" fill={C.brand50} stroke={C.brand600} strokeWidth={2} />
    <path d="M15 26h20M15 32h20M23 20v18" stroke={C.brand600} strokeWidth={2} />
  </svg>
);

const Cena7 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fly = soft(f, S(1.2), S(2.4));
  const pop = spring({ frame: f - S(3.6), fps, config: { damping: 14 } });
  return (
    <Scene dur={dur} textTop={<Num n={5} />} text={<>Seu pedido chega para o Matheus.<br /><span style={{ color: C.brand600 }}>Ele prepara a melhoria e te avisa quando ficar pronta.</span></>}>
      <div style={{ position: "relative", width: 760, height: 600 }}>
        {/* trilha */}
        <svg width={760} height={600} style={{ position: "absolute", inset: 0 }}>
          <path d="M90 420 Q 380 140 640 300" fill="none" stroke={C.gold400} strokeWidth={5} strokeDasharray="4 18" strokeLinecap="round" opacity={0.7} />
        </svg>
        <div style={{ position: "absolute", left: 20, top: 360, width: 140, height: 120, borderRadius: 24, background: C.ink900, display: "grid", placeItems: "center" }}><Spark size={64} color={C.gold300} /></div>
        {/* envelope com coração */}
        <div style={{ position: "absolute", left: lerp(fly, 50, 560), top: lerp(fly, 330, 220) - Math.sin(fly * Math.PI) * 170, opacity: interpolate(fly, [0, 0.08, 0.92, 1], [0, 1, 1, 0], clamp) }}>
          <svg width={140} height={100} viewBox="0 0 56 40">
            <rect x="2" y="2" width="52" height="36" rx="5" fill={C.white} stroke={C.ink900} strokeWidth={2.5} />
            <path d="M3 5l25 18L53 5" fill="none" stroke={C.ink900} strokeWidth={2.5} strokeLinejoin="round" />
          </svg>
          <div style={{ position: "absolute", left: 50, top: 46 }}><Heart size={40} /></div>
        </div>
        {/* avatar Matheus */}
        <div style={{ position: "absolute", left: 520, top: 210, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative", width: 200, height: 200, borderRadius: 200, background: C.gold300, border: `6px solid ${C.white}`, boxShadow: "0 16px 30px -12px rgba(10,31,44,0.35)", display: "grid", placeItems: "center", fontFamily: fraunces, fontSize: 96, color: C.ink900 }}>
            M
            <div style={{ position: "absolute", right: -10, top: -10, transform: `scale(${Math.max(0, pop)})` }}><Heart size={72} /></div>
          </div>
          <div style={{ fontFamily: geist, fontSize: 44, fontWeight: 600, color: C.ink900 }}>Matheus</div>
        </div>
      </div>
    </Scene>
  );
};

const Cena8 = ({ dur }: { dur: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const split = S(5);
  const lock = spring({ frame: f, fps, config: { damping: 200 } });
  const close = soft(f, split - S(0.3), S(0.6));
  const fim = soft(f, split + S(0.3), S(0.9));
  return (
    <AbsoluteFill>
      <div style={{ opacity: 1 - close, position: "absolute", inset: 0 }}>
        <Scene dur={dur + 999} text={<>Suas conversas ficam guardadas com cuidado, e números de documentos ficam escondidos.</>}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, opacity: lock, transform: `translateY(${(1 - lock) * 20}px)` }}>
            <svg width={260} height={300} viewBox="0 0 52 60">
              <path d="M14 26V18a12 12 0 0 1 24 0v8" fill="none" stroke={C.ink700} strokeWidth={4.5} strokeLinecap="round" />
              <rect x="6" y="26" width="40" height="30" rx="8" fill={C.brand600} />
              <circle cx="26" cy="39" r="4" fill={C.gold300} />
              <path d="M26 42v6" stroke={C.gold300} strokeWidth={3.5} strokeLinecap="round" />
            </svg>
            <div style={{ fontFamily: geist, fontSize: 48, letterSpacing: 6, color: C.ink700, background: C.white, borderRadius: 18, padding: "14px 30px", border: `2px solid ${C.line}` }}>CPF ***.***.***-**</div>
          </div>
        </Scene>
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40, opacity: fim }}>
        <LogoMark size={110} />
        <div style={{ fontFamily: fraunces, fontSize: 110, color: C.ink900, fontWeight: 600, transform: `translateY(${(1 - fim) * 20}px)` }}>
          Pronto! É só conversar. <Heart size={96} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const CENAS: { de: number; ate: number; C: (p: { dur: number }) => ReactNode }[] = [
  { de: 0, ate: 6, C: Cena1 },
  { de: 6, ate: 16, C: Cena2 },
  { de: 16, ate: 28, C: Cena3 },
  { de: 28, ate: 40, C: Cena4 },
  { de: 40, ate: 50, C: Cena5 },
  { de: 50, ate: 58, C: Cena6 },
  { de: 58, ate: 67, C: Cena7 },
  { de: 67, ate: 75, C: Cena8 },
];

export const AmandaComoUsar = () => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 80% 20%, #ffffff 0%, ${C.creme} 60%)` }}>
    {CENAS.map(({ de, ate, C: Comp }, i) => (
      <Sequence key={i} from={S(de)} durationInFrames={S(ate - de)}>
        <Comp dur={S(ate - de)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
