const fs = require('fs');
const file = 'src/frontend/pages/SimuladorLPU.tsx';
let txt = fs.readFileSync(file, 'utf8');

const sIdx = txt.indexOf('{/* Fornecedores + Clientes */}');
const eIdx = txt.indexOf('{/* Usuário logado + logout */}');

if (sIdx !== -1 && eIdx !== -1) {
  const replacement = `{/* Fornecedores + Clientes */}
          <NavItem id="fornecedores" icon="🏢" label="Fornecedores" />
          <NavItem id="clientes" icon="🤝" label="Clientes" />
          <NavItem id="faturamento" icon="🧾" label="Faturamento" />

          {/* ── Seção ADMINISTRAÇÃO ── */}
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: T.txDis, marginBottom: 6, marginTop: 14, paddingLeft: 8 }}>ADMINISTRAÇÃO</div>
          <NavItem id="secretaria" icon="👩🏽‍💻" label="Secretária LS" />

        </nav>

        `;
  const cleanStr = txt.substring(0, sIdx) + replacement + txt.substring(eIdx);
  fs.writeFileSync(file, cleanStr, 'utf8');
  console.log('Fixed successfully!');
} else {
  console.log('Tokens not found');
}
