import React, { useState, useEffect } from "react";

/**
 * NotesModal — Add and View Notes for Incidents
 * Allows dispatchers to add notes to incidents for tracking and coordination.
 */

export default function NotesModal({ incidentId, onClose, onSave }) {
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load existing notes from localStorage on mount
  useEffect(() => {
    if (incidentId) {
      const storedNotes = localStorage.getItem(`incident-notes-${incidentId}`);
      if (storedNotes) {
        try {
          setNotes(JSON.parse(storedNotes));
        } catch (e) {
          console.error("Failed to parse stored notes:", e);
        }
      }
    }
  }, [incidentId]);

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      setError("Please enter a note");
      return;
    }

    setIsSaving(true);
    setError(null);

    const newNote = {
      id: `note-${Date.now()}`,
      text: noteText.trim(),
      timestamp: new Date().toISOString(),
      author: "dispatcher",
    };

    try {
      // Try to save to backend first
      const response = await fetch(`http://localhost:8000/incidents/${incidentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      });

      if (response.ok) {
        const savedNote = await response.json();
        const updatedNotes = [...notes, savedNote];
        setNotes(updatedNotes);
        // Also save to localStorage as backup
        localStorage.setItem(`incident-notes-${incidentId}`, JSON.stringify(updatedNotes));
      } else {
        // Fallback to localStorage
        const updatedNotes = [...notes, newNote];
        setNotes(updatedNotes);
        localStorage.setItem(`incident-notes-${incidentId}`, JSON.stringify(updatedNotes));
      }

      setNoteText("");
      onSave?.(newNote);
    } catch (err) {
      console.error("Failed to save note:", err);
      // Fallback to localStorage
      const updatedNotes = [...notes, newNote];
      setNotes(updatedNotes);
      localStorage.setItem(`incident-notes-${incidentId}`, JSON.stringify(updatedNotes));
      onSave?.(newNote);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = (noteId) => {
    const updatedNotes = notes.filter((n) => n.id !== noteId);
    setNotes(updatedNotes);
    localStorage.setItem(`incident-notes-${incidentId}`, JSON.stringify(updatedNotes));
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-SG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📝 Incident Notes</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Existing Notes */}
          {notes.length > 0 ? (
            <div className="notes-list">
              {notes.map((note) => (
                <div key={note.id} className="note-item">
                  <div className="note-item-header">
                    <span className="note-timestamp">
                      {formatTimestamp(note.timestamp)}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDeleteNote(note.id)}
                      style={{ padding: "4px 8px", color: "#ef4444" }}
                    >
                      🗑️
                    </button>
                  </div>
                  <p className="note-text">{note.text}</p>
                  {note.author && (
                    <small style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                      — {note.author === "dispatcher" ? "Dispatcher" : note.author}
                    </small>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "#94a3b8",
              background: "#f8fafc",
              borderRadius: "12px",
              marginBottom: "16px"
            }}>
              <p style={{ fontSize: "0.875rem", marginBottom: "4px" }}>No notes yet</p>
              <small style={{ fontSize: "0.75rem" }}>Add a note to track incident details</small>
            </div>
          )}

          {/* Add New Note */}
          <div style={{ marginTop: "16px" }}>
            <label style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "#64748b",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Add New Note
            </label>
            <textarea
              className="note-input"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter note details..."
              rows={4}
            />
            {error && (
              <p style={{
                color: "#ef4444",
                fontSize: "0.8125rem",
                marginTop: "8px"
              }}>
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveNote}
            disabled={isSaving || !noteText.trim()}
          >
            {isSaving ? (
              <>
                <span className="animate-spin" style={{ display: "inline-block" }}>⏳</span>
                Saving...
              </>
            ) : (
              <>💾 Save Note</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
