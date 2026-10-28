import { useEffect, useRef, useState } from 'react';

// Microphone button for adding an expense by voice (story #87). Uses the
// browser's speech recognition (Chrome and Edge); renders nothing where it
// isn't available. Hands the recognised sentence to onTranscript.
const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : undefined;

export default function VoiceExpenseButton({ onTranscript, onError, disabled = false }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  if (!Recognition) return null;

  function start() {
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        onError('Microphone access was blocked. Allow it in the browser to add expenses by voice.');
      } else if (event.error === 'no-speech') {
        onError("Didn't hear anything. Tap the microphone and try again.");
      } else if (event.error !== 'aborted') {
        onError('Voice input stopped. Please try again or type the expense.');
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stop() {
    recognitionRef.current?.stop();
  }

  return (
    <button
      type="button"
      className={`secondary-button voice-button${listening ? ' listening' : ''}`}
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-pressed={listening}
    >
      <span aria-hidden="true">🎤</span>{' '}
      {listening ? 'Listening… tap to stop' : 'Say an expense'}
    </button>
  );
}
