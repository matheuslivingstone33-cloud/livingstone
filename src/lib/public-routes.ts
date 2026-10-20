// Rotas acessíveis sem sessão (usado pelo middleware).
// /acordo: página do devedor (protegida pelo token do link); webhook Pix (protegido por segredo); /tour: tour público com dados fictícios.
// /api/v1/<módulo>: API pública, autenticada por chave (withApiKey) e não por sessão; /docs/api: documentação da API.
// Os módulos da API são listados um a um: nada de liberar /api/v1/ inteiro.
export const PUBLIC_ROUTES = [/^\/acordo\//, /^\/api\/pix\/webhook\//, /^\/tour(\/|$)/, /^\/api\/v1\/(conciliacoes|cobranca|pld)(\/|$)/, /^\/docs\/api$/];

export const isPublic = (path: string) => PUBLIC_ROUTES.some((r) => r.test(path));
