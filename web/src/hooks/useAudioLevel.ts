import { useEffect, useState } from 'react';

const FFT_SIZE = 1024;
const LEVEL_GAIN = 4; // speech RMS is ~0.05-0.2; scaled so normal speech fills most of the meter
const UPDATE_MS = 80;

/** Loudness of a live microphone stream from 0 to 1, for a level meter; 0 without a stream. */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    let updatedAt = 0;
    const measure = (time: number) => {
      if (time - updatedAt >= UPDATE_MS) {
        analyser.getFloatTimeDomainData(samples);
        const power = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
        setLevel(Math.min(1, Math.sqrt(power) * LEVEL_GAIN));
        updatedAt = time;
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      void context.close();
    };
  }, [stream]);

  return stream ? level : 0;
}
