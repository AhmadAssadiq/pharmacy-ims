// Records a voice message with the browser's own recorder (MediaRecorder) - GP2 addition.
//
//   const voice = useVoiceRecorder();
//   voice.start()   - asks for the microphone (the first time) and starts recording
//   voice.stop()    - stops; the result appears in voice.recording
//   voice.discard() - throws the recording away
//
// What it gives back:
//   isSupported - false in a browser that cannot record (the microphone button is hidden)
//   isRecording - true while recording
//   seconds     - how long the current recording has been running
//   recording   - null, or { blob, url, seconds } once a recording is ready to send
//                 (`url` can be played in an <audio> element)
//   problem     - null, 'denied' (no microphone permission) or 'tooShort' (under a second)
//
// A recording stops by itself after 2 minutes (CHAT_VOICE_MAX_SECONDS).
import { useEffect, useRef, useState } from 'react';
import constants from '../../../shared/constants.json';

const { CHAT_VOICE_MAX_SECONDS } = constants;

// Shorter than this is treated as an accidental tap, not a message
const MIN_SECONDS = 1;

export default function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(null);
  const [problem, setProblem] = useState(null);

  // Things that must survive between redraws without causing one
  const recorderRef = useRef(null); // the MediaRecorder while recording
  const streamRef = useRef(null); // the microphone stream
  const chunksRef = useRef([]); // the pieces of audio recorded so far
  const startedAtRef = useRef(0); // when the recording started (milliseconds)
  const timerRef = useRef(null); // the timer that counts the seconds
  const wantsToRecordRef = useRef(false); // false once stop() was called

  const isSupported =
    typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  // Switches the microphone off and stops the seconds counter
  function releaseMicrophone() {
    clearInterval(timerRef.current);
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }

  async function start() {
    if (!isSupported || isRecording) {
      return;
    }
    discard();
    setProblem(null);
    wantsToRecordRef.current = true;

    // 1. Ask for the microphone (the browser shows its permission question the first time)
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem('denied');
      return;
    }

    // The button was already released while the browser was asking: record nothing
    if (!wantsToRecordRef.current) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setProblem('tooShort');
      return;
    }

    // 2. Start recording, collecting the audio in pieces
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    // 3. When it stops: put the pieces together into one recording
    recorder.onstop = () => {
      const duration = (Date.now() - startedAtRef.current) / 1000;
      releaseMicrophone();
      setIsRecording(false);
      if (duration < MIN_SECONDS) {
        setProblem('tooShort');
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setRecording({ blob, url: URL.createObjectURL(blob), seconds: Math.round(duration) });
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setSeconds(0);
    setIsRecording(true);

    // 4. Count the seconds, and stop by itself at the limit
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= CHAT_VOICE_MAX_SECONDS) {
        stop();
      }
    }, 250);
  }

  function stop() {
    wantsToRecordRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop(); // onstop above does the rest
    }
  }

  function discard() {
    setRecording((current) => {
      if (current) {
        URL.revokeObjectURL(current.url); // free the memory the recording used
      }
      return null;
    });
    setProblem(null);
  }

  // When the chat page closes: stop recording and switch the microphone off
  useEffect(() => {
    return () => {
      wantsToRecordRef.current = false;
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      releaseMicrophone();
    };
  }, []);

  return { isSupported, isRecording, seconds, recording, problem, start, stop, discard };
}
