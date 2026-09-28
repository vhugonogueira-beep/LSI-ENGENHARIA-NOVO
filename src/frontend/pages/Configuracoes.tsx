import React, { useState, useEffect, useCallback } from "react";
import { authFetch } from "../lib/authFetch";

// ─────────────────────────────────────────────────────────────────────────────
// Configurações — o cadastro da própria LS Office.
//
// É daqui que saem o CNPJ, a inscrição estadual, o endereço fiscal e o logo que
// aparecem nos documentos (cronograma, PV, e-mail de faturamento) e nas notas.
// As contas de recebimento ficam aqui porque são dado da empresa, não da obra.
// ─────────────────────────────────────────────────────────────────────────────

// Esta tela nasceu com uma paleta própria em hex, herdada do monólito, e por
// isso destoava das telas novas (Clientes, Meu Perfil) que usam os tokens do
// tema. Os valores abaixo passaram a apontar para as mesmas CSS variables do
// Tailwind (src/frontend/index.css), então card, borda, input e tipografia
// ficam idênticos ao resto do sistema sem reescrever o JSX.
const T = {
  bg1: "hsl(var(--background))",
  bg2: "hsl(var(--card))",
  bg3: "hsl(var(--secondary))",
  brSub: "hsl(var(--border))",
  brBase: "hsl(var(--border))",
  txPri: "hsl(var(--foreground))",
  txSec: "hsl(var(--muted-foreground))",
  txMut: "hsl(var(--muted-foreground))",
  txDis: "hsl(var(--muted-foreground))",
  blue: "hsl(var(--primary))",
  // Acentos semânticos: já são exatamente as cores emerald/amber/red/violet-400
  // do Tailwind usadas nas outras telas.
  green: "#34d399", amber: "#fbbf24", red: "#f87171", purple: "#a78bfa",
};

// Medidas alinhadas com as classes usadas nas telas em Tailwind: card
// `rounded-xl` (12px), input/botão `rounded-lg` (8px) e altura `h-9` (36px).
const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "16px 18px" } as React.CSSProperties,
  input: { height: 36, padding: "0 12px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", width: "100%", boxSizing: "border-box" } as React.CSSProperties,
  label: { fontSize: 10, color: T.txMut, display: "block", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" } as React.CSSProperties,
  btn: { height: 36, padding: "0 16px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, cursor: "pointer", color: T.txPri, fontWeight: 700 } as React.CSSProperties,
  btnBlue: { background: T.blue, color: "hsl(var(--primary-foreground))", borderColor: T.blue } as React.CSSProperties,
};

// S.input tem altura fixa de 36px para casar com o `h-9` das telas em Tailwind.
// Textarea precisa crescer, então recompõe a altura e o padding vertical.
const areaTexto = (minHeight: number): React.CSSProperties =>
  ({ ...S.input, height: "auto", padding: "8px 12px", minHeight, resize: "vertical" });

const REGIMES = [
  { id: "", rotulo: "— selecione —" },
  { id: "SIMPLES", rotulo: "Simples Nacional" },
  { id: "LUCRO_PRESUMIDO", rotulo: "Lucro Presumido" },
  { id: "LUCRO_REAL", rotulo: "Lucro Real" },
];
const TIPOS_CONTA = ["CORRENTE", "POUPANCA"];
const TIPOS_PIX = ["", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"];

interface Conta {
  id: string; banco: string; codigo_banco: string | null; agencia: string | null;
  conta: string | null; tipo: string; titular: string | null; cnpj_titular: string | null;
  pix_tipo: string | null; pix_chave: string | null; principal: boolean; ativa: boolean;
  observacoes: string | null;
}

// Tipo mantido somente para leitura do componente legado abaixo. O cadastro de
// operadoras não é mais exposto em Configurações; foi movido para Clientes.
interface Operadora { id: string; nome: string; sigla: string | null; logo_url: string | null; ativa: boolean; }

interface Cartao {
  id: string; bandeira: string; final: string; apelido: string | null; titular: string | null;
  limite: number | null; dia_fechamento: number | null; ativo: boolean;
}

const ROUTING_LABELS: Record<string, string> = {
  PAYMENT_REQUEST: 'Solicitação de pagamento',
  PAYMENT_FORMALIZATION: 'Formalização de pagamento',
  BILLING: 'Faturamento',
};

/**
 * Roteamento dos e-mails gerados pelo LSI.
 *
 * É aqui — e só aqui — que se define quem recebe cada tipo de e-mail. Não há
 * destinatário embutido no código: um e-mail de pagamento indo para a pessoa
 * errada é pior do que um "Para" vazio, então a prévia avisa em âmbar quando o
 * perfil ainda não foi cadastrado. A assinatura continua sendo individual, em
 * Meu Perfil, e não passa por esta tela.
 */
function ConfiguracaoComunicacao({ onError, notify }: { onError: (value: string) => void; notify: (value: string) => void }) {
  const [perfis, setPerfis] = useState<any[]>([]);
  const [salvando, setSalvando] = useState("");

  useEffect(() => {
    authFetch("/api/email-config/routing")
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        return body;
      })
      .then(setPerfis)
      .catch(e => onError(e.message));
  }, [onError]);

  // O campo é texto livre separado por ponto e vírgula; o backend revalida e
  // recusa endereço malformado na gravação.
  const editar = (tipo: string, campo: "para" | "cc", valor: string) =>
    setPerfis(atual => atual.map(item => item.tipo === tipo
      ? { ...item, [campo]: valor.split(/[;,\n]/).map(v => v.trim()).filter(Boolean) }
      : item));

  async function salvar(item: any) {
    setSalvando(item.tipo);
    onError("");
    const resposta = await authFetch(`/api/email-config/routing/${item.tipo}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para: item.para, cc: item.cc }),
    });
    const body = await resposta.json();
    setSalvando("");
    if (!resposta.ok) return onError(body.error || "Erro ao salvar roteamento");

    setPerfis(atual => atual.map(p => p.tipo === item.tipo ? { ...p, para: body.para, cc: body.cc } : p));
    notify("Destinatários salvos.");
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={S.card}>
        <Titulo>Roteamento dos e-mails</Titulo>
        <p style={{ color: T.txMut, fontSize: 11, lineHeight: 1.5, margin: 0 }}>
          Cadastre vários destinatários em Para e CC, separados por ponto e vírgula.
          A assinatura continua individual, em Meu Perfil.
        </p>
      </div>

      {perfis.map(item => (
        <div key={item.tipo} style={S.card}>
          <Titulo>{ROUTING_LABELS[item.tipo] || item.tipo}</Titulo>
          {item.para.length === 0 && (
            <p style={{ color: T.amber, fontSize: 11, margin: "0 0 8px" }}>
              Sem destinatário: os e-mails deste tipo saem com o campo Para vazio.
            </p>
          )}
          <Grid cols="1fr 1fr auto">
            <Campo rotulo="Para">
              <textarea
                style={areaTexto(64)}
                value={(item.para || []).join("; ")}
                onChange={e => editar(item.tipo, "para", e.target.value)}
              />
            </Campo>
            <Campo rotulo="CC">
              <textarea
                style={areaTexto(64)}
                value={(item.cc || []).join("; ")}
                onChange={e => editar(item.tipo, "cc", e.target.value)}
              />
            </Campo>
            <button
              style={{ ...S.btn, ...S.btnBlue, height: 34, alignSelf: "end" }}
              disabled={salvando === item.tipo}
              onClick={() => salvar(item)}
            >
              {salvando === item.tipo ? "Salvando..." : "Salvar"}
            </button>
          </Grid>
        </div>
      ))}
    </div>
  );
}

/** Máscara de exibição; o backend guarda só os dígitos. */
function fmtCnpj(v: string | null | undefined): string {
  const n = (v || "").replace(/\D/g, "");
  if (n.length !== 14) return v || "";
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

/**
 * Lê a imagem escolhida e devolve data URI. O logo viaja embutido no HTML do
 * cronograma e do e-mail — se fosse URL, o cliente de e-mail bloquearia a
 * imagem externa e o documento sairia sem marca.
 */
function lerArquivoComoDataUri(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith("image/")) return reject(new Error("Escolha um arquivo de imagem"));
    if (arquivo.size > 2 * 1024 * 1024) return reject(new Error("O logo deve ter no máximo 2 MB"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    r.readAsDataURL(arquivo);
  });
}

type Aba = "empresa" | "contas" | "cartoes" | "comunicacao";

export default function Configuracoes() {
  const [aba, setAba] = useState<Aba>("empresa");
  const [empresa, setEmpresa] = useState<any>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const re = await authFetch("/api/empresa");
      const e = re.ok ? await re.json() : null;
      setEmpresa(e || { razao_social: "", aliquota_impostos: 0.2204 });
      setContas(e?.contas || []);
      setCartoes(e?.cartoes || []);
    } catch (ex: any) {
      setErro(ex.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const campo = (k: string, v: any) => setEmpresa((e: any) => ({ ...e, [k]: v }));

  async function salvarEmpresa() {
    setSalvando(true); setErro("");
    try {
      const r = await authFetch("/api/empresa", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...empresa,
          contas: undefined,
          // data URI vai pelo campo de upload; URL continua em logo_url
          logo_base64: String(empresa.logo_url || "").startsWith("data:") ? empresa.logo_url : undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao salvar");
      const e = await r.json();
      setEmpresa(e); setContas(e.contas || []);
      notify("Dados da empresa salvos.");
    } catch (ex: any) { setErro(ex.message); } finally { setSalvando(false); }
  }

  async function salvarConta(c: Partial<Conta>, id?: string) {
    setErro("");
    try {
      const r = await authFetch(id ? `/api/empresa/contas/${id}` : "/api/empresa/contas", {
        method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao salvar a conta");
      await carregar();
      notify(id ? "Conta atualizada." : "Conta cadastrada.");
    } catch (ex: any) { setErro(ex.message); }
  }

  async function removerConta(c: Conta) {
    if (!confirm(`Remover a conta ${c.banco} ${c.agencia || ""}/${c.conta || ""}?`)) return;
    await authFetch(`/api/empresa/contas/${c.id}`, { method: "DELETE" });
    await carregar();
    notify("Conta removida.");
  }

  async function salvarCartao(c: Partial<Cartao>, id?: string) {
    setErro("");
    try {
      const r = await authFetch(id ? `/api/empresa/cartoes/${id}` : "/api/empresa/cartoes", {
        method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao salvar o cartão");
      await carregar(); notify(id ? "Cartão atualizado." : "Cartão cadastrado.");
    } catch (ex: any) { setErro(ex.message); }
  }

  async function removerCartao(c: Cartao) {
    if (!confirm(`Remover o cartão ${c.bandeira} final ${c.final}? O histórico dos pagamentos continuará preservado.`)) return;
    const r = await authFetch(`/api/empresa/cartoes/${c.id}`, { method: "DELETE" });
    if (!r.ok) { setErro((await r.json()).error || "Erro ao remover o cartão"); return; }
    await carregar(); notify("Cartão removido.");
  }

  if (carregando) return <div style={{ padding: 40, color: T.txMut }}>Carregando configurações...</div>;

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "empresa", rotulo: "🏢 Dados da empresa" },
    { id: "contas", rotulo: `🏦 Contas para recebimento (${contas.length})` },
    { id: "cartoes", rotulo: `💳 Cartões corporativos (${cartoes.length})` },
    { id: "comunicacao", rotulo: "✉ Comunicação" },
  ];

  return (
    <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, maxWidth: 1080 }}>
      {toast && <div style={{ position: "fixed", bottom: 20, right: 20, background: T.green, color: "#052e1b", padding: "10px 18px", borderRadius: 8, zIndex: 9999, fontWeight: 700, fontSize: 12 }}>{toast}</div>}

      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.txPri, margin: 0 }}>Configurações da LS Office</h1>
        <p style={{ fontSize: 12, color: T.txMut, margin: "5px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
          O que está aqui sai nos documentos e nas notas: o logo e o CNPJ no cabeçalho do cronograma
          e da PV, os dados fiscais na nota, e a conta principal no e-mail de faturamento.
        </p>
      </div>

      {erro && (
        <div style={{ ...S.card, borderColor: T.red + "66", background: T.red + "12", color: "#fca5a5", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>{erro}</span>
          <button onClick={() => setErro("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{ ...S.btn, ...(aba === a.id ? S.btnBlue : {}) }}>{a.rotulo}</button>
        ))}
      </div>

      {aba === "empresa" && (
        <>
          <div style={S.card}>
            <Titulo>Identificação</Titulo>
            <Grid cols="2fr 1.2fr">
              <Campo rotulo="Razão social *"><input style={S.input} value={empresa.razao_social || ""} onChange={e => campo("razao_social", e.target.value)} /></Campo>
              <Campo rotulo="Nome fantasia"><input style={S.input} value={empresa.nome_fantasia || ""} onChange={e => campo("nome_fantasia", e.target.value)} /></Campo>
            </Grid>
            <Grid cols="1.3fr 1fr 1fr 1fr">
              <Campo rotulo="CNPJ" dica="Os dígitos verificadores são conferidos ao salvar.">
                <input style={S.input} value={fmtCnpj(empresa.cnpj)} placeholder="00.000.000/0000-00" onChange={e => campo("cnpj", e.target.value)} />
              </Campo>
              <Campo rotulo="Inscrição estadual"><input style={S.input} value={empresa.inscricao_estadual || ""} onChange={e => campo("inscricao_estadual", e.target.value)} /></Campo>
              <Campo rotulo="Inscrição municipal"><input style={S.input} value={empresa.inscricao_municipal || ""} onChange={e => campo("inscricao_municipal", e.target.value)} /></Campo>
              <Campo rotulo="CNAE"><input style={S.input} value={empresa.cnae || ""} onChange={e => campo("cnae", e.target.value)} /></Campo>
            </Grid>
          </div>

          <div style={S.card}>
            <Titulo>Endereço fiscal</Titulo>
            <Grid cols="3fr 0.8fr 1.2fr">
              <Campo rotulo="Logradouro"><input style={S.input} value={empresa.logradouro || ""} onChange={e => campo("logradouro", e.target.value)} /></Campo>
              <Campo rotulo="Número"><input style={S.input} value={empresa.numero || ""} onChange={e => campo("numero", e.target.value)} /></Campo>
              <Campo rotulo="Complemento"><input style={S.input} value={empresa.complemento || ""} onChange={e => campo("complemento", e.target.value)} /></Campo>
            </Grid>
            <Grid cols="1.5fr 1.5fr 0.6fr 1fr">
              <Campo rotulo="Bairro"><input style={S.input} value={empresa.bairro || ""} onChange={e => campo("bairro", e.target.value)} /></Campo>
              <Campo rotulo="Cidade"><input style={S.input} value={empresa.cidade || ""} onChange={e => campo("cidade", e.target.value)} /></Campo>
              <Campo rotulo="UF"><input style={S.input} maxLength={2} value={empresa.uf || ""} onChange={e => campo("uf", e.target.value.toUpperCase())} /></Campo>
              <Campo rotulo="CEP"><input style={S.input} value={empresa.cep || ""} onChange={e => campo("cep", e.target.value)} /></Campo>
            </Grid>
            <Grid cols="1fr 1.4fr 1.4fr">
              <Campo rotulo="Telefone"><input style={S.input} value={empresa.telefone || ""} onChange={e => campo("telefone", e.target.value)} /></Campo>
              <Campo rotulo="E-mail"><input style={S.input} value={empresa.email || ""} onChange={e => campo("email", e.target.value)} /></Campo>
              <Campo rotulo="Site"><input style={S.input} value={empresa.site || ""} onChange={e => campo("site", e.target.value)} /></Campo>
            </Grid>
          </div>

          <div style={S.card}>
            <Titulo>Faturamento e documentos</Titulo>
            <Grid cols="1.2fr 0.9fr 0.9fr 1.4fr">
              <Campo rotulo="Regime tributário">
                <select style={S.input} value={empresa.regime_tributario || ""} onChange={e => campo("regime_tributario", e.target.value)}>
                  {REGIMES.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Alíq. impostos" dica="Fração: 0,2204 = 22,04%. Usada no cálculo de margem.">
                <input style={S.input} type="number" step="0.0001" min="0" max="1" value={empresa.aliquota_impostos ?? ""} onChange={e => campo("aliquota_impostos", Number(e.target.value))} />
              </Campo>
              <Campo rotulo="Alíq. ISS">
                <input style={S.input} type="number" step="0.0001" min="0" max="1" value={empresa.aliquota_iss ?? ""} onChange={e => campo("aliquota_iss", e.target.value === "" ? null : Number(e.target.value))} />
              </Campo>
              <Campo rotulo="E-mail de faturamento"><input style={S.input} value={empresa.email_faturamento || ""} onChange={e => campo("email_faturamento", e.target.value)} /></Campo>
            </Grid>
            <Grid cols="2fr 1fr">
              <Campo rotulo="Logo da LS Office" dica="Aparece no cabeçalho do cronograma e da PV, ao lado da operadora e do sharing. PNG ou JPG, até 2 MB.">
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ ...S.btn, ...S.btnBlue, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Escolher arquivo
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={async e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try { campo("logo_url", await lerArquivoComoDataUri(f)); setErro(""); }
                        catch (ex: any) { setErro(ex.message); }
                        e.target.value = "";
                      }} />
                  </label>
                  {empresa.logo_url && (
                    <button onClick={() => campo("logo_url", null)} style={{ ...S.btn, color: T.red }}>Remover</button>
                  )}
                </div>
              </Campo>
              <Campo rotulo="Setor da assinatura" dica='Ex.: "Engenharia LS" — sai no rodapé dos documentos.'>
                <input style={S.input} value={empresa.assinatura_setor || ""} onChange={e => campo("assinatura_setor", e.target.value)} />
              </Campo>
            </Grid>
            {empresa.logo_url && (
              <div style={{ marginTop: 4, padding: "10px 12px", background: "#fff", borderRadius: 8, display: "inline-flex" }}>
                <img src={empresa.logo_url} alt="Logo" style={{ maxHeight: 44, maxWidth: 190, objectFit: "contain" }} />
              </div>
            )}
            <Campo rotulo="Observações padrão da nota fiscal">
              <textarea style={areaTexto(62)} value={empresa.observacoes_nf || ""} onChange={e => campo("observacoes_nf", e.target.value)} />
            </Campo>
          </div>

          <div>
            <button onClick={salvarEmpresa} disabled={salvando} style={{ ...S.btn, ...S.btnBlue, opacity: salvando ? 0.6 : 1 }}>
              {salvando ? "Salvando..." : "Salvar dados da empresa"}
            </button>
          </div>
        </>
      )}

      {aba === "contas" && (
        <ListaContas contas={contas} aoSalvar={salvarConta} aoRemover={removerConta} temEmpresa={!!empresa?.id} />
      )}

      {aba === "cartoes" && (
        <ListaCartoes cartoes={cartoes} aoSalvar={salvarCartao} aoRemover={removerCartao} temEmpresa={!!empresa?.id} />
      )}

      {aba === "comunicacao" && <ConfiguracaoComunicacao onError={setErro} notify={notify}/>} 
    </div>
  );
}

// ─── Contas ──────────────────────────────────────────────────────────────────

function ListaContas({ contas, aoSalvar, aoRemover, temEmpresa }: {
  contas: Conta[]; aoSalvar: (c: Partial<Conta>, id?: string) => void;
  aoRemover: (c: Conta) => void; temEmpresa: boolean;
}) {
  const [nova, setNova] = useState<Partial<Conta>>({ tipo: "CORRENTE" });

  if (!temEmpresa) {
    return <div style={{ ...S.card, color: T.amber, fontSize: 12 }}>Salve os dados da empresa antes de cadastrar contas.</div>;
  }

  return (
    <>
      <div style={S.card}>
        <Titulo>Nova conta</Titulo>
        <Grid cols="1.6fr 0.7fr 0.9fr 1.1fr 1fr">
          <Campo rotulo="Banco *"><input style={S.input} value={nova.banco || ""} onChange={e => setNova({ ...nova, banco: e.target.value })} /></Campo>
          <Campo rotulo="Código"><input style={S.input} value={nova.codigo_banco || ""} onChange={e => setNova({ ...nova, codigo_banco: e.target.value })} /></Campo>
          <Campo rotulo="Agência"><input style={S.input} value={nova.agencia || ""} onChange={e => setNova({ ...nova, agencia: e.target.value })} /></Campo>
          <Campo rotulo="Conta"><input style={S.input} value={nova.conta || ""} onChange={e => setNova({ ...nova, conta: e.target.value })} /></Campo>
          <Campo rotulo="Tipo">
            <select style={S.input} value={nova.tipo || "CORRENTE"} onChange={e => setNova({ ...nova, tipo: e.target.value })}>
              {TIPOS_CONTA.map(t => <option key={t} value={t}>{t === "CORRENTE" ? "Corrente" : "Poupança"}</option>)}
            </select>
          </Campo>
        </Grid>
        <Grid cols="1.6fr 1.2fr 0.9fr 1.4fr auto">
          <Campo rotulo="Titular"><input style={S.input} value={nova.titular || ""} onChange={e => setNova({ ...nova, titular: e.target.value })} /></Campo>
          <Campo rotulo="CNPJ do titular"><input style={S.input} value={nova.cnpj_titular || ""} onChange={e => setNova({ ...nova, cnpj_titular: e.target.value })} /></Campo>
          <Campo rotulo="Tipo de PIX">
            <select style={S.input} value={nova.pix_tipo || ""} onChange={e => setNova({ ...nova, pix_tipo: e.target.value })}>
              {TIPOS_PIX.map(t => <option key={t} value={t}>{t || "—"}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Chave PIX"><input style={S.input} value={nova.pix_chave || ""} onChange={e => setNova({ ...nova, pix_chave: e.target.value })} /></Campo>
          <button onClick={() => { aoSalvar(nova); setNova({ tipo: "CORRENTE" }); }} style={{ ...S.btn, ...S.btnBlue, height: 34, alignSelf: "end" }}>+ Adicionar</button>
        </Grid>
      </div>

      {contas.length === 0 && <div style={{ ...S.card, color: T.txMut, fontSize: 12 }}>Nenhuma conta cadastrada.</div>}

      {contas.map(c => (
        <div key={c.id} style={{ ...S.card, borderLeft: `3px solid ${c.principal ? T.green : T.brBase}`, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.txPri, display: "flex", alignItems: "center", gap: 8 }}>
              {c.codigo_banco ? `${c.codigo_banco} · ` : ""}{c.banco}
              {c.principal && <span style={{ fontSize: 9, fontWeight: 800, color: T.green, border: `1px solid ${T.green}66`, background: T.green + "1a", borderRadius: 20, padding: "2px 8px" }}>PRINCIPAL</span>}
              {!c.ativa && <span style={{ fontSize: 9, fontWeight: 800, color: T.txDis }}>INATIVA</span>}
            </div>
            <div style={{ fontSize: 11.5, color: T.txSec, marginTop: 4 }}>
              Ag. {c.agencia || "—"} · Conta {c.conta || "—"} · {c.tipo === "CORRENTE" ? "Corrente" : "Poupança"}
            </div>
            <div style={{ fontSize: 11, color: T.txMut, marginTop: 3 }}>
              {c.titular || "—"}{c.cnpj_titular ? ` · ${fmtCnpj(c.cnpj_titular)}` : ""}
            </div>
            {c.pix_chave && <div style={{ fontSize: 11, color: T.txMut, marginTop: 3 }}>PIX {c.pix_tipo || ""}: {c.pix_chave}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {!c.principal && <button onClick={() => aoSalvar({ principal: true }, c.id)} style={S.btn}>Tornar principal</button>}
            <button onClick={() => aoSalvar({ ativa: !c.ativa }, c.id)} style={S.btn}>{c.ativa ? "Desativar" : "Reativar"}</button>
            <button onClick={() => aoRemover(c)} style={{ ...S.btn, color: T.red }}>Remover</button>
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Cartões corporativos ───────────────────────────────────────────────────

function ListaCartoes({ cartoes, aoSalvar, aoRemover, temEmpresa }: {
  cartoes: Cartao[]; aoSalvar: (c: Partial<Cartao>, id?: string) => void;
  aoRemover: (c: Cartao) => void; temEmpresa: boolean;
}) {
  const [novo, setNovo] = useState<Partial<Cartao>>({ bandeira: "VISA", ativo: true });
  if (!temEmpresa) return <div style={{ ...S.card, color: T.amber, fontSize: 12 }}>Salve os dados da empresa antes de cadastrar cartões.</div>;
  return <>
    <div style={S.card}>
      <Titulo>Novo cartão corporativo</Titulo>
      <p style={{ fontSize: 11, color: T.txMut, margin: "0 0 12px", lineHeight: 1.5 }}>Somente a bandeira e os quatro últimos dígitos ficam visíveis nos pagamentos. Nunca cadastre o número completo nem o código de segurança.</p>
      <Grid cols="1fr 0.8fr 1.2fr 1.4fr 0.8fr 0.8fr auto">
        <Campo rotulo="Bandeira *"><input style={S.input} value={novo.bandeira || ""} onChange={e => setNovo({ ...novo, bandeira: e.target.value.toUpperCase() })}/></Campo>
        <Campo rotulo="Final *"><input style={S.input} maxLength={4} value={novo.final || ""} placeholder="1234" onChange={e => setNovo({ ...novo, final: e.target.value.replace(/\D/g, '').slice(0, 4) })}/></Campo>
        <Campo rotulo="Apelido"><input style={S.input} value={novo.apelido || ""} placeholder="Compras" onChange={e => setNovo({ ...novo, apelido: e.target.value })}/></Campo>
        <Campo rotulo="Titular"><input style={S.input} value={novo.titular || ""} onChange={e => setNovo({ ...novo, titular: e.target.value })}/></Campo>
        <Campo rotulo="Limite"><input style={S.input} type="number" step="0.01" value={novo.limite ?? ""} onChange={e => setNovo({ ...novo, limite: e.target.value ? Number(e.target.value) : null })}/></Campo>
        <Campo rotulo="Dia fechamento"><input style={S.input} type="number" min="1" max="31" value={novo.dia_fechamento ?? ""} onChange={e => setNovo({ ...novo, dia_fechamento: e.target.value ? Number(e.target.value) : null })}/></Campo>
        <button onClick={() => { aoSalvar(novo); setNovo({ bandeira: "VISA", ativo: true }); }} disabled={!novo.bandeira || String(novo.final || '').length !== 4} style={{ ...S.btn, ...S.btnBlue, height: 34, alignSelf: "end", opacity: !novo.bandeira || String(novo.final || '').length !== 4 ? .5 : 1 }}>Adicionar</button>
      </Grid>
    </div>
    {cartoes.length === 0 && <div style={{ ...S.card, color: T.txMut, fontSize: 12 }}>Nenhum cartão corporativo cadastrado.</div>}
    {cartoes.map(c => <div key={c.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", opacity: c.ativo ? 1 : .65 }}>
      <div><div style={{ color: T.txPri, fontWeight: 800, fontSize: 14 }}>{c.bandeira} •••• {c.final}{c.apelido ? ` · ${c.apelido}` : ''}</div><div style={{ color: T.txMut, fontSize: 11, marginTop: 4 }}>{c.titular || 'Titular não informado'}{c.limite != null ? ` · Limite ${c.limite.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}{c.dia_fechamento ? ` · Fecha dia ${c.dia_fechamento}` : ''}</div></div>
      <div style={{ display: "flex", gap: 8 }}><button onClick={() => aoSalvar({ ...c, ativo: !c.ativo }, c.id)} style={S.btn}>{c.ativo ? 'Desativar' : 'Reativar'}</button><button onClick={() => aoRemover(c)} style={{ ...S.btn, color: T.red }}>Remover</button></div>
    </div>)}
  </>;
}

// ─── Operadoras ──────────────────────────────────────────────────────────────

export function ListaOperadoras({ operadoras, aoSalvar, aoRemover }: {
  operadoras: Operadora[]; aoSalvar: (o: Partial<Operadora>) => void; aoRemover: (o: Operadora) => void;
}) {
  const [nova, setNova] = useState<Partial<Operadora>>({});

  return (
    <>
      <div style={S.card}>
        <Titulo>Operadora</Titulo>
        <p style={{ fontSize: 11.5, color: T.txMut, margin: "0 0 10px", lineHeight: 1.55 }}>
          O logo cadastrado aqui entra no cabeçalho do cronograma, ao lado do logo da LS e do da
          sharing. O nome precisa bater com o campo <strong>Operadora</strong> da atividade
          (CLARO, TIM, VIVO…). Sem logo, o documento mostra o nome em texto.
        </p>
        <Grid cols="1.2fr 0.6fr 2fr auto">
          <Campo rotulo="Nome *"><input style={S.input} value={nova.nome || ""} placeholder="CLARO" onChange={e => setNova({ ...nova, nome: e.target.value.toUpperCase() })} /></Campo>
          <Campo rotulo="Sigla"><input style={S.input} value={nova.sigla || ""} onChange={e => setNova({ ...nova, sigla: e.target.value })} /></Campo>
          <Campo rotulo="Logo da operadora">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ ...S.btn, cursor: "pointer", whiteSpace: "nowrap" }}>
                {nova.logo_url ? "Trocar arquivo" : "Escolher arquivo"}
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try { setNova({ ...nova, logo_url: await lerArquivoComoDataUri(f) }); }
                    catch (ex: any) { alert(ex.message); }
                    e.target.value = "";
                  }} />
              </label>
              {nova.logo_url && <img src={nova.logo_url} alt="" style={{ maxHeight: 30, maxWidth: 110, objectFit: "contain", background: "#fff", borderRadius: 4, padding: 3 }} />}
            </div>
          </Campo>
          <button onClick={() => { aoSalvar(nova); setNova({}); }} style={{ ...S.btn, ...S.btnBlue, height: 34, alignSelf: "end" }}>Salvar</button>
        </Grid>
      </div>

      {operadoras.length === 0 && <div style={{ ...S.card, color: T.txMut, fontSize: 12 }}>Nenhuma operadora cadastrada.</div>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {operadoras.map(o => (
          <div key={o.id} style={{ ...S.card, width: 250 }}>
            <div style={{ height: 52, background: "#fff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              {o.logo_url
                ? <img src={o.logo_url} alt={o.nome} style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }} />
                : <span style={{ color: "#334155", fontWeight: 800, fontSize: 14 }}>{o.nome}</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.txPri }}>{o.nome}{o.sigla ? ` · ${o.sigla}` : ""}</div>
            <div style={{ fontSize: 10.5, color: o.logo_url ? T.txMut : T.amber, marginTop: 3 }}>
              {o.logo_url ? "Logo cadastrado" : "Sem logo — sai como texto"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <label style={{ ...S.btn, padding: "6px 11px", fontSize: 11, cursor: "pointer" }}>
                {o.logo_url ? "Trocar logo" : "Enviar logo"}
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try { aoSalvar({ nome: o.nome, sigla: o.sigla, logo_url: await lerArquivoComoDataUri(f) }); }
                    catch (ex: any) { alert(ex.message); }
                    e.target.value = "";
                  }} />
              </label>
              <button onClick={() => aoRemover(o)} style={{ ...S.btn, padding: "6px 11px", fontSize: 11, color: T.red }}>Remover</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Peças de layout ─────────────────────────────────────────────────────────

function Titulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 800, color: T.txPri, marginBottom: 12 }}>{children}</div>;
}

function Grid({ cols, children }: { cols: string; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, marginBottom: 10 }}>{children}</div>;
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={S.label} title={dica}>{rotulo}</label>
      {children}
      {dica && <div style={{ fontSize: 10, color: T.txDis, marginTop: 3, lineHeight: 1.45 }}>{dica}</div>}
    </div>
  );
}
