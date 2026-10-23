// Canal de envio da régua de cobrança. Puro: só tipos.
// Quem implementa um canal nunca devolve (nem registra) chave, número ou texto da mensagem no resultado.
export type ResultadoEnvio = { ok: true; providerId?: string } | { ok: false; motivo: string; transitorio: boolean };

export interface Sender {
  canal: "whatsapp";
  /** numero no formato 55DDDNUMERO (ver normalizarTelefoneBR). */
  enviar(numero: string, texto: string): Promise<ResultadoEnvio>;
}
