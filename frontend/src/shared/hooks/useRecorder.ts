import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "done" | "error";

const LEVEL_MS = 80;
// Opus in WebM (Chrome, Firefox) or AAC in MP4 (Safari); the server converts either with ffmpeg.
const TYPES = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
];

function pickType() {
  if (typeof MediaRecorder === "undefined") return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t.mime)) ?? { mime: "", ext: "webm" };
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

/** Record from the browser's microphone: timer, input level, pause, and the result as a File to upload. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const paused = useRef(false);
  const keep = useRef(true); // false: the recording is thrown away on stop (discard / leaving the page)

  const release = useCallback(() => {
    timers.current.forEach(clearInterval);
    timers.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => undefined);
    audio.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    const type = pickType();
    if (!type || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record here. Recording works on localhost or over HTTPS.");
      setState("error");
      return;
    }
    setError(null);
    setFile(null);
    setSeconds(0);
    setState("requesting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setError(
        denied
          ? "Microphone access was denied. Allow it in the browser's address bar, then try again."
          : "No microphone found.",
      );
      setState("error");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, type.mime ? { mimeType: type.mime } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      release();
      if (!keep.current) return;
      const mime = rec.mimeType || type.mime || "audio/webm";
      setFile(new File(chunks, `recording-${stamp()}.${type.ext}`, { type: mime }));
      setState("done");
    };
    recorder.current = rec;
    keep.current = true;
    paused.current = false;
    rec.start(1000);
    setState("recording");

    // Input level, so it is obvious that the microphone hears the room.
    try {
      audio.current = new AudioContext();
      const analyser = audio.current.createAnalyser();
      analyser.fftSize = 512;
      audio.current.createMediaStreamSource(stream.current).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      timers.current.push(
        setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const s of samples) sum += ((s - 128) / 128) ** 2;
          setLevel(paused.current ? 0 : Math.min(1, Math.sqrt(sum / samples.length) * 4));
        }, LEVEL_MS),
      );
    } catch {
      // no level meter; recording still works
    }
    timers.current.push(setInterval(() => !paused.current && setSeconds((s) => s + 1), 1000));
  }, [release]);

  const pause = useCallback(() => {
    if (recorder.current?.state !== "recording") return;
    recorder.current.pause();
    paused.current = true;
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    if (recorder.current?.state !== "paused") return;
    recorder.current.resume();
    paused.current = false;
    setState("recording");
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const discard = useCallback(() => {
    keep.current = false;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    else release();
    setFile(null);
    setSeconds(0);
    setError(null);
    setState("idle");
  }, [release]);

  // Leaving the page stops the microphone.
  useEffect(
    () => () => {
      keep.current = false;
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      release();
    },
    [release],
  );

  return { state, seconds, level, file, error, start, pause, resume, stop, discard };
}
