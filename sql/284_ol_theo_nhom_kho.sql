-- NEW - 284: CHIA HÀNG ONLINE THEO NHÓM KHO — giống Đề nghị hàng (cửa hàng) / Chia hàng đội sale (anh chốt 25/11)
--   5 nhóm: Bảo hiểm chính / sale · Nón vải chính / sale · Phụ kiện — mỗi nhóm lấy từ ĐÚNG 1 kho tổng (tham_so kho_tong_ma, dùng chung với cửa hàng):
--     BH chính TP05006 · BH sale SA05001 · NV chính TP05002 · NV sale SA05002 · PK PK05001
--   _fn_ol_tinh: + 's' (hàng sale) mỗi dòng · + 'kho_nhom' · đủ 5 kho tổng (tồn khả dụng chỉ tính cho mã có bán — giữ tốc độ < 2 giây)
do $do$
declare d text; f text;
  o1 text := $$'t', tn.ten, 'g', s.gia_niem_yet, 'gs', case when s.la_hang_sale then s.gia_sale end,$$;
  n1 text := $$'t', tn.ten, 'g', s.gia_niem_yet, 'gs', case when s.la_hang_sale then s.gia_sale end, 's', case when s.la_hang_sale then 1 end,$$;
  o3 text := $$  select array_agg(distinct x) into v_nguon from jsonb_each(c->'nguon') e(k, v), jsonb_array_elements_text(e.v) x;$$;
  n3 text := $$  select array_agg(distinct x) into v_nguon from jsonb_each(c->'nguon') e(k, v), jsonb_array_elements_text(e.v) x;
  -- NEW - 284: luôn có đủ 5 kho tổng của các nhóm (kho_tong_ma)
  select array_agg(distinct z.x) into v_nguon from (select unnest(v_nguon) x
    union select e.value from tham_so t cross join jsonb_each_text(t.gia_tri) e where t.key = 'kho_tong_ma' and t.pham_vi = 'GLOBAL') z;$$;
  o4 text := $$    'ok', true, 'luc', now(), 'cfg', c,$$;
  n4 text := $$    'ok', true, 'luc', now(), 'cfg', c,
    'kho_nhom', (select jsonb_build_object('BH_C', gia_tri->>'BH_CHINH', 'BH_S', gia_tri->>'BH_SALE', 'NV_C', gia_tri->>'NV_CHINH',
                                           'NV_S', gia_tri->>'NV_SALE', 'PK', gia_tri->>'PK_CHINH')
                 from tham_so where key = 'kho_tong_ma' and pham_vi = 'GLOBAL'),   -- NEW - 284$$;
begin
  d := pg_get_functiondef('chiahang._fn_ol_tinh'::regproc);
  foreach f in array array[o1, o3, o4] loop
    if (length(d) - length(replace(d, f, ''))) / length(f) <> 1 then raise exception '_fn_ol_tinh: mốc không duy nhất: %', left(f, 70); end if;
  end loop;
  execute replace(replace(replace(d, o1, n1), o3, n3), o4, n4);
end $do$;
