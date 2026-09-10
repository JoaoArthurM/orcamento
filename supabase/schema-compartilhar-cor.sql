-- ══════════════════════════════════════════════════════
-- orçamento. — a cor é de quem olha
--
-- Cole no SQL Editor do Supabase e clique em Run.
--
-- ── O QUE ESTAVA INVERTIDO ────────────────────────────
-- `trocar_cor` exigia `owner_id = auth.uid()`: quem escolhia
-- era o DONO da economia. Mas a cor pinta os lançamentos
-- dele na tela de OUTRA pessoa — quem nunca ia ver o
-- resultado estava decidindo, e quem via não podia mudar.
--
-- Passa para o espectador, que é quem olha.
-- ══════════════════════════════════════════════════════

create or replace function public.trocar_cor(p_share uuid, p_color text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.economy_shares
     set color = p_color
   where id = p_share
     -- quem olha decide como vê
     and viewer_id = auth.uid()
     and p_color in ('rosa','azul','laranja','roxo','amarelo','verde');
$$;

revoke all on function public.trocar_cor(uuid, text) from public;
grant execute on function public.trocar_cor(uuid, text) to authenticated;
