// Caldeirão App · Chapéu Seletor
// Worker do Cloudflare que fala com a API da Anthropic.
// A chave fica no segredo ANTHROPIC_API_KEY, nunca no app.
// Limites ficam no KV ligado como LIMITES.

const ORIGENS = ["https://betstg.github.io"];
const MODELO = "claude-haiku-5-5";
const MODELO_GRATIS = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; // IA do Cloudflare, usada enquanto não tem chave da Anthropic
const LIM_IP_HORA = 30;   // perguntas por pessoa por hora
const LIM_DIA = 400;      // perguntas no app inteiro por dia

const SISTEMA = `Você é o Chapéu Seletor dentro do Caldeirão App, o app de fãs do canal Caldeirão Furado, do Caco Cardassi.
Fale sempre em português do Brasil, com o tom do Chapéu Seletor. Antigo, sábio, um pouco teatral e bem-humorado, mas sempre claro.
Use os nomes da tradução brasileira da editora Rocco. Grifinória, Sonserina, Corvinal, Lufa-Lufa, Tiago, Lílian, Alvo, Severo, Rony, Gina, Bichento, Edwiges, trouxa.
Responda de forma curta. No máximo uns 120 palavras, em frases simples. Nada de listas longas.
Só fale do mundo bruxo de Harry Potter, dos livros, filmes, série da HBO, peças, jogos e do canal do Caco. Se perguntarem outra coisa, volte gentilmente para o mundo bruxo.
Não invente fatos. Se não tiver certeza, diga que não tem certeza. Separe o que está nos livros do que é teoria de fã.
Nunca diga o que o Caco falou num vídeo a menos que isso venha no contexto do app. Quando o contexto trouxer um vídeo do Caco, mencione que ele respondeu isso e que o vídeo aparece logo abaixo.
Não copie trechos longos dos livros. Nunca invente citações. Não coloque frases entre aspas como se fossem dos livros, dos filmes ou de personagens. Conte com as suas palavras.
Não conte spoilers além do que a pessoa perguntou.
Chame a pessoa pelo apelido quando ele vier no contexto.`;

export default {
  async fetch(req, env) {
    const origem = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!ORIGENS.includes(origem)) return json({ erro: "origem" }, 403, cors);
    if (req.method !== "POST") return json({ erro: "metodo" }, 405, cors);
    if (!env.ANTHROPIC_API_KEY && !env.AI) return json({ erro: "sem_chave" }, 500, cors);

    let corpo;
    try { corpo = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }

    // conversa curta, só texto, papéis alternados
    const msgs = [];
    for (const m of (Array.isArray(corpo.msgs) ? corpo.msgs : []).slice(-8)) {
      const role = m && m.role === "assistant" ? "assistant" : "user";
      const content = String((m && m.content) || "").slice(0, 1500).trim();
      if (!content) continue;
      if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + content;
      else msgs.push({ role, content });
    }
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ erro: "vazio" }, 400, cors);
    const ctx = String(corpo.ctx || "").slice(0, 2500);

    // limites
    if (env.LIMITES) {
      const agora = new Date().toISOString();
      const ip = req.headers.get("CF-Connecting-IP") || "x";
      const kDia = "dia:" + agora.slice(0, 10);
      const kIp = "ip:" + agora.slice(0, 13) + ":" + ip;
      const [nDia, nIp] = await Promise.all([env.LIMITES.get(kDia), env.LIMITES.get(kIp)]);
      if (+nDia >= LIM_DIA) return json({ erro: "limite_dia" }, 429, cors);
      if (+nIp >= LIM_IP_HORA) return json({ erro: "limite_pessoa" }, 429, cors);
      await Promise.all([
        env.LIMITES.put(kDia, String((+nDia || 0) + 1), { expirationTtl: 172800 }),
        env.LIMITES.put(kIp, String((+nIp || 0) + 1), { expirationTtl: 7200 }),
      ]);
    }

    const sistema = SISTEMA + (ctx ? "\n\nContexto do app para esta pergunta\n" + ctx : "");

    // sem chave da Anthropic, usa a IA gratuita do Cloudflare
    if (!env.ANTHROPIC_API_KEY) {
      try {
        const g = await env.AI.run(MODELO_GRATIS, { messages: [{ role: "system", content: sistema }, ...msgs], max_tokens: 600 });
        const txt = String((g && g.response) || "").trim();
        if (!txt) return json({ erro: "ia" }, 502, cors);
        return json({ txt, motor: "cloudflare" }, 200, cors);
      } catch (e) {
        console.log("workers-ai", String(e).slice(0, 300));
        return json({ erro: "ia" }, 502, cors);
      }
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 600,
        system: sistema,
        messages: msgs,
      }),
    });
    if (!r.ok) {
      console.log("anthropic", r.status, (await r.text()).slice(0, 400));
      return json({ erro: "ia", status: r.status }, 502, cors);
    }
    const d = await r.json();
    const txt = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim();
    return json({ txt }, 200, cors);
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
