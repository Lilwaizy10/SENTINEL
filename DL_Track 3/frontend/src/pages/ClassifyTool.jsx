import React, { useState } from "react";

/**
 * ClassifyTool — Section 4.1 (Route: /classify)
 * UI for uploading audio clips and triggering YAMNet classification.
 */
export default function ClassifyTool() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("http://localhost:8000/classify", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setResult({ error: "Classification failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="classify-tool">
      <h1>Audio Classifier</h1>
      <input type="file" accept="audio/*" onChange={handleUpload} />
      {loading && <p>Classifying…</p>}
      {result && (
        <pre>{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}
