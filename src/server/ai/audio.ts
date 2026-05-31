/**
 * 音声合成（ElevenLabs）。サーバー専用。
 * ELEVENLABS_API_KEY が無ければモック結果を返す（キー無しでも動く）。
 */

import "server-only";
import { GenerationResult } from "@/lib/api";
import { estimateDurationMs } from "@/lib/sceneSplit";

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs の公開デフォルトボイス(Rachel)

export async function synthesizeNarration(text: string): Promise<GenerationResult> {
  const clean = text.trim();
  if (!clean) {
    return { ok: false, provider: "mock", mock: true, error: "テキストが空です" };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    // モック: 実際の音声は生成せず、尺だけ推定して成功扱いにする。
    return {
      ok: true,
      provider: "mock",
      mock: true,
      durationMs: estimateDurationMs(clean),
    };
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: clean,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        provider: "elevenlabs",
        mock: false,
        error: `ElevenLabs ${res.status}: ${detail.slice(0, 200)}`,
      };
    }

    // 小さなクリップ前提で data URL にインライン化（本来は Storage に保存して URL を返す）。
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
    return {
      ok: true,
      provider: "elevenlabs",
      mock: false,
      durationMs: estimateDurationMs(clean),
      mediaUrl: dataUrl,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "elevenlabs",
      mock: false,
      error: e instanceof Error ? e.message : "音声合成に失敗しました",
    };
  }
}
