-- ============================================================================
-- NEW - 290: TỰ HỌC TIẾT KIỆM (anh ít hỏi → không chạy định kỳ cho tốn token)
--   • Chỉ học khi ĐÁNG học: có câu bị sửa / hỏi lại / báo sai / lỗi / câu trả lời có ⚠  — HOẶC tích đủ it_nhat_cau câu mới (mặc định 15).
--     Không đủ → bỏ qua, KHÔNG gọi AI, không ghi dòng nào.
--   • Tối đa 1 lượt / cach_gio giờ (mặc định 24); lượt LỖI cũng tính → không còn thử lại liên tục (26/11 sáng 3 lượt lỗi).
--   • Sửa lỗi lưu bài học: cụm từ trống (cột cum_tu không được rỗng).
--   • Tri thức đang có gửi cho AI rút gọn (máy chủ tự lọc trùng).
-- ============================================================================
update chiahang.tham_so
set gia_tri = gia_tri || '{"cach_gio": 24, "it_nhat_cau": 15}'::jsonb,
    mo_ta = 'SIÊU TRÍ TUỆ tự học: bật/tắt · trần token mỗi ngày · tối thiểu bao nhiêu giờ học 1 lần · tối đa số câu đọc lại · chỉ học khi có câu bị sửa/báo sai/lỗi hoặc đủ it_nhat_cau câu mới'
where key = 'ai_hoc' and pham_vi = 'chung';

-- câu hỏi có dấu hiệu sai (dùng chung cho bắt đầu học + tư liệu)
create or replace function chiahang._fn_ai_hoc_dau_sai(p_viec uuid)
returns boolean language sql stable security definer set search_path to chiahang, public as $$
  select coalesce((
    select v.trang_thai = 'loi' or position('⚠' in coalesce(v.tra_loi, '')) > 0
        or exists (select 1 from ai_bao_sai b where b.viec_id = v.id)
        or exists (select 1 from ai_viec v2 where v2.phien_id = v.phien_id and v2.bat_dau > v.bat_dau and v2.bat_dau < v.bat_dau + interval '20 minutes'
                    and fn_ai_bo_dau(lower(v2.yeu_cau)) ~ '(^|[^a-z])(sai|khong phai|nham|y anh la|chua dung|khong dung|lam lai|tinh lai|hoi lai)([^a-z]|$)')
    from ai_viec v where v.id = p_viec), false)
$$;

create or replace function chiahang.fn_ai_hoc_bat_dau(p_kich_hoat text, p_nguoi text)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare cfg jsonb := coalesce((select gia_tri from tham_so where key = 'ai_hoc' and pham_vi = 'chung'), '{}');
  v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_dung bigint; v_tran bigint := coalesce((cfg->>'tran_token_ngay')::bigint, 400000);
  v_cuoi timestamptz; v_tu timestamptz; v_so int; v_sai int; v_id bigint; v_it int := greatest(1, coalesce((cfg->>'it_nhat_cau')::int, 15));
begin
  if not coalesce((cfg->>'bat')::boolean, true) then return jsonb_build_object('chay', false, 'ly_do', 'Tự học đang tắt'); end if;
  perform pg_advisory_xact_lock(hashtext('ai_hoc_lan'));
  update ai_hoc_lan set trang_thai = 'loi', ket_thuc = now(), loi = 'Quá 15 phút không xong' where trang_thai = 'dang_chay' and bat_dau < now() - interval '15 minutes';
  if exists (select 1 from ai_hoc_lan where trang_thai = 'dang_chay') then return jsonb_build_object('chay', false, 'ly_do', 'Đang có lượt học khác'); end if;
  select coalesce(sum(token_vao + token_ra), 0) into v_dung from ai_hoc_lan where (bat_dau at time zone 'Asia/Ho_Chi_Minh')::date = v_hn;
  if v_dung >= v_tran then return jsonb_build_object('chay', false, 'ly_do', format('Đã dùng hết trần tự học hôm nay (%s / %s token)', v_dung, v_tran)); end if;
  select max(bat_dau) into v_cuoi from ai_hoc_lan where trang_thai in ('xong', 'bo', 'loi');   -- NEW - 290: lượt lỗi cũng tính
  if p_kich_hoat <> 'tay' and v_cuoi is not null and v_cuoi > now() - make_interval(hours => greatest(1, coalesce((cfg->>'cach_gio')::int, 24))) then
    return jsonb_build_object('chay', false, 'ly_do', 'Chưa tới giờ học lượt sau');
  end if;
  select coalesce(max(den_luc), now() - interval '24 hours') into v_tu from ai_hoc_lan where trang_thai = 'xong';
  v_tu := greatest(v_tu, now() - interval '7 days');
  select count(*), count(*) filter (where _fn_ai_hoc_dau_sai(id)) into v_so, v_sai
  from ai_viec where bat_dau > v_tu and bat_dau < now() - interval '2 minutes' and trang_thai in ('xong', 'loi', 'dung');
  if v_so = 0 then return jsonb_build_object('chay', false, 'ly_do', 'Không có câu hỏi mới để học'); end if;
  -- NEW - 290: chỉ học khi đáng học (bấm tay thì luôn học)
  if p_kich_hoat <> 'tay' and v_sai = 0 and v_so < v_it then
    return jsonb_build_object('chay', false, 'ly_do', format('Chưa cần học: %s câu mới, chưa có câu nào bị sửa / báo sai (học khi có câu sai hoặc đủ %s câu)', v_so, v_it));
  end if;
  insert into ai_hoc_lan (kich_hoat, nguoi, tu_luc, den_luc, so_cau) values (p_kich_hoat, p_nguoi, v_tu, now() - interval '2 minutes', v_so) returning id into v_id;
  return jsonb_build_object('chay', true, 'lan', v_id, 'so_cau', v_so, 'so_sai', v_sai, 'con_token', v_tran - v_dung, 'toi_da_cau', coalesce((cfg->>'toi_da_cau')::int, 80));
end $$;

-- tư liệu: đánh dấu câu nghi sai, tri thức đang có rút gọn
do $do$
declare d text;
  o1 text := $q$'bao_sai', (select string_agg(coalesce(bs.ghi_chu, 'báo sai'), ' | ') from ai_bao_sai bs where bs.viec_id = v.id))) x$q$;
  n1 text := $q$'bao_sai', (select string_agg(coalesce(bs.ghi_chu, 'báo sai'), ' | ') from ai_bao_sai bs where bs.viec_id = v.id),
      'nghi_sai', case when _fn_ai_hoc_dau_sai(v.id) then true end)) x$q$;
  o2 text := $q$select coalesce(jsonb_agg(jsonb_build_object('id', id, 'loai', loai, 'cum_tu', left(cum_tu, 80), 'noi_dung', left(noi_dung, 220), 'tt', trang_thai) order by id), '[]')$q$;
  n2 text := $q$select coalesce(jsonb_agg(jsonb_build_object('loai', loai, 'cum_tu', left(cum_tu, 60), 'noi_dung', left(noi_dung, 120)) order by id), '[]')$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_hoc_tu_lieu'::regproc);
  if position(o1 in d) = 0 then raise exception 'fn_ai_hoc_tu_lieu: mốc 1'; end if;
  if position(o2 in d) = 0 then raise exception 'fn_ai_hoc_tu_lieu: mốc 2'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;

-- lưu bài học: cụm từ trống → chuỗi rỗng (cột không cho rỗng)
do $do$
declare d text;
  o text := $q$values (v_loai, nullif(left(trim(coalesce(b->>'cum_tu', '')), 300), ''), v_cm,$q$;
  n text := $q$values (v_loai, left(trim(coalesce(b->>'cum_tu', '')), 300), v_cm,$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_hoc_ket_thuc'::regproc);
  if position(o in d) = 0 then raise exception 'fn_ai_hoc_ket_thuc: mốc'; end if;
  execute replace(d, o, n);
end $do$;

revoke all on function chiahang._fn_ai_hoc_dau_sai(uuid) from public, anon, authenticated;
grant execute on function chiahang._fn_ai_hoc_dau_sai(uuid) to service_role;
