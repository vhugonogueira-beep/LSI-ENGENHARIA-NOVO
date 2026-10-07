import { useMemo, useState, FormEvent } from 'react';
import { AlertTriangle, ArrowRight, DraftingCompass, Eye, EyeOff, Lock, Mail, RadioTower, Wrench } from 'lucide-react';
import { LOGO_MARCA_B64 } from '../assets/logoMarca';

// ─────────────────────────────────────────────────────────────────────────────
// Tela de acesso (redesenho de 06/10/2026, a partir da arte de referência da
// LS Office): noite azul-marinho, a bússola da marca à esquerda, o cartão de
// vidro no centro e, à direita, painéis diagonais com o que a empresa faz —
// torre de telecom sobre a cidade e uma obra em andamento.
//
// A cena é toda vetorial (sem foto), desenhada aqui. O único movimento é a
// agulha da bússola se acomodando ao abrir e as luzes de balizamento da torre;
// ambos param com "reduzir movimento". A tela é sempre escura, nos dois temas:
// é a vitrine da marca, não uma tela de trabalho.
// ─────────────────────────────────────────────────────────────────────────────

interface LoginProps {
    onLogin: (token: string, user: { nome: string; email: string; role: string }) => void;
}

export default function Login({ onLogin }: LoginProps) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [mostrarSenha, setMostrarSenha] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setErro('');
        setCarregando(true);
        try {
            const resp = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha }),
            });
            const contentType = resp.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await resp.json()
                : null;
            if (!resp.ok) {
                setErro(data?.error || `Falha no servidor (${resp.status})`);
                return;
            }
            if (!data?.token || !data?.user) {
                setErro('Resposta inválida do servidor. Tente novamente.');
                return;
            }
            localStorage.setItem('ls_auth_token', data.token);
            localStorage.setItem('ls_auth_user', JSON.stringify(data.user));
            onLogin(data.token, data.user);
        } catch {
            setErro('Erro ao conectar ao servidor. Verifique sua conexão.');
        } finally {
            setCarregando(false);
        }
    }

    return (
        <div className="lg-raiz">
            <style>{CSS}</style>

            {/* Cena de fundo — decorativa. */}
            <div className="lg-cena" aria-hidden="true">
                <div className="lg-rosa"><RosaDosVentos /></div>
                <div className="lg-painel lg-painel-torre"><div className="lg-painel-in"><CenaTorre /></div></div>
                <div className="lg-painel lg-painel-obra"><div className="lg-painel-in"><CenaObra /></div></div>
                <span className="lg-feixe lg-feixe-azul" />
                <span className="lg-feixe lg-feixe-vermelho" />
                <div className="lg-chao" />
            </div>

            <aside className="lg-mote">
                <p className="lg-mote-frase">
                    Soluções que conectam<br />projetos a <strong>grandes conquistas</strong>
                </p>
                <span className="lg-filete" />
                <ul className="lg-pilares">
                    <li><RadioTower size={26} strokeWidth={1.4} aria-hidden /><span>Implantação</span></li>
                    <li><Wrench size={26} strokeWidth={1.4} aria-hidden /><span>Operação</span></li>
                    <li><DraftingCompass size={26} strokeWidth={1.4} aria-hidden /><span>Projetos</span></li>
                </ul>
            </aside>

            <main className="lg-cartao">
                <header className="lg-marca">
                    <img src={LOGO_MARCA_B64} alt="" className="lg-logo" />
                    <div className="lg-nome">LS OFFICE</div>
                    <div className="lg-ramo">Serviços de telecom e construções</div>
                    <span className="lg-filete lg-filete-centro" />
                    <h1 className="lg-titulo">LS Office Rumo</h1>
                    <p className="lg-sub">Sistema de orçamentação de engenharia</p>
                </header>

                <form onSubmit={handleSubmit} noValidate={false}>
                    <label htmlFor="login-email" className="lg-rotulo">E-mail</label>
                    <div className={`lg-campo ${erro ? 'lg-campo-erro' : ''}`}>
                        <Mail size={17} aria-hidden className="lg-icone" />
                        <input
                            id="login-email" type="email" autoComplete="username" required autoFocus
                            value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="seu.nome@lsoffice.com.br"
                        />
                    </div>

                    <label htmlFor="login-senha" className="lg-rotulo">Senha</label>
                    <div className={`lg-campo ${erro ? 'lg-campo-erro' : ''}`}>
                        <Lock size={17} aria-hidden className="lg-icone" />
                        <input
                            id="login-senha" autoComplete="current-password" required
                            type={mostrarSenha ? 'text' : 'password'}
                            value={senha} onChange={e => setSenha(e.target.value)}
                            placeholder="Sua senha"
                        />
                        <button
                            type="button" className="lg-olho"
                            onClick={() => setMostrarSenha(v => !v)}
                            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                            title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                            aria-pressed={mostrarSenha}
                        >
                            {mostrarSenha ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                        </button>
                    </div>

                    {erro && (
                        <div role="alert" className="lg-erro">
                            <AlertTriangle size={16} aria-hidden />
                            <span>{erro}</span>
                        </div>
                    )}

                    <button type="submit" className="lg-entrar" disabled={carregando}>
                        {carregando
                            ? <><span className="lg-giro" aria-hidden /> Entrando…</>
                            : <><span>Entrar</span><ArrowRight size={18} aria-hidden className="lg-seta" /></>}
                    </button>
                </form>

                <p className="lg-rodape">
                    Acesso restrito a colaboradores LS Office.<br />
                    Em caso de dúvidas, contate o administrador.
                </p>
            </main>
        </div>
    );
}

// ── Bússola ──────────────────────────────────────────────────────────────────
// Rosa de oito pontas como a da marca: cada ponta com uma face clara e uma
// escura, anéis com marcação de grau e a agulha vermelha e prata por cima.

function RosaDosVentos() {
    const pontas = useMemo(() => {
        const lista: { ang: number; comp: number; larg: number }[] = [];
        for (let i = 0; i < 8; i++) lista.push({ ang: i * 45, comp: i % 2 ? 165 : 248, larg: i % 2 ? 26 : 40 });
        return lista;
    }, []);
    const marcas = useMemo(() => Array.from({ length: 72 }, (_, i) => i * 5), []);
    return (
        <svg viewBox="-300 -300 600 600" className="lg-rosa-svg">
            <defs>
                <radialGradient id="lgHalo" r="0.5">
                    <stop offset="0" stopColor="#2F86FF" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#2F86FF" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="lgAgulhaN" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#8E1018" />
                    <stop offset="1" stopColor="#FF3B44" />
                </linearGradient>
                <linearGradient id="lgAgulhaS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#F4F7FB" />
                    <stop offset="1" stopColor="#7D8BA0" />
                </linearGradient>
            </defs>
            <circle r="300" fill="url(#lgHalo)" />
            <circle r="286" fill="none" stroke="#3E7BD6" strokeOpacity="0.45" strokeWidth="1.5" />
            <circle r="270" fill="none" stroke="#3E7BD6" strokeOpacity="0.25" strokeWidth="1" />
            <circle r="212" fill="none" stroke="#3E7BD6" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 6" />
            {marcas.map(g => {
                const longa = g % 45 === 0;
                const r1 = longa ? 252 : 262;
                const rad = (g * Math.PI) / 180;
                return <line key={g} x1={Math.sin(rad) * r1} y1={-Math.cos(rad) * r1} x2={Math.sin(rad) * 270} y2={-Math.cos(rad) * 270}
                    stroke="#6FA6F0" strokeOpacity={longa ? 0.8 : 0.35} strokeWidth={longa ? 2 : 1} />;
            })}
            <text x="0" y="-232" textAnchor="middle" className="lg-rosa-n">N</text>
            {pontas.map(p => (
                <g key={p.ang} transform={`rotate(${p.ang})`}>
                    <polygon points={`0,${-p.comp} ${-p.larg / 2},0 0,0`} fill={p.ang % 90 ? '#1C3F78' : '#2B5DAA'} />
                    <polygon points={`0,${-p.comp} ${p.larg / 2},0 0,0`} fill={p.ang % 90 ? '#0E2448' : '#163A70'} />
                </g>
            ))}
            <circle r="46" fill="#0B1F3F" stroke="#6FA6F0" strokeOpacity="0.5" strokeWidth="2" />
            <g className="lg-agulha">
                <polygon points="0,-205 -22,0 22,0" fill="url(#lgAgulhaN)" />
                <polygon points="0,-205 0,0 22,0" fill="#000" fillOpacity="0.18" />
                <polygon points="0,150 -22,0 22,0" fill="url(#lgAgulhaS)" />
                <polygon points="0,150 0,0 22,0" fill="#000" fillOpacity="0.15" />
                <circle r="20" fill="#E8EEF7" />
                <circle r="13" fill="#0B1F3F" />
                <circle r="6" fill="#2F86FF" />
            </g>
        </svg>
    );
}

// Gerador determinístico: a cidade sai igual a cada abertura.
function semente(n: number) {
    let s = n;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ── Torre de telecom sobre a cidade ──────────────────────────────────────────

function CenaTorre() {
    const predios = useMemo(() => {
        const r = semente(7);
        const lista: { x: number; w: number; h: number; janelas: { x: number; y: number }[] }[] = [];
        let x = -10;
        while (x < 910) {
            const w = 18 + r() * 34;
            const h = 30 + r() * (x > 260 && x < 560 ? 190 : 95);
            const janelas: { x: number; y: number }[] = [];
            for (let jy = 8; jy < h - 6; jy += 9) for (let jx = 4; jx < w - 4; jx += 7) if (r() > 0.62) janelas.push({ x: x + jx, y: 600 - h + jy });
            lista.push({ x, w, h, janelas });
            x += w + 2 + r() * 6;
        }
        return lista;
    }, []);
    const estrelas = useMemo(() => {
        const r = semente(3);
        return Array.from({ length: 60 }, () => ({ x: r() * 900, y: r() * 330, o: 0.2 + r() * 0.6 }));
    }, []);
    // Treliça: duas pernas que afinam até o topo, travadas em X.
    const niveis = Array.from({ length: 12 }, (_, i) => i);
    const perna = (t: number, lado: 1 | -1) => 470 + lado * (46 - 38 * t);
    const altura = (t: number) => 600 - t * 470;
    return (
        <svg viewBox="0 0 900 640" preserveAspectRatio="xMaxYMax slice">
            <defs>
                <linearGradient id="lgCeuT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#081428" />
                    <stop offset="0.55" stopColor="#14315C" />
                    <stop offset="0.8" stopColor="#3D4F7E" />
                    <stop offset="0.95" stopColor="#8C6A7C" />
                </linearGradient>
                <linearGradient id="lgVia" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#FFB45A" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#FFC27A" />
                    <stop offset="1" stopColor="#FFB45A" stopOpacity="0" />
                </linearGradient>
            </defs>
            <rect width="900" height="640" fill="url(#lgCeuT)" />
            {estrelas.map((e, i) => <circle key={i} cx={e.x} cy={e.y} r="1" fill="#DCE8FF" opacity={e.o} />)}
            {predios.map((p, i) => (
                <g key={i}>
                    <rect x={p.x} y={600 - p.h} width={p.w} height={p.h + 60} fill="#0A1730" />
                    {p.janelas.map((j, k) => <rect key={k} x={j.x} y={j.y} width="2.4" height="3" fill="#FFD58A" opacity="0.75" />)}
                </g>
            ))}
            <path d="M-10 618 C 240 596, 480 640, 910 604" stroke="url(#lgVia)" strokeWidth="3" fill="none" opacity="0.9" />
            <path d="M-10 632 C 300 610, 560 650, 910 622" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
            {/* torre */}
            <g transform="translate(236 -18) scale(1.02)">
            <g stroke="#0E1A2C" strokeWidth="3" fill="none">
                <line x1={perna(0, -1)} y1={altura(0)} x2={perna(1, -1)} y2={altura(1)} />
                <line x1={perna(0, 1)} y1={altura(0)} x2={perna(1, 1)} y2={altura(1)} />
                {niveis.map(i => {
                    const t0 = i / 12, t1 = (i + 1) / 12;
                    return (
                        <g key={i} strokeWidth="1.6">
                            <line x1={perna(t0, -1)} y1={altura(t0)} x2={perna(t1, 1)} y2={altura(t1)} />
                            <line x1={perna(t0, 1)} y1={altura(t0)} x2={perna(t1, -1)} y2={altura(t1)} />
                            <line x1={perna(t1, -1)} y1={altura(t1)} x2={perna(t1, 1)} y2={altura(t1)} />
                        </g>
                    );
                })}
            </g>
            <line x1="470" y1="130" x2="470" y2="40" stroke="#0E1A2C" strokeWidth="3" />
            {/* antenas de painel e enlaces de micro-ondas */}
            <g fill="#101E33" stroke="#2A3F5E" strokeWidth="1">
                <rect x="446" y="140" width="9" height="34" rx="2" />
                <rect x="485" y="140" width="9" height="34" rx="2" />
                <rect x="465.5" y="136" width="9" height="34" rx="2" />
                <rect x="440" y="196" width="8" height="28" rx="2" />
                <rect x="492" y="196" width="8" height="28" rx="2" />
                <circle cx="438" cy="262" r="15" />
                <circle cx="503" cy="300" r="12" />
                <circle cx="444" cy="335" r="10" />
            </g>
            {/* balizamento noturno */}
            <circle cx="470" cy="38" r="5" className="lg-baliza" />
            <circle cx="452" cy="232" r="3.5" className="lg-baliza lg-baliza-2" />
            <circle cx="489" cy="232" r="3.5" className="lg-baliza lg-baliza-2" />
            <circle cx="436" cy="420" r="3.5" className="lg-baliza lg-baliza-3" />
            <circle cx="505" cy="420" r="3.5" className="lg-baliza lg-baliza-3" />
            </g>
        </svg>
    );
}

// ── Obra em andamento ────────────────────────────────────────────────────────

function CenaObra() {
    const andares = Array.from({ length: 7 }, (_, i) => i);
    const vaos = Array.from({ length: 8 }, (_, i) => i);
    return (
        <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
            <defs>
                <linearGradient id="lgCeuO" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#13284D" />
                    <stop offset="0.6" stopColor="#4A4E78" />
                    <stop offset="0.85" stopColor="#C9764A" />
                    <stop offset="1" stopColor="#F2A65A" />
                </linearGradient>
                <radialGradient id="lgSol" cx="0.62" cy="0.9" r="0.35">
                    <stop offset="0" stopColor="#FFE2A8" stopOpacity="0.95" />
                    <stop offset="1" stopColor="#FFB45A" stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width="600" height="400" fill="url(#lgCeuO)" />
            <rect width="600" height="400" fill="url(#lgSol)" />
            <path d="M0 330 L120 300 L210 318 L330 290 L460 312 L600 296 L600 400 L0 400 Z" fill="#1A2440" opacity="0.8" />
            {/* estrutura de concreto: pilares e lajes */}
            <g stroke="#0C1424" strokeWidth="5">
                {andares.map(i => <line key={`l${i}`} x1="250" y1={360 - i * 32} x2="530" y2={360 - i * 32} />)}
                {vaos.map(i => <line key={`p${i}`} x1={250 + i * 40} y1="360" x2={250 + i * 40} y2={360 - 6 * 32} strokeWidth="4" />)}
            </g>
            {/* grua */}
            <g stroke="#0C1424" fill="none">
                <line x1="180" y1="380" x2="180" y2="90" strokeWidth="6" />
                {Array.from({ length: 14 }, (_, i) => (
                    <line key={i} x1="174" y1={380 - i * 21} x2="186" y2={380 - (i + 1) * 21} strokeWidth="1.5" />
                ))}
                <line x1="60" y1="96" x2="470" y2="96" strokeWidth="5" />
                <line x1="180" y1="60" x2="60" y2="96" strokeWidth="1.5" />
                <line x1="180" y1="60" x2="470" y2="96" strokeWidth="1.5" />
                <line x1="180" y1="90" x2="180" y2="56" strokeWidth="5" />
                <line x1="395" y1="96" x2="395" y2="190" strokeWidth="1.5" />
            </g>
            <rect x="66" y="98" width="34" height="18" fill="#0C1424" />
            <rect x="383" y="190" width="24" height="10" fill="#0C1424" />
            <circle cx="180" cy="56" r="3.5" className="lg-baliza" />
        </svg>
    );
}

// ── Estilo ───────────────────────────────────────────────────────────────────

const CSS = `
.lg-raiz {
  --noite: #050C1A; --marinho: #0B1F3F; --sinal: #2F86FF; --bussola: #E0262F;
  --aco: #E8EEF7; --nevoa: #8FA3BF;
  position: relative; min-height: 100vh; overflow: hidden; isolation: isolate;
  display: grid; grid-template-columns: minmax(0,1fr) minmax(360px,440px) minmax(0,1fr);
  align-items: center; gap: 32px; padding: 32px clamp(24px,4vw,64px);
  background: radial-gradient(120% 90% at 22% 40%, #0E2650 0%, var(--noite) 60%);
  color: var(--aco); font-family: 'IBM Plex Sans', system-ui, sans-serif;
}

/* cena */
.lg-cena { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.lg-rosa { position: absolute; left: -10vw; top: 50%; width: min(80vh, 44vw); aspect-ratio: 1; transform: translateY(-66%); opacity: .9; }
.lg-rosa-svg { width: 100%; height: 100%; overflow: visible; }
.lg-rosa-n { fill: #9CC2FF; font: 600 22px 'IBM Plex Sans', sans-serif; }
.lg-agulha { transform-origin: 0 0; transform: rotate(24deg); animation: lg-norte 2.4s cubic-bezier(.2,.8,.2,1) .2s both; }
@keyframes lg-norte {
  0% { transform: rotate(-80deg); } 55% { transform: rotate(38deg); } 75% { transform: rotate(18deg); }
  90% { transform: rotate(27deg); } 100% { transform: rotate(24deg); }
}
/* painéis diagonais: o recorte fica no filho; o brilho da borda é a sombra do pai */
.lg-painel { position: absolute; filter: drop-shadow(-1.5px 0 0 rgba(110,170,255,.9)) drop-shadow(0 0 14px rgba(47,134,255,.45)); }
.lg-painel-in { position: absolute; inset: 0; overflow: hidden; }
.lg-painel-in svg { width: 100%; height: 100%; display: block; }
.lg-painel-in::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(5,12,26,.75) 0%, transparent 35%); }
.lg-painel-torre { right: 0; top: 0; width: 42vw; height: 62vh; }
.lg-painel-torre .lg-painel-in { clip-path: polygon(34% 0, 100% 0, 100% 100%, 0 100%); }
.lg-painel-obra { right: 0; bottom: 0; width: 34vw; height: 36vh; }
.lg-painel-obra .lg-painel-in { clip-path: polygon(30% 0, 100% 0, 100% 100%, 0 100%); }
.lg-feixe { position: absolute; height: 2px; transform-origin: left center; filter: blur(.4px); }
.lg-feixe-azul { left: 56vw; top: 70vh; width: 26vw; transform: rotate(-38deg); background: linear-gradient(90deg, transparent, rgba(80,150,255,.9) 40%, transparent); }
.lg-feixe-vermelho { left: 54vw; top: 80vh; width: 20vw; transform: rotate(-30deg); background: linear-gradient(90deg, transparent, rgba(224,38,47,.85) 50%, transparent); }
.lg-chao { position: absolute; left: 0; right: 0; bottom: 0; height: 18vh; background: linear-gradient(0deg, rgba(47,134,255,.10), transparent); }
.lg-baliza { fill: #FF3B44; filter: drop-shadow(0 0 6px #FF3B44); animation: lg-pisca 2.6s ease-in-out infinite; }
.lg-baliza-2 { animation-delay: .9s; } .lg-baliza-3 { animation-delay: 1.7s; }
@keyframes lg-pisca { 0%,100% { opacity: 1; } 50% { opacity: .25; } }

/* mote */
.lg-mote { grid-column: 1; align-self: end; margin-bottom: 5vh; max-width: 500px; position: relative; }
.lg-mote-frase { margin: 0; font-size: clamp(24px, 2.1vw, 34px); line-height: 1.14; font-weight: 300; letter-spacing: .01em; text-transform: uppercase; color: var(--aco); text-shadow: 0 2px 18px rgba(5,12,26,.9); }
.lg-mote-frase strong { display: block; font-weight: 700; color: #3D93FF; }
.lg-filete { display: block; width: 44px; height: 2px; margin: 22px 0; background: var(--bussola); box-shadow: 0 0 10px rgba(224,38,47,.6); }
.lg-filete-centro { margin: 16px auto 18px; width: 120px; background: linear-gradient(90deg, transparent, var(--bussola), transparent); }
.lg-pilares { list-style: none; margin: 0; padding: 0; display: flex; }
.lg-pilares li { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 0 22px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: #C9D6EA; }
.lg-pilares li:first-child { padding-left: 0; }
.lg-pilares li + li { border-left: 1px solid rgba(143,163,191,.35); }
.lg-pilares svg { color: #6FA6F0; }

/* cartão de vidro */
.lg-cartao {
  grid-column: 2; position: relative; padding: 34px 36px 26px; border-radius: 22px;
  background: linear-gradient(180deg, rgba(20,44,86,.62), rgba(8,20,42,.72));
  border: 1px solid rgba(96,160,255,.55);
  box-shadow: 0 0 0 1px rgba(255,255,255,.04) inset, 0 0 38px rgba(47,134,255,.28), 0 30px 60px rgba(0,0,0,.45);
  backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%);
}
.lg-marca { text-align: center; margin-bottom: 26px; }
.lg-logo { display: block; margin: 0 auto; width: 78px; height: 78px; object-fit: contain; filter: drop-shadow(0 0 16px rgba(47,134,255,.55)); }
.lg-nome { margin-top: 6px; font-size: 30px; font-weight: 700; letter-spacing: .14em; color: #F4F7FB; text-shadow: 0 0 18px rgba(120,170,255,.35); }
.lg-ramo { margin-top: 2px; font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; color: #A9BCD8; }
.lg-titulo { margin: 0; font-size: 22px; font-weight: 700; color: #FFFFFF; }
.lg-sub { margin: 6px 0 0; font-size: 13px; color: var(--nevoa); }

.lg-rotulo { display: block; margin: 0 0 7px; font-size: 12.5px; font-weight: 600; color: #C9D6EA; }
.lg-campo { position: relative; display: flex; align-items: center; height: 46px; margin-bottom: 16px; border-radius: 10px;
  background: rgba(5,14,30,.55); border: 1px solid rgba(96,160,255,.38); transition: border-color .15s, box-shadow .15s; }
.lg-campo:focus-within { border-color: #4C9AFF; box-shadow: 0 0 0 3px rgba(47,134,255,.25), 0 0 18px rgba(47,134,255,.25); }
.lg-campo-erro { border-color: rgba(255,90,96,.75); }
.lg-icone { position: absolute; left: 14px; color: #7FA4D6; pointer-events: none; }
.lg-campo input { flex: 1; height: 100%; min-width: 0; padding: 0 44px 0 42px; border: 0; outline: 0; background: transparent; color: #F4F7FB; font: 400 15px 'IBM Plex Sans', sans-serif; }
.lg-campo input::placeholder { color: #5D7392; }
.lg-campo input:-webkit-autofill { -webkit-box-shadow: 0 0 0 40px #0A1830 inset !important; -webkit-text-fill-color: #F4F7FB !important; caret-color: #F4F7FB; }
.lg-olho { position: absolute; right: 8px; display: inline-flex; padding: 6px; border: 0; border-radius: 6px; background: none; color: #8FA9CF; cursor: pointer; }
.lg-olho:hover { color: #FFFFFF; }
.lg-olho:focus-visible, .lg-entrar:focus-visible { outline: 2px solid #9CC2FF; outline-offset: 2px; }

.lg-erro { display: flex; gap: 8px; align-items: flex-start; margin: 2px 0 16px; padding: 10px 12px; border-radius: 10px;
  background: rgba(224,38,47,.14); border: 1px solid rgba(255,90,96,.55); color: #FFB3B6; font-size: 13px; line-height: 1.4; }
.lg-erro svg { flex-shrink: 0; margin-top: 1px; }

.lg-entrar { position: relative; width: 100%; height: 50px; margin-top: 6px; border: 1px solid rgba(140,190,255,.7); border-radius: 12px;
  display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;
  background: linear-gradient(180deg, #2F8BFF, #1460D8); color: #FFFFFF; font: 600 16px 'IBM Plex Sans', sans-serif;
  box-shadow: 0 0 24px rgba(47,134,255,.55), 0 1px 0 rgba(255,255,255,.35) inset; transition: box-shadow .15s, filter .15s; }
.lg-entrar:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 0 32px rgba(47,134,255,.75), 0 1px 0 rgba(255,255,255,.35) inset; }
.lg-entrar:disabled { cursor: wait; filter: saturate(.6) brightness(.85); }
.lg-seta { position: absolute; right: 18px; }
.lg-giro { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); border-top-color: #FFF; animation: lg-gira .7s linear infinite; }
@keyframes lg-gira { to { transform: rotate(360deg); } }

.lg-rodape { margin: 22px 0 0; padding-top: 16px; border-top: 1px solid rgba(96,160,255,.18); text-align: center; font-size: 11.5px; line-height: 1.55; color: #8FA3BF; }

/* telas menores: sai a cena lateral, a bússola vira marca d'água */
@media (max-width: 1100px) {
  .lg-raiz { grid-template-columns: 1fr; justify-items: center; }
  .lg-mote, .lg-painel, .lg-feixe { display: none; }
  .lg-cartao { grid-column: 1; width: 100%; max-width: 440px; }
  .lg-rosa { left: 50%; width: 120vmin; transform: translate(-50%, -50%); opacity: .35; }
}
@media (max-width: 480px) {
  .lg-raiz { padding: 20px 16px; }
  .lg-cartao { padding: 28px 22px 22px; }
  .lg-nome { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .lg-agulha, .lg-baliza, .lg-giro { animation: none; }
}
`;
