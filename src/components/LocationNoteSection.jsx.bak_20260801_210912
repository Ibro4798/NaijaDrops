\"use client\";

import { useState, useRef, useEffect } from \"react\";
import { motion, AnimatePresence } from \"framer-motion\";
import { ChevronDown, ChevronUp, Mic, Square, Play, Trash2, Loader2 } from \"lucide-react\";
import { createClient } from \"@/utils/supabase/client\";

const MAX_RECORD_SECONDS = 30;
const BUCKET = \"media\";

/**
 * LocationNoteSection
 * Slides in once a pickup or dropoff location is confirmed.
 * Collects an optional text note and/or a short voice note (~30s cap).
 * Both are purely optional — skippable with zero friction.
 *
 * Props:
 *   label    – \"pickup\" | \"dropoff\"  (used in the heading copy)
 *   onChange – (note: { text: string, voiceUrl: string }) => void
 */
export default function LocationNoteSection({ label, onChange }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(\"\");
  const [voiceUrl, setVoiceUrl] = useState(\"\");
  const [useVoice, setUseVoice] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORD_SECONDS);
  const [uploadError, setUploadError] = useState(null);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Bubble changes up to parent
  useEffect(() => {
    onChange?.({ text, voiceUrl });
  }, [text, voiceUrl]);

  // Clean up on unmount
  useEffect(() => () => {
    clearInterval(timerRef.current);
    mediaRef.current?.stop?.();
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        clearInterval(timerRef.current);
        setUploading(true);
        setUploadError(null);
        const blob = new Blob(chunksRef.current, { type: \"audio/webm\" });
        const fileName = `voice_${label}_${Date.now()}.webm`;
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, blob, { contentType: \"audio/webm\", upsert: false });

        if (error) {
          setUploadError(\"Upload failed — check your connection.\");
        } else {
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
          setVoiceUrl(pub.publicUrl);
        }
        setUploading(false);
        // Stop all tracks so browser mic indicator goes away
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setRecording(true);
      setSecondsLeft(MAX_RECORD_SECONDS);

      // Auto-stop at 30 s
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stopRecording();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch {
      setUploadError(\"Microphone access denied.\");
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    mediaRef.current?.stop();
    setRecording(false);
  }

  function deleteVoice() {
    setVoiceUrl(\"\");
    setSecondsLeft(MAX_RECORD_SECONDS);
  }

  const isLabel = label === \"pickup\" ? \"pickup\" : \"dropoff\";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: \"auto\" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: \"easeOut\" }}
      className=\"overflow-hidden\"
    >
      <div className=\"mt-3 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden\">
        {/* Header / toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className=\"w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors\"
        >
          <span className=\"text-xs font-black text-charcoal-400 uppercase tracking-widest\">
            Help your rider find {isLabel === \"pickup\" ? \"you\" : \"the receiver\"}
          </span>
          <div className=\"flex items-center gap-1.5 text-charcoal-600\">
            {(text || voiceUrl) && (
              <span className=\"w-2 h-2 rounded-full bg-emerald-500 mr-1\" />
            )}
            <span className=\"text-[10px] font-bold text-charcoal-600\">Optional</span>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key=\"body\"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: \"auto\", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: \"easeInOut\" }}
              className=\"overflow-hidden\"
            >
              <div className=\"px-4 pb-4 space-y-3\">
                {/* Mode toggle */}
                <div className=\"flex gap-2\">
                  <button
                    onClick={() => setUseVoice(false)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                      !useVoice
                        ? \"bg-emerald-500/15 text-emerald-400 border border-emerald-500/30\"
                        : \"bg-white/[0.03] text-charcoal-500 border border-white/10\"
                    }`}
                  >
                    Type a note
                  </button>
                  <button
                    onClick={() => setUseVoice(true)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                      useVoice
                        ? \"bg-emerald-500/15 text-emerald-400 border border-emerald-500/30\"
                        : \"bg-white/[0.03] text-charcoal-500 border border-white/10\"
                    }`}
                  >
                    🎙 Voice note
                  </button>
                </div>

                {/* Text input */}
                {!useVoice && (
                  <textarea
                    rows={2}
                    maxLength={200}
                    placeholder={
                      isLabel === \"pickup\"
                        ? \"e.g. Blue gate, opposite Total filling station, call when near…\"
                        : \"e.g. Ask for Amina at the reception, second floor…\"
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className=\"w-full bg-charcoal-900 border border-white/10 rounded-xl p-3 text-sm text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none leading-relaxed\"
                  />
                )}

                {/* Voice note */}
                {useVoice && (
                  <div className=\"space-y-2\">
                    {uploading && (
                      <div className=\"flex items-center gap-2 text-emerald-400 text-xs font-bold py-2\">
                        <Loader2 size={14} className=\"animate-spin\" /> Saving voice note...
                      </div>
                    )}

                    {voiceUrl && !uploading && (
                      <div className=\"flex items-center gap-3 py-2\">
                        <button
                          onClick={() => { const a = new Audio(voiceUrl); a.play(); }}
                          className=\"flex items-center gap-2 px-4 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black\"
                        >
                          <Play size={13} fill=\"currentColor\" /> Play back
                        </button>
                        <button
                          onClick={deleteVoice}
                          className=\"p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl\"
                        >
                          <Trash2 size={13} />
                        </button>
                        <span className=\"text-emerald-400 text-xs font-black\">✓ Saved</span>
                      </div>
                    )}

                    {!voiceUrl && !uploading && (
                      <div className=\"flex items-center gap-3\">
                        <button
                          onClick={recording ? stopRecording : startRecording}
                          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            recording
                              ? \"bg-red-500 text-white animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.4)]\"
                              : \"bg-emerald-500 hover:bg-emerald-400 text-charcoal-950\"
                          }`}
                        >
                          {recording ? (
                            <><Square size={12} fill=\"currentColor\" /> Stop</>
                          ) : (
                            <><Mic size={12} /> Record</>
                          )}
                        </button>
                        {recording && (
                          <span className=\"text-red-400 text-xs font-black tabular-nums\">
                            {secondsLeft}s left
                          </span>
                        )}
                        {!recording && (
                          <span className=\"text-charcoal-600 text-xs\">Max 30s</span>
                        )}
                      </div>
                    )}

                    {uploadError && (
                      <p className=\"text-red-400 text-xs font-bold\">{uploadError}</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
