-- ============================================================================
-- AIVideoCreator — Supabase スキーマ（要件 4: Auth / DB / Storage・RLS）
--
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行する。
-- 認証は Supabase Auth（メール/パスワード）を使用。各ユーザーは RLS により
-- 自分のデータ（projects 行・media フォルダ）のみ読み書きできる。
-- ============================================================================

-- ---- projects テーブル -----------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key,                 -- アプリ側で生成する Project.id
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default '無題のプロジェクト',
  data        jsonb not null,                   -- Project 全体（シーン等）
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

-- 自分の行のみ参照・作成・更新・削除できる。
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ---- media ストレージバケット ----------------------------------------------
-- 非公開バケット。読み取りはアプリが発行する署名付きURLで一時的に行う。
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- パスの先頭フォルダ（{userId}/...）が本人のときのみ読み書きできる。
drop policy if exists "media_select_own" on storage.objects;
create policy "media_select_own"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_insert_own" on storage.objects;
create policy "media_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_update_own" on storage.objects;
create policy "media_update_own"
  on storage.objects for update
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_delete_own" on storage.objects;
create policy "media_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
