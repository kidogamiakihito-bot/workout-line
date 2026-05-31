import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_TOKEN  = process.env.LINE_CHANNEL_TOKEN;

// ── エントリポイント ────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // LINE署名検証
  const signature = req.headers['x-line-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  if (hash !== signature) return res.status(401).json({ error: 'Invalid signature' });

  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    await handleMessage(event);
  }

  res.status(200).json({ status: 'ok' });
}

// ── メッセージ処理 ──────────────────────────────────
async function handleMessage(event) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 「今日の記録」「きょうの記録」コマンド
  if (text.match(/今日の?記録|きょうの?記録/)) {
    const today = todayStr();
    const { data } = await supabase
      .from('records')
      .select('*')
      .eq('date', today)
      .order('created_at');

    if (!data || data.length === 0) {
      await reply(replyToken, `📋 今日（${formatDate(today)}）の記録はまだありません`);
    } else {
      const lines = data.map(r => formatRecord(r));
      await reply(replyToken, `📋 今日の記録（${formatDate(today)}）\n\n${lines.join('\n')}`);
    }
    return;
  }

  // 「ヘルプ」コマンド
  if (text.match(/ヘルプ|help|使い方/i)) {
    await reply(replyToken,
      `💪 筋トレ記録Bot の使い方\n\n` +
      `【記録する】\n` +
      `ベンチプレス60kg3セット10回\n` +
      `スクワット100キロ5セット\n\n` +
      `【確認する】\n` +
      `今日の記録\n\n` +
      `種目名・重量・セット数・回数を自由な順番で話しかけてください！`
    );
    return;
  }

  // 筋トレ記録として解析
  const parsed = parseWorkout(text);
  if (!parsed || !parsed.exerciseName) {
    await reply(replyToken,
      `🤔 記録できませんでした。\n例：「ベンチプレス60kg3セット10回」のように入力してください。\n「ヘルプ」で使い方を確認できます。`
    );
    return;
  }

  // Supabaseに保存
  const { error } = await supabase.from('records').insert({
    date: todayStr(),
    exercise_name: parsed.exerciseName,
    weight_kg: parsed.weightKg,
    sets: parsed.sets,
    reps: parsed.reps,
    source: 'line',
  });

  if (error) {
    console.error('Supabase error:', error);
    await reply(replyToken, '❌ 保存に失敗しました。もう一度お試しください。');
    return;
  }

  const detail = [
    parsed.weightKg != null && `${parsed.weightKg}kg`,
    parsed.sets != null && `${parsed.sets}セット`,
    parsed.reps != null && `${parsed.reps}回`,
  ].filter(Boolean).join(' · ');

  await reply(replyToken,
    `✅ 記録しました！\n\n💪 ${parsed.exerciseName}\n${detail}`
  );
}

// ── テキスト解析 ────────────────────────────────────
const ALIASES = {
  'ベンチ': 'ベンチプレス',
  'スクワ': 'スクワット',
  'デッド': 'デッドリフト',
  'ショルダー': 'ショルダープレス',
  'ラット': 'ラットプルダウン',
  'チン': 'チンニング',
  'ディップ': 'ディップス',
  'カール': 'ダンベルカール',
  'フライ': 'ダンベルフライ',
};

async function getExerciseNames() {
  const { data } = await supabase.from('exercises').select('name');
  return data ? data.map(e => e.name) : [];
}

function parseWorkout(text) {
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:キロ|kg|KG)/i);
  const setsMatch   = text.match(/(\d+)\s*(?:セット|set)/i);
  const repsMatch   = text.match(/(\d+)\s*(?:回|レップ|rep)/i);

  const weightKg = weightMatch ? parseFloat(weightMatch[1]) : null;
  const sets     = setsMatch   ? parseInt(setsMatch[1])     : null;
  const reps     = repsMatch   ? parseInt(repsMatch[1])     : null;

  // 数字のみの場合、最初の数字を重量として扱う
  let exerciseName = null;
  for (const [alias, full] of Object.entries(ALIASES)) {
    if (text.includes(alias)) { exerciseName = full; break; }
  }
  if (!exerciseName) {
    const m = text.match(/^([^\d]+?)(?=\d)/);
    if (m) exerciseName = m[1].trim();
  }

  if (!exerciseName && weightKg === null && sets === null) return null;
  return { exerciseName: exerciseName || '不明', weightKg, sets, reps };
}

// ── LINEへの返信 ────────────────────────────────────
async function reply(replyToken, text) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
}

// ── ユーティリティ ──────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatRecord(r) {
  const detail = [
    r.weight_kg != null && `${r.weight_kg}kg`,
    r.sets      != null && `${r.sets}セット`,
    r.reps      != null && `${r.reps}回`,
  ].filter(Boolean).join(' · ');
  return `💪 ${r.exercise_name}　${detail}`;
}
