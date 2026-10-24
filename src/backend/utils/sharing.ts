import { prisma } from '../server';
import { acharCliente } from './cliente-nome';

/**
 * Sharing e operadora da atividade vêm do cadastro de Clientes (23/10/2026).
 *
 * Grava-se o NOME do cliente, do jeito que está no cadastro (ex.: "Highline do
 * Brasil"), e a atividade fica ligada ao cadastro do sharing (contratante_id).
 * Nada de código/sigla. Sharing = clientes do tipo Sharing ou Sharing e
 * operadora; Operadora = Operadora ou Sharing e operadora. Só cadastros ativos.
 */
export { TIPOS_SHARING, TIPOS_OPERADORA, chaveNome, ehHighline } from './cliente-nome';

/** O cliente ativo do cadastro, dos tipos pedidos, que corresponde ao texto recebido. */
export async function resolverCliente(tenantId: string, texto: unknown, tipos: string[]) {
    const ativos = await prisma.contratante.findMany({ where: { tenant_id: tenantId, ativo: true, tipo: { in: tipos } }, select: { id: true, nome: true, sigla: true, tipo: true } });
    return acharCliente(ativos, texto);
}
