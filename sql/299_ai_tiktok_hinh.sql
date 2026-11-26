-- ============================================================================
-- NEW - 299: SIÊU TRÍ TUỆ — công cụ tiktok trả danh sách sản phẩm ĐỦ để trả lời "gửi hình sản phẩm bán / huỷ của kênh …"
--   (26/11: AI tự viết SQL 3 lần sai tên bảng → hết 8 lượt). Mỗi sản phẩm: mã, tên, SL bán, doanh thu, đơn hợp lệ,
--   đơn huỷ, SL huỷ, lý do huỷ, link HÌNH (cùng nguồn hình màn TikTok Shop). Có ID → mặc định 30 mã (so_sp tối đa 60).
-- ============================================================================
do $do$
declare d text;
  o1 text := 'v_h text[]; v_tong jsonb;';
  n1 text := 'v_h text[]; v_tong jsonb; v_hinh jsonb; v_sosp int;   -- NEW - 299';
  o2 text := $q$  r := fn_tt_bao_cao(p_token, jsonb_build_object('tu', v_tu, 'den', v_den) ||$q$;
  n2 text := $q$  v_hinh := fn_tt_hinh(p_token);   -- NEW - 299: link hình theo mã (y như màn TikTok Shop)
  v_sosp := least(60, greatest(1, coalesce(nullif(p->>'so_sp', '')::int, case when cardinality(v_h) > 0 then 30 else 10 end)));
  r := fn_tt_bao_cao(p_token, jsonb_build_object('tu', v_tu, 'den', v_den) ||$q$;
  o3 text := $q$'san_pham', coalesce((select jsonb_agg(jsonb_build_object('ma', x->>'ma', 'ten', x->>'ten', 'sl', (x->>'sl')::int, 'doanh_thu', (x->>'dt')::numeric, 'don', (x->>'don')::int))
                          from (select x from jsonb_array_elements(coalesce(r->'sp', '[]')) x limit 10) z), '[]'),$q$;
  n3 text := $q$'san_pham', coalesce((select jsonb_agg(jsonb_build_object('ma', z.ma, 'ten', z.ten, 'sl', z.sl, 'doanh_thu', z.dt, 'don', z.don,
                            'don_huy', z.don_huy, 'sl_huy', z.sl_huy, 'ly_do_huy', z.ly_do,
                            'hinh', coalesce(v_hinh->>z.ma, v_hinh->>_fn_tt_mame(z.ma))) order by z.dt desc nulls last, z.sl desc)   -- NEW - 299
                          from (select coalesce(l.ma_me, l.seller_sku, '?') ma, max(l.ten_sp) ten, coalesce(sum(l.sl_ban), 0) sl,
                                       round(coalesce(sum((l.tien_truoc_giam - coalesce(l.giam_shop, 0)) * l.hs), 0)) dt,
                                       count(distinct l.ma_don) filter (where not l.la_huy) don, count(distinct l.ma_don) filter (where l.la_huy) don_huy,
                                       coalesce(sum(l.so_luong) filter (where l.la_huy), 0) sl_huy,
                                       string_agg(distinct nullif(l.ly_do_huy, ''), '; ') filter (where l.la_huy) ly_do
                                  from _fn_tt_dong(jsonb_build_object('tu', v_tu, 'den', v_den)
                                       || case when cardinality(v_h) > 0 then jsonb_build_object('nb', to_jsonb(v_h)) else '{}'::jsonb end) l
                                 group by 1
                                 order by 4 desc nulls last, 3 desc
                                 limit v_sosp) z), '[]'),$q$;
  o4 text := $q$'dinh_nghia', v_dn || ' don_gan_nhat: 20 đơn mới nhất$q$;
  n4 text := $q$'dinh_nghia', v_dn || ' san_pham: hinh = link hình sản phẩm — muốn cho xem hình thì viết mỗi mã 1 dòng đúng dạng ![MÃ · SL cái · doanh thu](hinh), app tự hiện thành lưới hình; don_huy / sl_huy / ly_do_huy = đơn bị huỷ của mã đó.' || ' don_gan_nhat: 20 đơn mới nhất$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_tiktok'::regproc);
  if position('NEW - 299' in d) > 0 then return; end if;
  if position(o1 in d) = 0 then raise exception 'fn_ai_tiktok: mốc 1'; end if;
  if position(o2 in d) = 0 then raise exception 'fn_ai_tiktok: mốc 2'; end if;
  if position(o3 in d) = 0 then raise exception 'fn_ai_tiktok: mốc 3'; end if;
  if position(o4 in d) = 0 then raise exception 'fn_ai_tiktok: mốc 4'; end if;
  execute replace(replace(replace(replace(d, o1, n1), o2, n2), o3, n3), o4, n4);
end $do$;
