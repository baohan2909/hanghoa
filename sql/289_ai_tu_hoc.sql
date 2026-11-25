-- ============================================================================
-- NEW - 289: SIÊU TRÍ TUỆ TỰ HỌC + SỔ VẤN ĐỀ TOÀN APP
--   1. fn_ai_van_de()      : sổ vấn đề toàn app — tính bằng dữ liệu (0 token), giữ 10 phút. AI đọc mỗi câu hỏi; màn Siêu trí tuệ hiện sẵn.
--   2. ai_hoc_lan + fn_ai_hoc_*: AI tự học bằng AI thật (tốn token, CÓ TRẦN mỗi ngày — tham_so 'ai_hoc'):
--        đọc lại các câu đã hỏi (câu trả lời, công cụ đã dùng, câu hỏi tiếp theo = có bị sửa không, báo sai, lỗi) + sổ vấn đề
--        → rút bài học (nghĩa từ / quy tắc / lỗi cần tránh / câu mẫu / kiến thức) → "Chờ duyệt" kèm bằng chứng. Anh duyệt mới dùng.
--      Không thêm lịch chạy: app gọi khi có người mở (tối đa mỗi cach_gio giờ), Quản trị bấm "Học ngay".
--   3. ai_tri_thuc: thêm loại cau_mau · kien_thuc, cột bang_chung / hoc_lan; fn_ai_tri_thuc_cho chọn tối đa 20 mục.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Tri thức: loại mới + bằng chứng
-- ---------------------------------------------------------------------------
do $do$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'chiahang.ai_tri_thuc'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tu_ngu%' loop
    execute format('alter table chiahang.ai_tri_thuc drop constraint %I', c);
  end loop;
end $do$;
alter table chiahang.ai_tri_thuc add constraint ai_tri_thuc_loai_check check (loai in ('tu_ngu', 'quy_tac', 'sua_sai', 'cau_mau', 'kien_thuc'));
alter table chiahang.ai_tri_thuc add column if not exists bang_chung jsonb, add column if not exists hoc_lan bigint;

-- ---------------------------------------------------------------------------
-- 1. Thông số tự học (anh chỉnh ở màn Tri thức — Quản trị)
-- ---------------------------------------------------------------------------
insert into chiahang.tham_so (key, pham_vi, gia_tri, mo_ta)
select 'ai_hoc', 'chung', '{"bat": true, "tran_token_ngay": 400000, "cach_gio": 4, "toi_da_cau": 80}'::jsonb,
       'SIÊU TRÍ TUỆ tự học: bật/tắt · trần token mỗi ngày cho phần tự học · tối thiểu bao nhiêu giờ học 1 lần · tối đa số câu đọc lại mỗi lần'
where not exists (select 1 from chiahang.tham_so where key = 'ai_hoc' and pham_vi = 'chung');

create table if not exists chiahang.ai_hoc_lan (
  id bigserial primary key,
  bat_dau timestamptz not null default now(),
  ket_thuc timestamptz,
  kich_hoat text,                       -- mo_app | tay
  nguoi text,
  trang_thai text not null default 'dang_chay' check (trang_thai in ('dang_chay', 'xong', 'loi', 'bo')),
  tu_luc timestamptz, den_luc timestamptz,
  so_cau int default 0,
  mo_hinh text,
  token_vao bigint default 0, token_ra bigint default 0,
  so_bai int default 0, so_trung int default 0,
  tom_tat text, loi text
);
alter table chiahang.ai_hoc_lan enable row level security;
create index if not exists ai_hoc_lan_bat_dau on chiahang.ai_hoc_lan (bat_dau desc);

-- ---------------------------------------------------------------------------
-- 2. SỔ VẤN ĐỀ TOÀN APP (0 token) — mỗi mục: muc (do | vang) · nhom · tieu_de · chi_tiet · man (màn để bấm tới) · so
-- ---------------------------------------------------------------------------
create or replace function chiahang._fn_ai_vd(p_muc text, p_nhom text, p_tieu_de text, p_chi_tiet text, p_man text, p_so numeric default null)
returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('muc', p_muc, 'nhom', p_nhom, 'tieu_de', p_tieu_de, 'chi_tiet', nullif(p_chi_tiet, ''), 'man', p_man, 'so', p_so)))
$$;

create or replace function chiahang.fn_ai_van_de(p_ep boolean default false)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare c record; v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_gio int := extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int;
  ds jsonb := '[]'::jsonb; v_loi jsonb := '[]'::jsonb; tq jsonb; x jsonb; n int; n2 int; t timestamptz; t2 timestamptz; s text; t0 timestamptz := clock_timestamp(); kq jsonb;
begin
  select * into c from ai_so_lieu where khoa = 'van_de';
  if found and not p_ep and c.luc > now() - interval '10 minutes' then
    return c.kq || jsonb_build_object('luc', c.luc, 'tuoi_phut', round(extract(epoch from now() - c.luc) / 60));
  end if;

  -- a. CỬA HÀNG — khối số liệu màn Tổng quan (đã tính sẵn)
  begin
    tq := (fn_ai_tong_quan())->'so_lieu';
    n := coalesce((tq->>'chay_hang')::int, 0);
    if n > 0 then ds := ds || _fn_ai_vd('do', 'Cửa hàng', format('%s mã cháy hàng — kho còn mà nơi bán đã hết', n), null, 'tong_quan', n); end if;
    n := coalesce((tq->'thieu'->>'so_ch')::int, 0);
    if n > 0 then
      select string_agg((e->>'ten') || ' hụt ' || (e->>'hut'), ' · ') into s from (select e from jsonb_array_elements(coalesce(tq->'thieu'->'top_ch', '[]')) e limit 5) z;
      ds := ds || _fn_ai_vd('vang', 'Cửa hàng', format('%s/%s cửa hàng dưới định mức tối thiểu, hụt %s sản phẩm', n, coalesce(tq->'thieu'->>'tong_ch', '?'), coalesce(tq->'thieu'->>'sp_hut', '?')), s, 'tong_quan', n);
    end if;
    n := coalesce((tq->>'can_sx')::int, 0);
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Cửa hàng', format('%s mã hết sạch toàn hệ thống (kho tổng cũng hết) — cần sản xuất', n), null, 'tong_quan', n); end if;
    if jsonb_array_length(coalesce(tq->'thieu_ma', '[]')) > 0 then
      select string_agg((e->>'ma_tham_chieu') || ' hết ' || (e->>'ch_het') || ' nơi, kho còn ' || (e->>'ton_kho'), ' · ') into s from (select e from jsonb_array_elements(tq->'thieu_ma') e limit 5) z;
      ds := ds || _fn_ai_vd('vang', 'Cửa hàng', format('%s mã phân bổ chưa hợp lý — nhiều nơi cần mà hết hàng', jsonb_array_length(tq->'thieu_ma')), s, 'tong_quan', jsonb_array_length(tq->'thieu_ma'));
    end if;
    n := greatest(coalesce((tq->'lich'->>'so_lich')::int, 0) - coalesce((tq->'lich'->>'da_gui')::int, 0) - coalesce((tq->'lich'->>'kdn')::int, 0), 0);
    if n > 0 and v_gio >= 10 then ds := ds || _fn_ai_vd('vang', 'Đề nghị hàng', format('%s nơi có lịch hôm nay chưa gửi đề nghị', n), null, 'lich_de_nghi', n); end if;
    n := coalesce((tq->>'ycdp_cho')::int, 0);
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Điều phối', format('%s yêu cầu điều phối chờ xử lý', n), null, 'tong_quan', n); end if;
    select string_agg(coalesce(e->>'buoc', '?') || ': ' || coalesce(e->>'tt', '?'), ' · ') into s from jsonb_array_elements(coalesce(tq->'sync', '[]')) e where coalesce(e->>'tt', '') not in ('OK', 'DANG_CHAY');
    if s is not null then ds := ds || _fn_ai_vd('vang', 'Đồng bộ', 'Đồng bộ Odoo chưa xong lượt gần nhất', s, 'tong_quan'); end if;
  exception when others then v_loi := v_loi || jsonb_build_array('tong_quan: ' || left(sqlerrm, 140));
  end;

  -- b. ODOO — đơn lỗi, đơn kẹt, đơn tạo lâu chưa xuất
  begin
    select count(*), string_agg(left(coalesce(name, '?') || ': ' || coalesce(loi, ''), 90), ' · ') filter (where rn <= 3) into n, s
    from (select name, loi, row_number() over (order by tao_luc desc) rn from odoo_don where trang_thai = 'loi' and tao_luc > now() - interval '24 hours') z;
    if n > 0 then ds := ds || _fn_ai_vd('do', 'Odoo', format('%s đơn Odoo lỗi trong 24 giờ', n), s, 'dieu_chuyen', n); end if;
    select count(*) into n from odoo_don where trang_thai in ('cho_gui', 'dang_gui', 'chua_ro') and coalesce(gui_luc, tao_luc) < now() - interval '15 minutes';
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Odoo', format('%s đơn Odoo gửi quá 15 phút chưa rõ kết quả', n), null, 'dieu_chuyen', n); end if;
    select sum(k), string_agg(coalesce(odoo_tt, '?') || ' ' || k || ' (' || coalesce(man, '?') || ')', ' · ') into n, s from (
      select odoo_tt, man, count(*) k from odoo_don
      where trang_thai = 'thanh_cong' and coalesce(odoo_tt, '') in ('Chưa chuyển', 'Chờ sẵn sàng', 'Nháp') and tao_luc < now() - interval '2 days' and tao_luc > now() - interval '30 days' and huy is null
      group by 1, 2) z;
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Odoo', format('%s đơn Odoo tạo hơn 2 ngày vẫn chưa xuất kho', n), s, 'dieu_chuyen', n); end if;
  exception when others then v_loi := v_loi || jsonb_build_array('odoo: ' || left(sqlerrm, 140));
  end;

  -- c. ONLINE — phiếu treo, nháp, mã đang bán hết hàng online (khối tính sẵn của màn Chia hàng Online)
  begin
    select o.kq into x from ol_nho o where o.khoa = 'du_lieu';
    if x is not null then
      n := jsonb_array_length(coalesce(x->'treo', '[]'));
      if n > 0 then
        ds := ds || _fn_ai_vd('vang', 'Online', format('%s phiếu Odoo đã xuất hơn 4 ngày mà Nhanh chưa nhập (%s cái)', n,
                (select coalesce(sum((e->>'sl')::int), 0) from jsonb_array_elements(x->'treo') e)), null, 'chia_online', n);
      end if;
      n := coalesce((x->>'nhap_cho')::int, 0);
      if n > 0 then ds := ds || _fn_ai_vd('vang', 'Online', format('%s phiếu chia online còn nháp, chưa lên Odoo', n), null, 'chia_online', n); end if;
      select count(*), string_agg(m, ', ') filter (where rn <= 6) into n, s from (
        select e->>'m' m, row_number() over (order by coalesce((e->>'s7')::int, 0) desc) rn
        from jsonb_array_elements(coalesce(x->'rows', '[]')) e
        where coalesce((e->>'cb')::numeric, 0) <= 0 and coalesce((e->>'s7')::int, 0) >= 3) z;
      if n > 0 then ds := ds || _fn_ai_vd('do', 'Online', format('%s mã bán online (≥ 3 cái / 7 ngày) đang hết hàng online', n), s, 'chia_online', n); end if;
    end if;
  exception when others then v_loi := v_loi || jsonb_build_array('online: ' || left(sqlerrm, 140));
  end;

  -- d. ĐỘI SALE + việc AI chờ duyệt
  begin
    select count(*) into n from ai_thao_tac where trang_thai = 'cho_duyet';
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Siêu trí tuệ', format('%s việc AI đề xuất đang chờ anh duyệt', n), null, 'sieu_tri_tue', n); end if;
    select count(*) into n from ai_bao_sai where xu_ly is null;
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Siêu trí tuệ', format('%s câu trả lời bị báo sai chưa xử lý', n), null, 'sieu_tri_tue', n); end if;
    select count(*) into n from ai_viec where trang_thai = 'loi' and bat_dau > now() - interval '24 hours';
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'Siêu trí tuệ', format('%s câu hỏi AI chạy lỗi trong 24 giờ', n), null, 'sieu_tri_tue', n); end if;
  exception when others then v_loi := v_loi || jsonb_build_array('doi_sale: ' || left(sqlerrm, 140));
  end;

  -- e. TIKTOK
  begin
    select count(*) filter (where ngay = v_hn and tt = 'cho_tt'), count(*) filter (where tt in ('cho_gui', 'cho_dong_goi') and tao_luc < now() - interval '24 hours')
      into n, n2 from tt_don where ngay >= v_hn - 10;
    if n > 0 then ds := ds || _fn_ai_vd('vang', 'TikTok', format('%s đơn TikTok hôm nay chờ thanh toán (đang tính trong doanh thu)', n), null, 'tiktok', n); end if;
    if n2 > 0 then ds := ds || _fn_ai_vd('do', 'TikTok', format('%s đơn TikTok chờ gửi hàng quá 24 giờ', n2), null, 'tiktok', n2); end if;
    select keo_luc, left(loi, 140) into t, s from tt_api order by id limit 1;
    if s is not null then ds := ds || _fn_ai_vd('do', 'TikTok', 'Kéo đơn TikTok đang báo lỗi', s, 'tiktok'); end if;
    if t is not null and t < now() - interval '45 minutes' then ds := ds || _fn_ai_vd('vang', 'TikTok', format('Đơn TikTok chưa cập nhật %s phút', round(extract(epoch from now() - t) / 60)), null, 'tiktok'); end if;
  exception when others then v_loi := v_loi || jsonb_build_array('tiktok: ' || left(sqlerrm, 140));
  end;
  begin
    select het_han into t from tt_api order by id limit 1;
    if t is not null and t < now() + interval '2 days' then
      ds := ds || _fn_ai_vd(case when t < now() then 'do' else 'vang' end, 'TikTok', 'Khoá kết nối TikTok ' || case when t < now() then 'đã hết hạn' else 'sắp hết hạn ' || to_char(t at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end, null, 'tiktok');
    end if;
  exception when others then null;
  end;

  -- f. NHANH (online) — kéo đơn / tồn chậm, lỗi
  begin
    select keo_luc, ton_luc, case when loi_luc > now() - interval '6 hours' then left(loi, 140) end into t, t2, s from nh_api order by id limit 1;
    if s is not null then ds := ds || _fn_ai_vd('do', 'Nhanh', 'Kéo dữ liệu Nhanh báo lỗi trong 6 giờ qua', s, 'chia_online'); end if;
    if t is not null and t < now() - interval '45 minutes' then ds := ds || _fn_ai_vd('vang', 'Nhanh', format('Đơn Nhanh chưa cập nhật %s phút', round(extract(epoch from now() - t) / 60)), null, 'chia_online'); end if;
    if t2 is not null and t2 < now() - interval '90 minutes' then ds := ds || _fn_ai_vd('vang', 'Nhanh', format('Tồn kho online chưa cập nhật %s phút', round(extract(epoch from now() - t2) / 60)), null, 'chia_online'); end if;
  exception when others then v_loi := v_loi || jsonb_build_array('nhanh: ' || left(sqlerrm, 140));
  end;

  -- g. BÁN HÀNG CỬA HÀNG / ĐỘI SALE — số bán cập nhật chậm (giờ mở cửa 9h–22h)
  begin
    if v_gio between 10 and 22 then
      select max(ngay + gio) into t from ban_hang where ngay >= v_hn - 1;
      if t is null or t < (now() at time zone 'Asia/Ho_Chi_Minh') - interval '2 hours' then
        ds := ds || _fn_ai_vd('vang', 'Bán hàng', 'Số bán cửa hàng chưa cập nhật hơn 2 giờ' || coalesce(' (mới nhất ' || to_char(t, 'DD/MM HH24:MI') || ')', ''), null, 'tong_quan');
      end if;
    end if;
  exception when others then v_loi := v_loi || jsonb_build_array('ban_hang: ' || left(sqlerrm, 140));
  end;

  -- h. TÁC VỤ TỰ ĐỘNG chạy lỗi (6 giờ)
  begin
    select count(*), string_agg(distinct j.jobname, ', ') into n, s from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where d.status = 'failed' and d.start_time > now() - interval '6 hours';
    if n > 0 then ds := ds || _fn_ai_vd(case when n >= 5 then 'do' else 'vang' end, 'Tự động', format('%s lượt tác vụ tự động chạy lỗi trong 6 giờ', n), s, 'tham_so', n); end if;
  exception when others then v_loi := v_loi || jsonb_build_array('tu_dong: ' || left(sqlerrm, 140));
  end;

  -- đỏ trước, vàng sau
  select coalesce(jsonb_agg(e order by case e->>'muc' when 'do' then 0 else 1 end, ord), '[]') into ds from jsonb_array_elements(ds) with ordinality z(e, ord);
  kq := jsonb_build_object('ds', ds, 'so_do', (select count(*) from jsonb_array_elements(ds) e where e->>'muc' = 'do'),
                           'so_vang', (select count(*) from jsonb_array_elements(ds) e where e->>'muc' = 'vang'), 'loi', v_loi, 'ngay', v_hn);
  insert into ai_so_lieu (khoa, kq, luc, ms) values ('van_de', kq, now(), round(extract(epoch from clock_timestamp() - t0) * 1000))
  on conflict (khoa) do update set kq = excluded.kq, luc = excluded.luc, ms = excluded.ms;
  return kq || jsonb_build_object('luc', now(), 'tuoi_phut', 0);
end $$;
revoke all on function chiahang.fn_ai_van_de(boolean) from public, anon, authenticated;
grant execute on function chiahang.fn_ai_van_de(boolean) to service_role;

-- màn Siêu trí tuệ: ai đã đăng nhập cũng xem được (như màn Tổng quan)
create or replace function chiahang.fn_ai_van_de_xem(p_token uuid, p_ep boolean default false)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
begin
  perform _fn_dt_u(p_token);
  return fn_ai_van_de(p_ep);
end $$;
grant execute on function chiahang.fn_ai_van_de_xem(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. SỔ SỐ LIỆU (285) đọc kèm sổ vấn đề toàn app
-- ---------------------------------------------------------------------------
do $do$
declare d text;
  o text := $q$  kq := kq || jsonb_build_object('ngay', v_hn, 'loi', v_loi);$q$;
  n text := $q$  begin   -- NEW - 289: sổ vấn đề toàn app
    kq := kq || jsonb_build_object('van_de_app', (fn_ai_van_de(false))->'ds');
  exception when others then v_loi := v_loi || jsonb_build_array('van_de_app: ' || left(sqlerrm, 140));
  end;
  kq := kq || jsonb_build_object('ngay', v_hn, 'loi', v_loi);$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_so_lieu'::regproc);
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_ai_so_lieu: không thấy mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- ---------------------------------------------------------------------------
-- 4. CHỌN TRI THỨC cho câu hỏi — thêm câu mẫu / kiến thức, tối đa 20 mục
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_tri_thuc_cho(p_yeu_cau text)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare v_cau text := fn_ai_chuan_chu(p_yeu_cau); r jsonb; v_ids bigint[];
begin
  with k as (
    select t.*, coalesce(m.dai, 0) dai,
           case when t.loai in ('sua_sai', 'cau_mau') and t.cau_mau is not null then fn_ai_giong(t.cau_mau, p_yeu_cau) else 0 end giong
    from ai_tri_thuc t
    left join lateral (
      select max(length(trim(fn_ai_chuan_chu(c)))) dai from unnest(string_to_array(t.cum_tu, ',')) c
      where trim(fn_ai_chuan_chu(c)) <> '' and v_cau like '%' || fn_ai_chuan_chu(c) || '%') m on true
    where t.trang_thai = 'dung'
  ), d as (
    select k.*, case when loai = 'quy_tac' then 3
                     when loai = 'sua_sai' and giong >= 0.6 then 2.5
                     when loai = 'cau_mau' and giong >= 0.7 then 2.2
                     when dai > 0 then 1 else 0 end diem
    from k
  ), chon as (
    (select * from d where loai = 'cau_mau' and diem > 0 order by giong desc limit 2)
    union all
    (select * from d where loai <> 'cau_mau' and diem > 0 order by diem desc, dai desc, cap_nhat desc limit 18)
  )
  select jsonb_agg(jsonb_build_object('id', id, 'loai', loai, 'cum_tu', cum_tu, 'cau_mau', case when loai in ('cau_mau', 'sua_sai') then cau_mau end,
                                      'noi_dung', noi_dung, 'cong_cu', cong_cu) order by diem desc, id),
         array_agg(id)
  into r, v_ids from chon;
  if v_ids is not null then update ai_tri_thuc set so_lan_dung = so_lan_dung + 1, dung_cuoi = now() where id = any(v_ids); end if;
  return coalesce(r, '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 5. TỰ HỌC — bắt đầu (kiểm trần token, khoảng cách giờ, khoá 1 lượt) · tư liệu · ghi bài học
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_hoc_bat_dau(p_kich_hoat text, p_nguoi text)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare cfg jsonb := coalesce((select gia_tri from tham_so where key = 'ai_hoc' and pham_vi = 'chung'), '{}');
  v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_dung bigint; v_tran bigint := coalesce((cfg->>'tran_token_ngay')::bigint, 400000);
  v_cuoi timestamptz; v_tu timestamptz; v_so int; v_id bigint;
begin
  if not coalesce((cfg->>'bat')::boolean, true) then return jsonb_build_object('chay', false, 'ly_do', 'Tự học đang tắt'); end if;
  perform pg_advisory_xact_lock(hashtext('ai_hoc_lan'));
  update ai_hoc_lan set trang_thai = 'loi', ket_thuc = now(), loi = 'Quá 15 phút không xong' where trang_thai = 'dang_chay' and bat_dau < now() - interval '15 minutes';
  if exists (select 1 from ai_hoc_lan where trang_thai = 'dang_chay') then return jsonb_build_object('chay', false, 'ly_do', 'Đang có lượt học khác'); end if;
  select coalesce(sum(token_vao + token_ra), 0) into v_dung from ai_hoc_lan where (bat_dau at time zone 'Asia/Ho_Chi_Minh')::date = v_hn;
  if v_dung >= v_tran then return jsonb_build_object('chay', false, 'ly_do', format('Đã dùng hết trần tự học hôm nay (%s / %s token)', v_dung, v_tran)); end if;
  select max(bat_dau) into v_cuoi from ai_hoc_lan where trang_thai in ('xong', 'bo');
  if p_kich_hoat <> 'tay' and v_cuoi is not null and v_cuoi > now() - make_interval(hours => greatest(1, coalesce((cfg->>'cach_gio')::int, 4))) then
    return jsonb_build_object('chay', false, 'ly_do', 'Chưa tới giờ học lượt sau');
  end if;
  select coalesce(max(den_luc), now() - interval '24 hours') into v_tu from ai_hoc_lan where trang_thai = 'xong';
  v_tu := greatest(v_tu, now() - interval '3 days');
  select count(*) into v_so from ai_viec where bat_dau > v_tu and bat_dau < now() - interval '2 minutes' and trang_thai in ('xong', 'loi', 'dung');
  if v_so = 0 then
    insert into ai_hoc_lan (kich_hoat, nguoi, trang_thai, tu_luc, den_luc, so_cau, ket_thuc, tom_tat)
    values (p_kich_hoat, p_nguoi, 'bo', v_tu, now(), 0, now(), 'Không có câu hỏi mới để học');
    return jsonb_build_object('chay', false, 'ly_do', 'Không có câu hỏi mới để học');
  end if;
  insert into ai_hoc_lan (kich_hoat, nguoi, tu_luc, den_luc, so_cau) values (p_kich_hoat, p_nguoi, v_tu, now() - interval '2 minutes', v_so) returning id into v_id;
  return jsonb_build_object('chay', true, 'lan', v_id, 'so_cau', v_so, 'con_token', v_tran - v_dung, 'toi_da_cau', coalesce((cfg->>'toi_da_cau')::int, 80));
end $$;

create or replace function chiahang.fn_ai_hoc_tu_lieu(p_lan bigint)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare l ai_hoc_lan; cfg jsonb := coalesce((select gia_tri from tham_so where key = 'ai_hoc' and pham_vi = 'chung'), '{}'); v_toi int; cau jsonb; tri jsonb; vd jsonb;
begin
  select * into l from ai_hoc_lan where id = p_lan;
  if not found then raise exception 'Không có lượt học %', p_lan; end if;
  v_toi := least(coalesce((cfg->>'toi_da_cau')::int, 80), 150);
  -- các câu đã hỏi: câu hỏi · màn · trả lời (cắt ngắn) · công cụ đã gọi + tham số · lỗi · câu hỏi KẾ TIẾP cùng phiên (để biết có bị sửa / hỏi lại không) · báo sai
  select coalesce(jsonb_agg(x order by x->>'luc'), '[]') into cau from (
    select jsonb_strip_nulls(jsonb_build_object(
      'viec', v.id, 'luc', to_char(v.bat_dau at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'), 'nguoi', v.nguoi, 'man', v.man,
      'hoi', left(v.yeu_cau, 400), 'tra_loi', left(coalesce(v.tra_loi, ''), 900), 'trang_thai', v.trang_thai, 'loi', left(v.loi, 200), 'so_luot', v.so_luot,
      'cong_cu', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('ten', b.ten, 'tham_so', left(b.tham_so::text, 240), 'loi', case when b.trang_thai = 'loi' then left(b.ket_qua::text, 200) end)) order by b.stt)
                  from ai_buoc b where b.viec_id = v.id and b.ten is not null and b.ten not in ('so_lieu', 'ke_hoach', 'tri_thuc', 'tu_tom_tat') and b.ten !~ '^(claude|gpt|o[0-9])'),
      'cau_sau', (select left(v2.yeu_cau, 300) from ai_viec v2 where v2.phien_id = v.phien_id and v2.bat_dau > v.bat_dau and v2.bat_dau < v.bat_dau + interval '20 minutes' order by v2.bat_dau limit 1),
      'bao_sai', (select string_agg(coalesce(bs.ghi_chu, 'báo sai'), ' | ') from ai_bao_sai bs where bs.viec_id = v.id))) x
    from ai_viec v
    where v.bat_dau > l.tu_luc and v.bat_dau <= l.den_luc and v.trang_thai in ('xong', 'loi', 'dung')
    order by v.bat_dau desc limit v_toi) z;
  -- tri thức đang có (để không học trùng)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'loai', loai, 'cum_tu', left(cum_tu, 80), 'noi_dung', left(noi_dung, 220), 'tt', trang_thai) order by id), '[]')
    into tri from ai_tri_thuc where trang_thai <> 'tat';
  vd := (fn_ai_van_de(false))->'ds';
  return jsonb_build_object('lan', p_lan, 'tu', to_char(l.tu_luc at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'), 'den', to_char(l.den_luc at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
    'cau_hoi', cau, 'tri_thuc_dang_co', tri, 'van_de_app', vd);
end $$;

create or replace function chiahang.fn_ai_hoc_ket_thuc(p_lan bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare b jsonb; v_moi int := 0; v_trung int := 0; v_loai text; v_nd text; v_cm text;
begin
  if coalesce(p->>'loi', '') <> '' then
    update ai_hoc_lan set trang_thai = 'loi', ket_thuc = now(), loi = left(p->>'loi', 500), mo_hinh = p->>'mo_hinh',
      token_vao = coalesce((p->>'vao')::bigint, 0), token_ra = coalesce((p->>'ra')::bigint, 0) where id = p_lan;
    return jsonb_build_object('ok', false);
  end if;
  for b in select e from jsonb_array_elements(coalesce(p->'bai', '[]')) e limit 30 loop
    v_loai := b->>'loai'; v_nd := left(trim(coalesce(b->>'noi_dung', '')), 800); v_cm := nullif(left(trim(coalesce(b->>'cau_mau', '')), 300), '');
    if v_loai not in ('tu_ngu', 'quy_tac', 'sua_sai', 'cau_mau', 'kien_thuc') or length(v_nd) < 8 then continue; end if;
    if v_loai = 'cau_mau' and v_cm is null then continue; end if;
    -- trùng: cùng loại, nội dung gần giống, hoặc câu mẫu gần giống
    if exists (select 1 from ai_tri_thuc t where t.trang_thai <> 'tat' and t.loai = v_loai
                and (fn_ai_giong(t.noi_dung, v_nd) >= 0.75 or (v_cm is not null and t.cau_mau is not null and fn_ai_giong(t.cau_mau, v_cm) >= 0.85))) then
      v_trung := v_trung + 1; continue;
    end if;
    insert into ai_tri_thuc (loai, cum_tu, cau_mau, noi_dung, cong_cu, nguon, nguoi, trang_thai, so_lan_dung, tao_luc, cap_nhat, bang_chung, hoc_lan)
    values (v_loai, nullif(left(trim(coalesce(b->>'cum_tu', '')), 300), ''), v_cm, v_nd, nullif(trim(coalesce(b->>'cong_cu', '')), ''),
            'tu_hoc', 'AI', 'cho_duyet', 0, now(), now(), b->'bang_chung', p_lan);
    v_moi := v_moi + 1;
  end loop;
  update ai_hoc_lan set trang_thai = 'xong', ket_thuc = now(), mo_hinh = p->>'mo_hinh', token_vao = coalesce((p->>'vao')::bigint, 0), token_ra = coalesce((p->>'ra')::bigint, 0),
    so_bai = v_moi, so_trung = v_trung, tom_tat = left(p->>'tom_tat', 1500) where id = p_lan;
  return jsonb_build_object('ok', true, 'moi', v_moi, 'trung', v_trung);
end $$;
revoke all on function chiahang.fn_ai_hoc_bat_dau(text, text), chiahang.fn_ai_hoc_tu_lieu(bigint), chiahang.fn_ai_hoc_ket_thuc(bigint, jsonb) from public, anon, authenticated;
grant execute on function chiahang.fn_ai_hoc_bat_dau(text, text), chiahang.fn_ai_hoc_tu_lieu(bigint), chiahang.fn_ai_hoc_ket_thuc(bigint, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. MÀN TRI THỨC: xem lượt học + token hôm nay (trả lời / tự học / trần) · Quản trị chỉnh thông số
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_hoc_xem(p_token uuid)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare u jsonb; v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  u := _fn_dt_u(p_token);
  return jsonb_build_object(
    'cfg', coalesce((select gia_tri from tham_so where key = 'ai_hoc' and pham_vi = 'chung'), '{}'),
    'hom_nay', jsonb_build_object(
      'tra_loi_vao', (select coalesce(sum(vao), 0) from ai_token where ngay = v_hn and nguoi <> 'AI_TU_HOC'),
      'tra_loi_ra', (select coalesce(sum(ra), 0) from ai_token where ngay = v_hn and nguoi <> 'AI_TU_HOC'),
      'tra_loi_lan', (select coalesce(sum(so_lan), 0) from ai_token where ngay = v_hn and nguoi <> 'AI_TU_HOC'),
      'tu_hoc', (select coalesce(sum(token_vao + token_ra), 0) from ai_hoc_lan where (bat_dau at time zone 'Asia/Ho_Chi_Minh')::date = v_hn),
      'tu_hoc_lan', (select count(*) from ai_hoc_lan where (bat_dau at time zone 'Asia/Ho_Chi_Minh')::date = v_hn and trang_thai <> 'bo')),
    'bay_ngay', (select coalesce(jsonb_agg(z order by z.ngay), '[]') from (
        select g::date ngay,
          (select coalesce(sum(vao + ra), 0) from ai_token a where a.ngay = g::date and a.nguoi <> 'AI_TU_HOC') tra_loi,
          (select coalesce(sum(token_vao + token_ra), 0) from ai_hoc_lan h where (h.bat_dau at time zone 'Asia/Ho_Chi_Minh')::date = g::date) tu_hoc
        from generate_series(v_hn - 6, v_hn, interval '1 day') g) z),
    'lan', (select coalesce(jsonb_agg(z), '[]') from (select id, to_char(bat_dau at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') luc, kich_hoat, nguoi, trang_thai, so_cau,
                 token_vao + token_ra token, so_bai, so_trung, tom_tat, loi, round(extract(epoch from coalesce(ket_thuc, now()) - bat_dau)) giay
               from ai_hoc_lan order by id desc limit 15) z),
    'cho_duyet', (select count(*) from ai_tri_thuc where trang_thai = 'cho_duyet'));
end $$;
grant execute on function chiahang.fn_ai_hoc_xem(uuid) to anon, authenticated;

create or replace function chiahang.fn_ai_hoc_cau_hinh(p_token uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare u jsonb; v jsonb := '{}';
begin
  u := _fn_dt_u(p_token);
  if coalesce(u->>'vai_tro', '') <> 'ADMIN' then raise exception 'Chỉ Quản trị đổi thông số tự học'; end if;
  if p ? 'bat' then v := v || jsonb_build_object('bat', (p->>'bat')::boolean); end if;
  if p ? 'tran_token_ngay' then v := v || jsonb_build_object('tran_token_ngay', greatest(0, least(5000000, (p->>'tran_token_ngay')::bigint))); end if;
  if p ? 'cach_gio' then v := v || jsonb_build_object('cach_gio', greatest(1, least(48, (p->>'cach_gio')::int))); end if;
  if p ? 'toi_da_cau' then v := v || jsonb_build_object('toi_da_cau', greatest(10, least(150, (p->>'toi_da_cau')::int))); end if;
  update tham_so set gia_tri = gia_tri || v where key = 'ai_hoc' and pham_vi = 'chung';
  return (select gia_tri from tham_so where key = 'ai_hoc' and pham_vi = 'chung');
end $$;
grant execute on function chiahang.fn_ai_hoc_cau_hinh(uuid, jsonb) to anon, authenticated;
