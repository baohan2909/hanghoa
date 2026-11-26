-- ============================================================================
-- NEW - 303: NHẬN HÀNG TỪ APP — cửa hàng xác nhận nhận phiếu điều chuyển ngay trong app (anh yêu cầu 26/11 13:08)
--   API của IT: POST https://open.nonson.vn/api/webhook/transfer/complete-incoming   (X-API-Key dùng chung khoá 'odoo_api_key')
--     {"ma_phieu": "DK20261125-…", "chi_tiet": [{"barcode": "…", "so_luong": 7}, {"sku": "…", "so_luong": 10}]}
--   Luồng: màn Đơn hàng Odoo → mở phiếu → "Nhận hàng" → nhập số thực nhận từng mã (mặc định = còn chờ nhận) → Edge odoo-dieu-chuyen
--          (hanh_dong 'nhan') → fn_odoo_nhan_chuan_bi kiểm quyền + số → gửi Odoo → fn_odoo_nhan_ket_qua ghi kết quả.
--   Quyền: tài khoản của KHO NHẬN (ma_ch = kho yêu cầu của phiếu) hoặc ADMIN.
--   Chỉ nhận khi: phiếu không huỷ, kho đã xuất, còn phiếu nhập chờ nhận trên Odoo, mỗi mã 0 ≤ số nhận ≤ đã xuất − đã nhận.
--   Nhận ít hơn số chờ nhận → bắt buộc ghi lý do (lưu nhật ký app; API Odoo không có trường ghi chú).
--   Bật / tắt: tham số odoo_api → nhan_bat (bật tính năng), nhan_tat_ca (mở cho mọi cửa hàng), nhan_thu (tài khoản thử trước).
--   Số liệu trong app KHÔNG tự đổi: chỉ đổi khi lấy lại phiếu từ Odoo (app tự lấy ngay sau khi Odoo báo thành công).
-- ============================================================================

-- 1) Nhật ký mỗi lần bấm nhận
create table if not exists chiahang.odoo_nhan (
  id         bigserial primary key,
  name       text not null,
  kho        text,
  nguoi      text not null,
  ten_nguoi  text,
  ghi_chu    text,
  dong       jsonb not null default '[]'::jsonb,   -- [{barcode, sku, ma, ten, xuat, da_nhan, con, so_luong}]
  so_dong    int,
  tong       int,
  tong_con   int,
  url        text,
  payload    jsonb,
  http       int,
  phan_hoi   jsonb,
  trang_thai text not null default 'dang_gui',     -- dang_gui | xong | loi
  loi        text,
  tao_luc    timestamptz not null default now(),
  xong_luc   timestamptz
);
create index if not exists odoo_nhan_name_idx on chiahang.odoo_nhan (name, tao_luc desc);
alter table chiahang.odoo_nhan enable row level security;
revoke all on chiahang.odoo_nhan from anon, authenticated;

-- 2) Tham số: thêm khoá mới, KHÔNG đổi khoá cũ. Thử trước với tài khoản của anh; mở cho mọi cửa hàng = đổi nhan_tat_ca thành true.
update chiahang.tham_so
   set gia_tri = jsonb_build_object('nhan_bat', true, 'nhan_tat_ca', false, 'nhan_thu', jsonb_build_array('NS00490')) || gia_tri
 where key = 'odoo_api' and pham_vi = 'GLOBAL' and not (gia_tri ? 'nhan_bat');

-- 3) Dòng còn chờ nhận của 1 phiếu (theo dữ liệu Odoo đã lấy về)
create or replace function chiahang._fn_odoo_nhan_dong(p_name text)
returns jsonb language sql stable security definer set search_path to chiahang, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'barcode', d.barcode, 'sku', d.sku,
           'ma', coalesce(s.ma_tham_chieu, dm.ma_tham_chieu, d.sku, d.barcode),
           'ten', coalesce(dm.ten, s.nganh_3, nullif(regexp_replace(coalesce(d.ten_sp, ''), '^\[[^\]]*\]\s*', ''), '')),
           'xuat', coalesce(d.xuat, 0), 'da_nhan', coalesce(d.nhan, 0),
           'con', greatest(coalesce(d.xuat, 0) - coalesce(d.nhan, 0), 0))
         order by coalesce(s.ma_tham_chieu, dm.ma_tham_chieu, d.sku, d.barcode)), '[]'::jsonb)
  from odoo_phieu_dong d
  left join san_pham s on s.barcode = d.barcode
  left join lateral (select x.ma_tham_chieu, x.ten from sp_danh_muc x where x.barcode = d.barcode limit 1) dm on true
  where d.name = p_name and coalesce(d.xuat, 0) > coalesce(d.nhan, 0)
$$;
revoke all on function chiahang._fn_odoo_nhan_dong(text) from public, anon, authenticated;

-- 4) Trạng thái nhận của 1 phiếu cho người đang xem: được bấm không, vì sao không, 5 lần nhận gần nhất
create or replace function chiahang._fn_odoo_nhan_tt(u jsonb, p_name text)
returns jsonb language plpgsql stable security definer set search_path to chiahang, public as $$
declare c jsonb; p record; n record; v_mo boolean; v_quyen boolean; v_ly text; v_con int; v_sd int;
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
  return jsonb_build_object(
    'mo', v_mo, 'quyen', v_quyen, 'duoc', v_mo and v_quyen and v_ly is null, 'ly_do', v_ly,
    'kho', p.kho_yeu_cau, 'con', v_con, 'so_dong', v_sd, 'lay_luc', p.lay_luc,
    'lan', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'luc', x.tao_luc, 'nguoi', coalesce(x.ten_nguoi, x.nguoi), 'tong', x.tong,
                                                         'tong_con', x.tong_con, 'so_dong', x.so_dong, 'trang_thai', x.trang_thai,
                                                         'loi', x.loi, 'ghi_chu', x.ghi_chu) order by x.tao_luc desc)
                     from (select * from odoo_nhan where name = p_name order by tao_luc desc limit 5) x), '[]'::jsonb));
end $$;
revoke all on function chiahang._fn_odoo_nhan_tt(jsonb, text) from public, anon, authenticated;

-- 5) Chuẩn bị nhận: kiểm quyền + số, ghi nhật ký 'dang_gui', trả payload cho Edge gửi Odoo
--    p_dong: [{barcode, so_luong}] — mã không gửi lên = nhận 0. p_thu = true: chỉ xem trước, không ghi gì.
create or replace function chiahang.fn_odoo_nhan_chuan_bi(p_token uuid, p_name text, p_dong jsonb, p_ghi_chu text default '', p_thu boolean default false)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare u jsonb; t jsonb; c jsonb; v_cho jsonb; e jsonb; d jsonb; v_bc text; v_sl numeric; v_nhap jsonb := '{}'::jsonb;
        v_dong jsonb := '[]'::jsonb; v_ct jsonb := '[]'::jsonb; v_tong int := 0; v_con int := 0; v_thieu boolean := false;
        v_url text; v_payload jsonb; v_id bigint; v_gc text := btrim(coalesce(p_ghi_chu, ''));
begin
  u := _fn_dt_u(p_token);
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' then return jsonb_build_object('ok', false, 'loi', 'Thiếu mã phiếu'); end if;
  t := _fn_odoo_nhan_tt(u, p_name);
  if not (t->>'mo')::boolean then return jsonb_build_object('ok', false, 'loi', 'Nhận hàng qua app chưa mở cho tài khoản này'); end if;
  if not (t->>'quyen')::boolean then
    return jsonb_build_object('ok', false, 'loi', 'Chỉ tài khoản của kho nhận ' || coalesce(t->>'kho', '') || ' được xác nhận nhận phiếu này');
  end if;
  if t->>'ly_do' is not null then return jsonb_build_object('ok', false, 'loi', t->>'ly_do'); end if;

  -- số anh nhập: barcode -> số nhận (không lặp, số nguyên ≥ 0)
  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_dong) = 'array' then p_dong else '[]'::jsonb end) x loop
    v_bc := btrim(coalesce(e->>'barcode', ''));
    if v_bc = '' then return jsonb_build_object('ok', false, 'loi', 'Có dòng thiếu mã vạch'); end if;
    if v_nhap ? v_bc then return jsonb_build_object('ok', false, 'loi', 'Mã ' || v_bc || ' bị lặp'); end if;
    begin v_sl := (e->>'so_luong')::numeric; exception when others then v_sl := null; end;
    if v_sl is null or v_sl < 0 or v_sl <> trunc(v_sl) then
      return jsonb_build_object('ok', false, 'loi', 'Số nhận của mã ' || v_bc || ' phải là số nguyên từ 0 trở lên');
    end if;
    v_nhap := v_nhap || jsonb_build_object(v_bc, v_sl::int);
  end loop;

  v_cho := _fn_odoo_nhan_dong(p_name);
  -- mã gửi lên phải nằm trong danh sách đang chờ nhận
  select string_agg(k, ', ') into v_bc from jsonb_object_keys(v_nhap) k
   where not exists (select 1 from jsonb_array_elements(v_cho) x where x->>'barcode' = k);
  if v_bc is not null then
    return jsonb_build_object('ok', false, 'loi', 'Mã không còn chờ nhận trong phiếu này: ' || left(v_bc, 200) || ' — bấm "Lấy mới từ Odoo" rồi nhận lại');
  end if;

  for d in select x from jsonb_array_elements(v_cho) x loop
    v_sl := coalesce((v_nhap->>(d->>'barcode'))::int, 0);
    if v_sl > (d->>'con')::int then
      return jsonb_build_object('ok', false, 'loi', 'Mã ' || (d->>'ma') || ': nhận ' || v_sl || ' nhiều hơn số kho đã xuất còn chờ nhận (' || (d->>'con') || ')');
    end if;
    v_con := v_con + (d->>'con')::int;
    v_tong := v_tong + v_sl::int;
    if v_sl < (d->>'con')::int then v_thieu := true; end if;
    v_dong := v_dong || jsonb_build_array(d || jsonb_build_object('so_luong', v_sl::int));
    if v_sl > 0 then
      v_ct := v_ct || jsonb_build_array(case when coalesce(d->>'barcode', '') <> ''
                                              then jsonb_build_object('barcode', d->>'barcode', 'so_luong', v_sl::int)
                                              else jsonb_build_object('sku', d->>'sku', 'so_luong', v_sl::int) end);
    end if;
  end loop;
  if v_tong <= 0 then return jsonb_build_object('ok', false, 'loi', 'Chưa có mã nào nhận số lượng lớn hơn 0'); end if;
  if v_thieu and length(v_gc) < 3 then
    return jsonb_build_object('ok', false, 'loi', 'Nhận ít hơn số kho đã xuất — ghi lý do (vd: thiếu hàng trong thùng, hàng lỗi…)', 'can_ly_do', true);
  end if;

  select gia_tri into c from tham_so where key = 'odoo_api' and pham_vi = 'GLOBAL';
  v_url := coalesce(nullif(btrim(c->>'nhan_url'), ''),
                    regexp_replace(coalesce(nullif(btrim(c->>'url'), ''), 'https://open.nonson.vn/api/webhook/transfer'), '/+$', '') || '/complete-incoming');
  v_payload := jsonb_build_object('ma_phieu', p_name, 'chi_tiet', v_ct);
  if p_thu then
    return jsonb_build_object('ok', true, 'xem_truoc', true, 'url', v_url, 'payload', v_payload, 'dong', v_dong, 'tong', v_tong, 'tong_con', v_con);
  end if;

  insert into odoo_nhan (name, kho, nguoi, ten_nguoi, ghi_chu, dong, so_dong, tong, tong_con, url, payload)
  values (p_name, t->>'kho', u->>'ma', u->>'ten_day', nullif(v_gc, ''), v_dong, jsonb_array_length(v_ct), v_tong, v_con, v_url, v_payload)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'url', v_url, 'payload', v_payload, 'tong', v_tong, 'tong_con', v_con);
end $$;
revoke all on function chiahang.fn_odoo_nhan_chuan_bi(uuid, text, jsonb, text, boolean) from public;
grant execute on function chiahang.fn_odoo_nhan_chuan_bi(uuid, text, jsonb, text, boolean) to anon, authenticated, service_role;

-- 6) Ghi kết quả Odoo (chỉ Edge gọi — service_role). Odoo chưa công bố mẫu phản hồi → đọc rộng:
--    thành công = HTTP 2xx, không lỗi mạng, status / success / results[] không báo lỗi.
create or replace function chiahang.fn_odoo_nhan_ket_qua(p_id bigint, p_http int, p_phan_hoi jsonb, p_loi text)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare n record; v_st text; v_msg text; v_ok boolean; v_r jsonb; v_don bigint; v_loi text;
begin
  select * into n from odoo_nhan where id = p_id;
  if n.id is null then return jsonb_build_object('ok', false, 'loi', 'Không có lần nhận này'); end if;
  v_st := lower(coalesce(p_phan_hoi->>'status', p_phan_hoi->>'trang_thai', p_phan_hoi->>'state', ''));
  v_r := case when jsonb_typeof(p_phan_hoi->'results') = 'array' then p_phan_hoi->'results'
              when jsonb_typeof(p_phan_hoi->'result') = 'object' then jsonb_build_array(p_phan_hoi->'result') else '[]'::jsonb end;
  v_msg := coalesce(p_phan_hoi->>'message', p_phan_hoi->>'thong_bao', p_phan_hoi->>'msg', p_phan_hoi->>'loi',
                    case when jsonb_typeof(p_phan_hoi->'error') = 'string' then p_phan_hoi->>'error' else p_phan_hoi->'error'->>'message' end,
                    (select string_agg(x->>'message', '; ') from jsonb_array_elements(v_r) x where x->>'message' is not null));
  v_ok := p_loi is null and coalesce(p_http, 0) between 200 and 299
          and v_st not in ('error', 'failed', 'fail', 'refused', 'not_found', 'invalid', 'loi')
          and (jsonb_typeof(p_phan_hoi->'success') is distinct from 'boolean' or (p_phan_hoi->>'success')::boolean)
          and (jsonb_typeof(p_phan_hoi->'ok') is distinct from 'boolean' or (p_phan_hoi->>'ok')::boolean)
          and not coalesce(p_phan_hoi ? 'raw', false)
          and not exists (select 1 from jsonb_array_elements(v_r) x
                          where lower(coalesce(x->>'status', '')) in ('error', 'failed', 'fail', 'refused', 'not_found', 'invalid'));
  v_loi := case when v_ok then null
                else coalesce(p_loi, v_msg, case when coalesce(p_phan_hoi ? 'raw', false) then 'Odoo trả về không phải JSON (HTTP ' || coalesce(p_http, 0) || ')' end,
                              'Odoo báo lỗi (HTTP ' || coalesce(p_http, 0) || ')') end;
  update odoo_nhan set http = p_http, phan_hoi = p_phan_hoi, trang_thai = case when v_ok then 'xong' else 'loi' end,
                       loi = left(v_loi, 1000), xong_luc = now()
   where id = p_id;

  -- đơn do app tạo → ghi thêm vào nhật ký đơn
  select o.id into v_don from odoo_don o where o.name = n.name order by o.id desc limit 1;
  if v_don is not null then
    insert into odoo_su_kien (don_id, loai, noi_dung, du_lieu, nguoi)
    values (v_don, case when v_ok then 'ket_qua' else 'loi' end,
            case when v_ok then 'Xác nhận nhận hàng qua app: ' || n.tong || ' / ' || n.tong_con || ' cái chờ nhận'
                                || case when n.tong < n.tong_con then ' — nhận thiếu: ' || coalesce(n.ghi_chu, '') else '' end
                 else 'Nhận hàng qua app không thành công: ' || left(v_loi, 300) end,
            jsonb_build_object('nhan_id', n.id, 'http', p_http, 'phan_hoi', p_phan_hoi), coalesce(n.ten_nguoi, n.nguoi));
  end if;
  return jsonb_build_object('ok', v_ok, 'loi', v_loi, 'thong_bao', v_msg, 'name', n.name, 'tong', n.tong, 'tong_con', n.tong_con);
end $$;
revoke all on function chiahang.fn_odoo_nhan_ket_qua(bigint, int, jsonb, text) from public, anon, authenticated;
grant execute on function chiahang.fn_odoo_nhan_ket_qua(bigint, int, jsonb, text) to service_role;

-- 7) Màn chi tiết phiếu (fn_odoo_don_ct) trả thêm 'nhan_hang' = trạng thái nhận + 5 lần nhận gần nhất
do $do$
declare d text;
  o text := $q$jsonb_build_object('ton', v_ton, 'kho_odoo', v_ko, 'van_don', v_vd,$q$;
  n text := $q$jsonb_build_object('nhan_hang', _fn_odoo_nhan_tt(u, v_ten),   -- NEW - 303
                                                        'ton', v_ton, 'kho_odoo', v_ko, 'van_don', v_vd,$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ct'::regproc);
  if position('NEW - 303' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_don_ct: mốc'; end if;
  execute replace(d, o, n);
end $do$;
