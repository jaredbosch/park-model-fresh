import React, { useRef, useState } from 'react';
import { Button } from './ui/button';

const RentRollUpload = ({ onDataParsed }) => {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const handleFileUpload = async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    setLoading(true);
    setLoadingStatus('Uploading file...');

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        setLoadingStatus('Extracting text from PDF...');

        const response = await fetch('/api/parse-rentroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: base64, filename: file.name }),
        });

        setLoadingStatus('Analyzing rent roll data...');
        const result = await response.json();
        if (result.success) {
          const rows = Array.isArray(result.data) ? result.data : [];
          setPreviewData(rows);
          setSummary(result.summary || null);
          setShowModal(true);
        } else {
          alert('Failed to parse rent roll: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        setLoading(false);
        setLoadingStatus('');
        if (input) {
          input.value = '';
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = () => {
    if (typeof onDataParsed === 'function' && Array.isArray(previewData)) {
      onDataParsed(previewData);
    }
    setShowModal(false);
  };

  return (
    <div>
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600"
      >
        {loading ? (
          <>
            <svg
              className="h-5 w-5 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            {loadingStatus || 'Processing...'}
          </>
        ) : (
          'Upload Rent Roll'
        )}
      </Button>
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.csv"
        className="hidden"
        onChange={handleFileUpload}
      />

      {showModal && Array.isArray(previewData) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-3xl rounded-xl bg-slate-900 p-6 text-white">
            <h2 className="mb-3 text-xl font-semibold">Review Parsed Rent Roll</h2>

            {summary && (
              <div className="mb-4 text-sm text-slate-300">
                <p>Total Lots: {summary.totalLots}</p>
                <p>Occupied Lots: {summary.occupiedLots}</p>
                <p>Average Rent: ${summary.avgRent}</p>
                <p>
                  Mode Rent:{' '}
                  {summary.modeRent !== null && summary.modeRent !== undefined
                    ? `$${summary.modeRent}`
                    : '-' }
                </p>
              </div>
            )}

            <table className="w-full overflow-hidden rounded-lg border border-slate-700 text-sm">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-2 py-1 text-left">Lot #</th>
                  <th className="px-2 py-1 text-left">Tenant</th>
                  <th className="px-2 py-1 text-left">Occupied</th>
                  <th className="px-2 py-1 text-left">Rent</th>
                </tr>
              </thead>
              <tbody>
                {previewData.slice(0, 5).map((row, index) => (
                  <tr key={index} className="border-t border-slate-700">
                    <td className="px-2 py-1">{row.lotNumber}</td>
                    <td className="px-2 py-1">{row.tenantName || '-'}</td>
                    <td className="px-2 py-1">{row.occupied ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-1">${row.rent}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-2 text-xs text-slate-400">
              Showing first 5 of {summary?.totalLots || previewData.length} rows. You can edit after import.
            </p>

            <div className="mt-4 flex justify-end gap-3">
              <Button onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleConfirmImport} className="bg-blue-500 text-white hover:bg-blue-600">
                Confirm Import
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentRollUpload;
