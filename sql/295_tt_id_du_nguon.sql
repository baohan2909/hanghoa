-- ============================================================================
-- NEW - 295: ID NGƯỜI BÁN TIKTOK TÍNH ĐỦ MỌI NGUỒN DOANH THU CỦA TÀI KHOẢN (đối chiếu file kế toán 25/11)
--   Đối chiếu file BC-DT TIKTOK 25-11 (26.565 dòng, 1→25/11): kế toán gán MỌI đơn cho đúng tài khoản TikTok ghi nhận
--   (mã tài khoản trong báo cáo phân tích TikTok), kể cả gián tiếp / trưng bày. App trước đây bỏ phần gián tiếp + trưng bày.
--   Quy tắc mới cho dòng có báo cáo phân tích (tt_ar_dong):
--     • Người bán = tài khoản TikTok ghi nhận (trực tiếp HAY gián tiếp), tên theo NGÀY ĐẶT (tài khoản đổi tên / chuyển cửa hàng
--       thì đơn trước ngày đổi vẫn thuộc tên cũ). Không có tên trong báo cáo → lấy tên từ API liên kết (tt_lk_dong).
--     • Kênh = loại nội dung: LIVE → live, VIDEO → video, thẻ / trưng bày → the. Gián tiếp vẫn tính cho đúng kênh đó,
--       đánh dấu ở nb_gian_tiep (= tên tài khoản khi gián tiếp) để màn hình tách riêng được.
--     • Bỏ quy tắc cũ "gián tiếp + có phòng LIVE đang mở → gán chủ phòng" (kế toán 25/11: 7/7 dòng thuộc tài khoản TikTok ghi nhận).
--     • Bỏ ưu tiên chủ phòng trên dòng đơn cho LIVE trực tiếp (kế toán 25/11: 3/3 dòng thuộc tài khoản TikTok ghi nhận).
--     • Không tài khoản nào (TikTok không ghi mã) → để trống người bán (nhóm "Shop – không qua tài khoản").
--   Lịch sử tên tài khoản (tt_tk_ten): nạp 2 lần đổi tên tháng 11 theo file kế toán; từ nay tự ghi khi TikTok trả tên mới.
--   Sao lưu cột gán ID trước khi chạy: tt_don_dong_bk295 (khôi phục được).
-- ============================================================================

-- 1) Sao lưu
create table if not exists chiahang.tt_don_dong_bk295 as
  select ma_don, sku_id, creator, kenh, nb_gian_tiep, nb_nguon, nd_id, tai_khoan, now() luc from chiahang.tt_don_dong;
alter table chiahang.tt_don_dong_bk295 enable row level security;
revoke all on chiahang.tt_don_dong_bk295 from anon, authenticated;

-- 2) Lịch sử tên tài khoản: tên CŨ + khoảng ngày còn dùng tên đó (tên hiện tại vẫn lấy như cũ)
create table if not exists chiahang.tt_tk_ten (
  open_id   text not null,
  username  text not null,
  tu_ngay   date,                 -- null = từ trước tới giờ
  den_ngay  date not null,        -- ngày cuối còn dùng tên này
  nguon     text,                 -- ke_toan_2511 / tu_dong
  ghi_chu   text,
  tao_luc   timestamptz default now(),
  primary key (open_id, username)
);
alter table chiahang.tt_tk_ten enable row level security;
revoke all on chiahang.tt_tk_ten from anon, authenticated;

insert into chiahang.tt_tk_ten (open_id, username, tu_ngay, den_ngay, nguon, ghi_chu)
select t.open_id, v.cu, null, v.den::date, 'ke_toan_2511', v.ghi_chu
from (values ('doisaleso19', 'nonsonlythuongkiethm', '2026-11-12', 'Kế toán: 1→12/11 tên nonsonlythuongkiethm (Trường Chinh 2), từ 13/11 doisaleso19 (Đội sale 19)'),
             ('doisaleso24', 'nguyenthaibinh.nonson', '2026-11-19', 'Kế toán: 10→19/11 tên nguyenthaibinh.nonson (Nguyễn Thái Bình), từ 21/11 doisaleso24 (Đội sale 24)')) v(moi, cu, den, ghi_chu)
join chiahang.tt_tg t on t.username = v.moi
on conflict (open_id, username) do nothing;

-- cửa hàng của tên cũ (theo file kế toán)
insert into chiahang.tt_creator (handle, ma_ch, loai, tu_dong, ghi_chu)
values ('nonsonlythuongkiethm', 'CH05088', 'CH', false, 'Tên cũ của doisaleso19 (tới 12/11) — theo file kế toán 25/11'),
       ('nguyenthaibinh.nonson', 'CH05021', 'CH', false, 'Tên cũ của doisaleso24 (tới 19/11) — theo file kế toán 25/11')
on conflict (handle) do nothing;

-- 3) Tên tài khoản theo NGÀY
create or replace function chiahang._fn_tt_ten_tk(p_open text, p_room text, p_video text, p_ngay date)
returns text language sql stable set search_path to chiahang, public as $$
  select coalesce(
    (select username from tt_tk_ten where open_id = p_open and p_ngay <= den_ngay and (tu_ngay is null or p_ngay >= tu_ngay)
      order by den_ngay limit 1),
    _fn_tt_ar_ten(p_room, p_video, p_open))
$$;

-- 4) Tự ghi tên cũ khi tài khoản đổi tên; chặn tên bị lật ngược về tên cũ
create or replace function chiahang._fn_tt_tg_doi_ten() returns trigger
language plpgsql security definer set search_path to chiahang, public as $$
declare v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if old.username is null or new.username is not distinct from old.username then return new; end if;
  -- tên mới là 1 tên cũ đã ghi → dữ liệu cũ lật lại, giữ tên hiện tại
  if exists (select 1 from tt_tk_ten where open_id = new.open_id and username = new.username) then
    new.username := old.username; new.nguon := old.nguon; new.cap_nhat_luc := old.cap_nhat_luc;
    return new;
  end if;
  insert into tt_tk_ten (open_id, username, tu_ngay, den_ngay, nguon, ghi_chu)
  values (new.open_id, old.username,
          (select max(den_ngay) + 1 from tt_tk_ten where open_id = new.open_id),
          v_hn - 1, 'tu_dong', 'Đổi tên thành ' || new.username || ' (phát hiện ' || to_char(v_hn, 'DD/MM/YYYY') || ')')
  on conflict (open_id, username) do update set den_ngay = greatest(tt_tk_ten.den_ngay, excluded.den_ngay);
  return new;
end $$;
drop trigger if exists tg_tt_tg_doi_ten on chiahang.tt_tg;
create trigger tg_tt_tg_doi_ten before update of username on chiahang.tt_tg
  for each row execute function chiahang._fn_tt_tg_doi_ten();

-- 5) Học mã tài khoản → tên: lấy dòng MỚI NHẤT (không lật về tên cũ); thêm nguồn API liên kết cho mã chưa có tên
create or replace function chiahang._fn_tt_hoc_tg(p_don text[] default null::text[])
returns integer language plpgsql security definer set search_path to chiahang, public as $$
declare v_n int; v_m int;
begin
  insert into tt_tg as t (open_id, username, nguon)
  select distinct on (a.open_id) a.open_id, coalesce(lower(lv.username), lower(v.username)), case when lv.username is not null then 'live' else 'video' end
    from tt_ar_dong a
    left join tt_live lv on lv.id = a.room_id and lv.username is not null
    left join lateral (select username from tt_video_ngay where video_id = a.video_id and username is not null limit 1) v on true
   where coalesce(a.open_id, '') <> '' and coalesce(lv.username, v.username) is not null
     and (p_don is null or a.ma_don = any(p_don))
   order by a.open_id, a.ngay desc nulls last, (lv.username is null)   -- NEW - 295: dòng mới nhất
  on conflict (open_id) do update set username = excluded.username, nguon = excluded.nguon, cap_nhat_luc = now()
   where t.username is distinct from excluded.username;
  get diagnostics v_n = row_count;
  -- NEW - 295: mã tài khoản chưa có tên → tên nhà sáng tạo trong API liên kết (cùng dòng đơn, đơn liên kết)
  insert into tt_tg as t (open_id, username, nguon)
  select distinct on (a.open_id) a.open_id, lower(k.creator), 'lien_ket'
    from tt_ar_dong a join tt_lk_dong k on k.ma_don = a.ma_don and k.sku_id = a.sku_id
   where coalesce(a.open_id, '') <> '' and k.creator is not null and a.nguon_don = 'AFFILIATE'
     and (p_don is null or a.ma_don = any(p_don))
   order by a.open_id, a.ngay desc nulls last
  on conflict (open_id) do nothing;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $$;

-- 6) Gán ID người bán theo báo cáo phân tích — đủ mọi nguồn của tài khoản
create or replace function chiahang._fn_tt_gan_ar(p_don text[] default null::text[])
returns integer language plpgsql security definer set search_path to chiahang, public as $$
declare v_n int;
begin
  update tt_don_dong l set
      creator      = x.nb,
      kenh         = x.kenh,
      nb_gian_tiep = x.gian_tiep,
      tai_khoan    = x.tai_khoan,
      nb_nguon     = case when x.nb is not null then 'bao_cao' else l.nb_nguon end,
      nd_id        = coalesce(x.nd_id, l.nd_id)
    from (select a.ma_don, a.sku_id, a.tai_khoan,
                 case a.nd_loai when 'LIVE' then 'live' when 'VIDEO' then 'video' else 'the' end kenh,   -- NEW - 295: theo loại nội dung
                 t.nb,
                 case when a.ghi_nhan = 'INDIRECT' then t.nb end gian_tiep,                              -- NEW - 295: đánh dấu gián tiếp
                 nullif(coalesce(nullif(a.video_id, ''), nullif(a.room_id, '')), '') nd_id
            from tt_ar_dong a
            join tt_don d on d.ma_don = a.ma_don
            left join tt_lk_dong k on k.ma_don = a.ma_don and k.sku_id = a.sku_id
            -- NEW - 295: tài khoản TikTok ghi nhận (trực tiếp / gián tiếp), tên theo ngày đặt; thiếu tên → API liên kết
            cross join lateral (select coalesce(_fn_tt_ten_tk(a.open_id, a.room_id, a.video_id, d.ngay),
                                                case when a.nguon_don = 'AFFILIATE' then lower(k.creator) end) nb) t
           where (p_don is null or a.ma_don = any(p_don))) x
   where l.ma_don = x.ma_don and l.sku_id = x.sku_id
     and coalesce(l.nb_nguon, '') <> 'excel'
     and (l.creator is distinct from x.nb or l.kenh is distinct from x.kenh or l.nb_gian_tiep is distinct from x.gian_tiep
          or l.tai_khoan is distinct from x.tai_khoan);
  get diagnostics v_n = row_count;
  perform _fn_tt_dau_don(p_don);
  update tt_don d set creator = null, kenh = x.kenh
    from (select ma_don, max(kenh) kenh from tt_don_dong where (p_don is null or ma_don = any(p_don))
          group by 1 having count(creator) = 0) x
   where d.ma_don = x.ma_don and d.nguon = 'api' and (d.creator is not null or d.kenh is distinct from x.kenh);

  insert into tt_creator (handle, ma_ch, loai, tu_dong)
  select n.h, g.ma_ch, case when g.ma_ch like 'DOISALE%' then 'DOISALE' when g.ma_ch is not null then 'CH' end, true
  from (select distinct creator h from tt_don_dong l where creator is not null and nb_nguon = 'bao_cao'
          and (p_don is null or l.ma_don = any(p_don))
          and not exists (select 1 from tt_creator c where c.handle = l.creator)) n
  cross join lateral (select _fn_tt_goi_y(n.h) ma_ch) g
  on conflict (handle) do nothing;
  return v_n;
end $$;

revoke all on function chiahang._fn_tt_ten_tk(text, text, text, date), chiahang._fn_tt_tg_doi_ten(),
  chiahang._fn_tt_hoc_tg(text[]), chiahang._fn_tt_gan_ar(text[]) from public, anon, authenticated;

-- 7) Chạy lại cho toàn bộ dữ liệu
select chiahang._fn_tt_hoc_tg(null);
select chiahang._fn_tt_gan_ar(null);

-- 8) Bỏ số nhớ báo cáo cũ
update chiahang.tt_bc_nho set luc = now() - interval '1 day';
update chiahang.nh_bc_nho set luc = now() - interval '1 day', pb = coalesce(pb, '') || '~295';
