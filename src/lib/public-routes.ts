// Rotas acessíveis sem sessão (usado pelo middleware).
// /acordo: página do devedor (protegida pelo token do link); webhook Pix (protegido por segredo); /tour: tour público com dados fictícios.
export const PUBLIC_ROUTES = [/^\/acordo\//, /^\/api\/pix\/webhook\//, /^\/tour(\/|$)/];

export const isPublic = (path: string) => PUBLIC_ROUTES.some((r) => r.test(path));
