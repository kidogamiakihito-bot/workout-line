-- ① 種目マスタ
create table exercises (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- ② 筋トレ記録
create table records (
  id            bigint generated always as identity primary key,
  date          text not null,
  exercise_name text not null,
  weight_kg     numeric,
  sets          integer,
  reps          integer,
  note          text,
  source        text default 'pwa',
  created_at    timestamptz default now()
);

-- ③ インデックス（検索を速くする）
create index on records (date);
create index on records (exercise_name);

-- ④ 誰でも読み書きできるように（PWAから直接アクセスするため）
alter table exercises enable row level security;
alter table records    enable row level security;

create policy "public read exercises"  on exercises for select using (true);
create policy "public insert exercises" on exercises for insert with check (true);
create policy "public read records"    on records for select using (true);
create policy "public insert records"  on records for insert with check (true);
create policy "public delete records"  on records for delete using (true);

-- ⑤ 初期種目データ
insert into exercises (name) values
  ('ベンチプレス'), ('スクワット'), ('デッドリフト'),
  ('ショルダープレス'), ('ラットプルダウン'), ('ベントオーバーロウ'),
  ('ダンベルカール'), ('トライセプスプレスダウン'), ('レッグプレス'),
  ('インクラインベンチプレス'), ('チンニング'), ('ディップス'),
  ('レッグカール'), ('レッグエクステンション'), ('カーフレイズ'),
  ('サイドレイズ'), ('フロントレイズ'), ('ダンベルフライ'),
  ('アブドミナルクランチ'), ('プランク');
