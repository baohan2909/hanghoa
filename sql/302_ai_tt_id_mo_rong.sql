-- ============================================================================
-- NEW - 302: SIÊU TRÍ TUỆ — nhận ID TikTok theo tên gọi dễ hơn (26/11: AI thử "Vải -", "Vành" đều "Không thấy ID", mất lượt)
--   Khớp như cũ (handle / tên gọi đúng y); không khớp thì so tên gọi đã bỏ dấu + bỏ khoảng trắng / gạch:
--   "vành sale" = "vanhsale" = "Vành - Sale"; "Vành" (từ 3 ký tự) → mọi ID bắt đầu bằng "Vành" (Vành - Chính, Vành - Sale).
-- ============================================================================
create or replace function chiahang._fn_ai_tt_id(p_ds jsonb)
returns text[] language sql stable security definer set search_path to chiahang, public as $$
  with x as (
    select trim(both ' @' from v) v from jsonb_array_elements_text(case jsonb_typeof(p_ds) when 'array' then p_ds when 'string' then jsonb_build_array(p_ds) else '[]'::jsonb end) v),
  k as (
    select x.v, c.handle from x join tt_creator c
      on lower(c.handle) = lower(x.v)
      or trim(fn_ai_chuan_chu(c.handle)) = trim(fn_ai_chuan_chu(x.v))
      or (c.ten is not null and trim(fn_ai_chuan_noi(c.ten)) = trim(fn_ai_chuan_noi(x.v)))),
  m as (   -- NEW - 302: không khớp đúng y → so bỏ dấu, bỏ khoảng trắng / gạch, khớp đầu tên gọi
    select x.v, c.handle from x join tt_creator c
      on c.ten is not null
     and not exists (select 1 from k where k.v = x.v)
     and length(regexp_replace(fn_ai_chuan_noi(x.v), '[^a-z0-9]', '', 'g')) >= 3
     and regexp_replace(fn_ai_chuan_noi(c.ten), '[^a-z0-9]', '', 'g') like regexp_replace(fn_ai_chuan_noi(x.v), '[^a-z0-9]', '', 'g') || '%')
  select coalesce(array_agg(distinct handle), '{}') from (select handle from k union all select handle from m) z
$$;
revoke all on function chiahang._fn_ai_tt_id(jsonb) from public, anon, authenticated;
