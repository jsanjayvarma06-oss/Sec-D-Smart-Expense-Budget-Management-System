import { useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { parseReceiptText } from './receiptParser.js';

// Receipt scanner component (stories #83, #84, #85, #86).
// Runs Tesseract.js client-side so receipt images never leave the browser.
export default function ReceiptScanner({ categories = [], onReceiptParsed, disabled = false }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const workerRef = useRef(null);

  function triggerFileInput() {
    setError('');
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    // Reset file input so selecting the same file again triggers change
    e.target.value = '';

    if (!file) return;

    // Requirement #84: Non-image files refused with clear message
    if (!file.type || !file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, or WebP).');
      return;
    }

    // Requirement #84: Images over 5 MB refused with clear message
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError('Image is too large. Receipts must be under 5 MB.');
      return;
    }

    setError('');
    setScanning(true);
    setProgress(5);
    setStatusText('Loading OCR engine in browser…');

    try {
      // Requirement #85: Client-side OCR using Tesseract.js with progress display
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            setProgress(pct);
            setStatusText(`Reading receipt… ${pct}%`);
          } else if (m.status) {
            setStatusText(m.status.replace(/_/g, ' '));
          }
        },
      });
      workerRef.current = worker;

      const { data } = await worker.recognize(file);
      await worker.terminate();
      workerRef.current = null;

      const rawText = data?.text || '';
      // Requirement #86: Extract amount, date, shop name and match category
      const parsed = parseReceiptText(rawText, categories);

      setScanning(false);
      setProgress(100);
      setStatusText('');

      if (onReceiptParsed) {
        onReceiptParsed(parsed, file.name);
      }
    } catch (err) {
      if (workerRef.current) {
        try {
          await workerRef.current.terminate();
        } catch {
          // ignore cleanup errors
        }
        workerRef.current = null;
      }
      setScanning(false);
      setProgress(0);
      setStatusText('');
      setError(`Could not read receipt: ${err.message || 'Processing failed'}. You can enter details manually.`);
    }
  }

  return (
    <div className="receipt-scanner-container">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled || scanning}
        aria-label="Upload or take a photo of a receipt"
      />

      <button
        type="button"
        className={`secondary-button receipt-scan-button${scanning ? ' scanning' : ''}`}
        onClick={triggerFileInput}
        disabled={disabled || scanning}
      >
        <span aria-hidden="true">📸</span>{' '}
        {scanning ? 'Reading receipt…' : 'Scan receipt'}
      </button>

      {scanning && (
        <div className="receipt-scan-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="receipt-scan-progress-bar" style={{ width: `${Math.max(progress, 10)}%` }} />
          <span className="receipt-scan-status">{statusText}</span>
        </div>
      )}

      {error && (
        <p className="error-message receipt-scan-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
