-- NEW - 287: SIÊU TRÍ TUỆ — công cụ tiktok trả thêm: tình trạng đơn, sản phẩm bán, đơn gần nhất (1 ID) — để hỏi "ID đó bán đơn nào, bán gì, ai mua, tình trạng"
--   (tên người mua đã che — SQL 286). Theo dõi ★: mỗi ID kèm 5 mã bán nhiều nhất.
do $do$
declare d text;
  o1 text := $q$    'dinh_nghia', v_dn);
end $function$$q$;
  n1 text := $q$    'trang_thai', coalesce(r->'tt', '{}'::jsonb),   -- NEW - 287: số đơn theo tình trạng (cho_tt chờ thanh toán, cho_gui chờ gửi, dang_giao, da_giao, huy)
    'san_pham', coalesce((select jsonb_agg(jsonb_build_object('ma', x->>'ma', 'ten', x->>'ten', 'sl', (x->>'sl')::int, 'doanh_thu', (x->>'dt')::numeric, 'don', (x->>'don')::int))
                          from (select x from jsonb_array_elements(coalesce(r->'sp', '[]')) x limit 10) z), '[]'),
    'don_gan_nhat', case when cardinality(v_h) = 1 then (select coalesce(jsonb_agg(jsonb_build_object(
          'ma_don', x->>'ma_don', 'luc', to_char((x->>'tao_luc')::timestamptz at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'), 'tinh_trang', x->>'tt',
          'kenh', x->>'kenh', 'khach', x->>'khach', 'tinh', x->>'tinh', 'ly_do_huy', x->>'ly_do_huy',
          'hang', (select string_agg(coalesce(l->>'sku', '?') || ' × ' || coalesce(l->>'sl', '0'), ', ') from jsonb_array_elements(coalesce(x->'dong', '[]')) l),
          'doanh_thu', (select coalesce(sum(coalesce((l->>'truoc')::numeric, 0) - coalesce((l->>'shop_giam')::numeric, 0)), 0) from jsonb_array_elements(coalesce(x->'dong', '[]')) l))), '[]')
        from jsonb_array_elements(coalesce((fn_tt_don_ds(p_token, jsonb_build_object('tu', v_tu, 'den', v_den, 'nb', to_jsonb(v_h)), 20))->'ds', '[]')) x) end,
    'dinh_nghia', v_dn || ' don_gan_nhat: 20 đơn mới nhất (tên khách đã che). Xem đủ: màn TikTok Shop, bấm vào ID.');
end $function$$q$;
  o2 text := $$          'ky_truoc', jsonb_build_object('doanh_thu', (x->'truoc'->>'dt')::numeric, 'don', (x->'truoc'->>'don')::int)) order by (x->>'thu_tu')::int)$$;
  n2 text := $$          'ky_truoc', jsonb_build_object('doanh_thu', (x->'truoc'->>'dt')::numeric, 'don', (x->'truoc'->>'don')::int),
          'top_san_pham', (select jsonb_agg(jsonb_build_object('ma', s->>'ma', 'sl', (s->>'sl')::int, 'doanh_thu', (s->>'dt')::numeric))
                           from (select s from jsonb_array_elements(coalesce(x->'sp', '[]')) s limit 5) z)) order by (x->>'thu_tu')::int)   -- NEW - 287$$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_tiktok'::regproc);
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_ai_tiktok: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_ai_tiktok: mốc 2'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;
