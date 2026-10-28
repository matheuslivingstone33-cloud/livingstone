// Cliente mínimo da API REST do GitHub para criar issues. Só servidor. Nunca lança erro.
import { erroCurto, resultadoIssue, type ConfigGithub } from "./pedidos-github";

export type ResultadoCriarIssue = { ok: true; number: number; url: string } | { ok: false; erro: string };

export async function criarIssue(cfg: ConfigGithub, payload: { title: string; body: string; labels: string[] }): Promise<ResultadoCriarIssue> {
  try {
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "livingstone-pedidos",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) return { ok: false, erro: erroCurto(`GitHub respondeu ${r.status}`, cfg.token) };
    const res = resultadoIssue(await r.json().catch(() => null), cfg.repo);
    return res ? { ok: true, ...res } : { ok: false, erro: "Resposta inesperada do GitHub." };
  } catch (e) {
    return { ok: false, erro: erroCurto(e, cfg.token) };
  }
}
