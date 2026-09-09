/* ══════════════════════════════════════════════════════
   orçamento. — configuração do Supabase

   Preencha os dois valores abaixo com os dados do seu projeto:
   painel do Supabase → Project Settings → Data API.

   • SUPABASE_URL       → "Project URL"
   • SUPABASE_ANON_KEY  → a chave "anon public" (ou "publishable")

   A chave anon É FEITA para ficar visível no código do navegador —
   ela sozinha não dá acesso a nada. Quem protege os dados é o RLS
   definido em supabase/schema.sql, que amarra cada linha ao seu dono.

   NUNCA coloque aqui a chave "service_role" / "secret": essa ignora
   o RLS e daria acesso total ao banco para qualquer visitante.

   Deixando os valores em branco, o app funciona normalmente em modo
   local (dados só neste aparelho, como antes do Supabase).
   ══════════════════════════════════════════════════════ */
window.ORCAMENTO_CONFIG = {
  SUPABASE_URL: 'https://cctuyzmsdyfxupymdkvj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_AJvQ-rlmtDnkD32GZ4Sb8Q_sQic82px',
};
