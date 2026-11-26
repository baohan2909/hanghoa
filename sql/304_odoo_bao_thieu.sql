-- ============================================================================
-- NEW - 304: BÁO THIẾU KHI NHẬN (anh chốt 26/11 14:12)
--   Cửa hàng nhận ĐÚNG số thực nhận (SQL 303). Phần thiếu tự thành "báo thiếu" gửi về Quản trị / Điều phối (ADMIN, DIEU_PHOI):
--     - Menu "Đơn hàng Odoo" có số đỏ = số phiếu báo thiếu đang chờ xử lý.
--     - Màn Đơn hàng Odoo có thẻ lọc "Nhận thiếu" → bấm ra đúng các phiếu đó; dòng phiếu có chip "Báo thiếu N".
--     - Mở phiếu: thấy mã nào thiếu bao nhiêu, lý do cửa hàng ghi, phần còn lại trên Odoo đang ra sao → bấm xử lý:
--       "Kho giao bù" · "Đã huỷ phần còn lại" · "Xử lý khác" (+ ghi chú). Ghi người + giờ xử lý.
--   Tự đóng khi phần thiếu sau đó đã nhận đủ trên Odoo (đã nhận = đã xuất). Phần huỷ / đóng không bù thì vẫn chờ người xử lý.
-- ============================================================================

alter table chiahang.odoo_nhan
  add column if not exists thieu int generated always as (greatest(coalesce(tong_con, 0) - coalesce(tong, 0), 0)) stored,
  add column if not exists xl_tt text,          -- null: không thiếu · 'cho': chờ xử lý · 'xong': đã xử lý
  add column if not exists xl_cach text,        -- giao_bu | huy_con_lai | khac
  add column if not exists xl_ghi_chu text,
  add column if not exists xl_nguoi text,
  add column if not exists xl_luc timestamptz;
create index if not exists odoo_nhan_xl_idx on chiahang.odoo_nhan (name) where xl_tt = 'cho';

-- 1) Phiếu còn báo thiếu chờ xử lý? (có báo thiếu 'cho' VÀ trên Odoo vẫn còn mã đã nhận < đã xuất)
create or replace function chiahang._fn_odoo_bt_cho(p_name text)
returns boolean language sql stable security definer set search_path to chiahang, public as $$
  select exists (select 1 from odoo_nhan b where b.name = p_name and b.xl_tt = 'cho')
     and exists (select 1 from odoo_phieu_dong d where d.name = p_name and coalesce(d.nhan, 0) < coalesce(d.xuat, 0))
$$;
revoke all on function chiahang._fn_odoo_bt_cho(text) from public, anon, authenticated;

-- 2) Nhận xong mà thiếu → đánh dấu chờ xử lý
do $do$
declare d text;
  o text := $q$loi = left(v_loi, 1000), xong_luc = now()$q$;
  n text := $q$loi = left(v_loi, 1000), xong_luc = now(),
                       xl_tt = case when v_ok and coalesce(n.tong, 0) < coalesce(n.tong_con, 0) then 'cho' end   -- NEW - 304$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_nhan_ket_qua'::regproc);
  if position('NEW - 304' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_nhan_ket_qua: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- 3) Trạng thái nhận của phiếu: thêm chi tiết báo thiếu + phần còn lại trên Odoo + quyền xử lý
create or replace function chiahang._fn_odoo_nhan_tt(u jsonb, p_name text)
returns jsonb language plpgsql stable security definer set search_path to chiahang, public as $$
declare c jsonb; p record; n record; v_mo boolean; v_quyen boolean; v_ly text; v_con int; v_sd int; v_pc text;
begin
  select gia_tri into c from tham_so where key = 'odoo_api' and pham_vi = 'GLOBAL';
  c := coalesce(c, '{}'::jsonb);
  v_mo := coalesce((c->>'nhan_bat')::boolean, false)
          and (coalesce((c->>'nhan_tat_ca')::boolean, false) or coalesce(c->'nhan_thu', '[]'::jsonb) ? (u->>'ma'));
  select * into p from odoo_phieu where name = p_name;
  v_quyen := coalesce((u->>'admin')::boolean, false) or (p.kho_yeu_cau is not null and p.kho_yeu_cau = u->>'ma_ch');
  select coalesce(sum(greatest(coalesce(d.xuat, 0) - coalesce(d.nhan, 0), 0)), 0), count(*) filter (where coalesce(d.xuat, 0) > coalesce(d.nhan, 0))
    into v_con, v_sd from odoo_phieu_dong d where d.name = p_name;
  select * into n from odoo_nhan x where x.name = p_name order by x.tao_luc desc limit 1;
  v_ly := case
    when p.name is null then 'App chưa đọc được phiếu này từ Odoo — bấm "Lấy mới từ Odoo"'
    when p.state in ('cancel', 'refuse') then 'Phiếu đã huỷ / bị từ chối trên Odoo'
    when p.state in ('draft', 'to approve') then 'Phiếu chưa duyệt trên Odoo'
    when not exists (select 1 from jsonb_array_elements(coalesce(p.xk, '[]'::jsonb)) e where e->>'state' = 'done') then 'Kho chưa xuất hàng'
    when not exists (select 1 from jsonb_array_elements(coalesce(p.nk, '[]'::jsonb)) e where coalesce(e->>'state', '') not in ('done', 'cancel'))
      then case when p.nk_xong is not null then 'Phiếu đã nhận xong trên Odoo' else 'Chưa thấy phiếu nhập trên Odoo — bấm "Lấy mới từ Odoo"' end
    when v_con <= 0 then 'Không còn số lượng chờ nhận'
    when n.trang_thai = 'dang_gui' and n.tao_luc > now() - interval '3 minutes' then 'Đang gửi lệnh nhận lên Odoo — chờ 1 chút'
    when n.trang_thai = 'xong' and n.xong_luc > coalesce(p.lay_luc, '-infinity'::timestamptz)
      then 'Đã báo nhận lúc ' || to_char(n.xong_luc at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' — chờ Odoo cập nhật, bấm "Lấy mới từ Odoo"'
  end;
  -- NEW - 304: phần còn lại trên Odoo sau lần nhận thiếu
  v_pc := case
    when p.name is null then null
    when v_con <= 0 then 'da_bu'                                                     -- đã nhận = đã xuất
    when exists (select 1 from jsonb_array_elements(coalesce(p.nk, '[]'::jsonb)) e where coalesce(e->>'state', '') not in ('done', 'cancel')) then 'cho_nhan'
    when exists (select 1 from jsonb_array_elements(coalesce(p.nk, '[]'::jsonb)) e where e->>'state' = 'cancel') then 'da_huy'
    else 'dong' end;                                                                -- Odoo đóng phiếu, không tạo phần dở dang
  return jsonb_build_object(
    'mo', v_mo, 'quyen', v_quyen, 'duoc', v_mo and v_quyen and v_ly is null, 'ly_do', v_ly,
    'kho', p.kho_yeu_cau, 'con', v_con, 'so_dong', v_sd, 'lay_luc', p.lay_luc,
    'phan_con', v_pc, 'xu_ly_thieu', coalesce((u->>'ql')::boolean, false),           -- NEW - 304
    'lan', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'luc', x.tao_luc, 'nguoi', coalesce(x.ten_nguoi, x.nguoi), 'tong', x.tong,
                                                         'tong_con', x.tong_con, 'so_dong', x.so_dong, 'trang_thai', x.trang_thai,
                                                         'loi', x.loi, 'ghi_chu', x.ghi_chu,
                                                         -- NEW - 304
                                                         'thieu', x.thieu, 'xl_tt', case when x.xl_tt = 'cho' and v_con <= 0 then 'da_bu' else x.xl_tt end,
                                                         'xl_cach', x.xl_cach, 'xl_ghi_chu', x.xl_ghi_chu, 'xl_nguoi', x.xl_nguoi, 'xl_luc', x.xl_luc,
                                                         'dong_thieu', (select coalesce(jsonb_agg(jsonb_build_object('ma', e->>'ma', 'nhan', (e->>'so_luong')::int, 'con', (e->>'con')::int)
                                                                                         order by e->>'ma'), '[]'::jsonb)
                                                                        from jsonb_array_elements(x.dong) e where (e->>'so_luong')::int < (e->>'con')::int))
                                       order by x.tao_luc desc)
                     from (select * from odoo_nhan where name = p_name order by tao_luc desc limit 5) x), '[]'::jsonb));
end $$;
revoke all on function chiahang._fn_odoo_nhan_tt(jsonb, text) from public, anon, authenticated;

-- 4) Số báo thiếu chờ xử lý (số đỏ trên menu) — chỉ Quản trị / Điều phối
create or replace function chiahang.fn_odoo_bao_thieu_dem(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to chiahang, public as $$
declare u jsonb;
begin
  u := _fn_dt_u(p_token);
  if not coalesce((u->>'ql')::boolean, false) then return jsonb_build_object('so', 0, 'sl', 0); end if;
  return (select jsonb_build_object('so', count(distinct b.name), 'sl', coalesce(sum(b.thieu), 0))
          from odoo_nhan b where b.xl_tt = 'cho' and _fn_odoo_bt_cho(b.name));
end $$;
revoke all on function chiahang.fn_odoo_bao_thieu_dem(uuid) from public;
grant execute on function chiahang.fn_odoo_bao_thieu_dem(uuid) to anon, authenticated;

-- 5) Xử lý báo thiếu
create or replace function chiahang.fn_odoo_bao_thieu_xu_ly(p_token uuid, p_id bigint, p_cach text, p_ghi_chu text default '')
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare u jsonb; v_name text; v_thieu int; v_don bigint; v_gc text := nullif(btrim(coalesce(p_ghi_chu, '')), '');
        v_ten text := case p_cach when 'giao_bu' then 'Kho giao bù' when 'huy_con_lai' then 'Đã huỷ phần còn lại' when 'khac' then 'Xử lý khác' end;
begin
  u := _fn_dt_u(p_token);
  if not coalesce((u->>'ql')::boolean, false) then return jsonb_build_object('ok', false, 'loi', 'Chỉ Quản trị / Điều phối xử lý báo thiếu'); end if;
  if v_ten is null then return jsonb_build_object('ok', false, 'loi', 'Chưa chọn cách xử lý'); end if;
  if p_cach = 'khac' and length(coalesce(v_gc, '')) < 3 then return jsonb_build_object('ok', false, 'loi', 'Ghi rõ đã xử lý thế nào'); end if;
  update odoo_nhan set xl_tt = 'xong', xl_cach = p_cach, xl_ghi_chu = left(v_gc, 500), xl_nguoi = coalesce(u->>'ten_day', u->>'ma'), xl_luc = now()
   where id = p_id and xl_tt = 'cho'
  returning name, thieu into v_name, v_thieu;
  if v_name is null then return jsonb_build_object('ok', false, 'loi', 'Báo thiếu này đã được xử lý hoặc không còn'); end if;
  select o.id into v_don from odoo_don o where o.name = v_name order by o.id desc limit 1;
  if v_don is not null then
    insert into odoo_su_kien (don_id, loai, noi_dung, du_lieu, nguoi)
    values (v_don, 'xu_ly', 'Xử lý báo thiếu ' || v_thieu || ' cái: ' || v_ten || coalesce(' — ' || v_gc, ''),
            jsonb_build_object('nhan_id', p_id, 'cach', p_cach), coalesce(u->>'ten_day', u->>'ma'));
  end if;
  return jsonb_build_object('ok', true, 'name', v_name);
end $$;
revoke all on function chiahang.fn_odoo_bao_thieu_xu_ly(uuid, bigint, text, text) from public;
grant execute on function chiahang.fn_odoo_bao_thieu_xu_ly(uuid, bigint, text, text) to anon, authenticated;

-- 6) Màn Đơn hàng Odoo: lọc nhom = 'bao_thieu' (xem mọi ngày) + mỗi dòng có số báo thiếu
do $do$
declare d text;
  o1 text := $q$declare u jsonb; v_q text;$q$;
  n1 text := $q$declare v_bt text[]; u jsonb; v_q text;$q$;
  o2 text := $q$  v_tu := case when v_q = '' then nullif(p_loc->>'tu', '')::date end;
  v_den := case when v_q = '' then nullif(p_loc->>'den', '')::date end;$q$;
  n2 text := $q$  v_tu := case when v_q = '' and coalesce(p_loc->>'nhom', '') <> 'bao_thieu' then nullif(p_loc->>'tu', '')::date end;    -- NEW - 304: báo thiếu xem mọi ngày
  v_den := case when v_q = '' and coalesce(p_loc->>'nhom', '') <> 'bao_thieu' then nullif(p_loc->>'den', '')::date end;
  v_bt := case when p_loc->>'nhom' = 'bao_thieu' then array(select distinct b.name from odoo_nhan b where b.xl_tt = 'cho' and _fn_odoo_bt_cho(b.name)) end;$q$;
  o3 text := $q$and (nullif(p_loc->>'nhom', '') is null or p_loc->>'nhom' = any (v.nhom))$q$;
  n3 text := $q$and (nullif(p_loc->>'nhom', '') is null or p_loc->>'nhom' = any (v.nhom) or v.name = any (v_bt))$q$;
  o4 text := $q$order by g.action_time desc nulls last limit 1) vc_tt$q$;
  n4 text := $q$order by g.action_time desc nulls last limit 1) vc_tt,
                                   -- NEW - 304: số cái cửa hàng báo thiếu, chờ Quản trị / Điều phối xử lý
                                   case when _fn_odoo_bt_cho(f.name) then (select sum(b.thieu) from odoo_nhan b where b.name = f.name and b.xl_tt = 'cho') end::int bao_thieu$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ds'::regproc);
  if position('NEW - 304' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_odoo_don_ds: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_odoo_don_ds: mốc 2'; end if;
  if (length(d) - length(replace(d, o3, ''))) / length(o3) <> 1 then raise exception 'fn_odoo_don_ds: mốc 3'; end if;
  if (length(d) - length(replace(d, o4, ''))) / length(o4) <> 1 then raise exception 'fn_odoo_don_ds: mốc 4'; end if;
  execute replace(replace(replace(replace(d, o1, n1), o2, n2), o3, n3), o4, n4);
end $do$;

-- 7) Thẻ "Nhận thiếu" trên màn Đơn hàng Odoo: số phiếu báo thiếu chờ xử lý (chỉ Quản trị / Điều phối)
do $do$
declare d text;
  o text := $q$    'dong_bo', v_db,$q$;
  n text := $q$    'bao_thieu', case when coalesce((u->>'ql')::boolean, false)   -- NEW - 304
                      then (select count(distinct b.name) from odoo_nhan b where b.xl_tt = 'cho' and _fn_odoo_bt_cho(b.name)) else 0 end,
    'dong_bo', v_db,$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_tong_quan'::regproc);
  if position('NEW - 304' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_tong_quan: mốc'; end if;
  execute replace(d, o, n);
end $do$;

notify pgrst, 'reload schema';
