import React, { useState } from "react";

/**
 * BroadcastModal — Send Announcements to All Volunteers
 * Allows dispatchers to broadcast messages to all connected volunteers via WebSocket.
 */

export default function BroadcastModal({ onClose, onSend, wsConnection }) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSendBroadcast = async () => {
    if (!message.trim()) {
      setError("Please enter a message");
      return;
    }

    setIsSending(true);
    setError(null);

    const broadcastData = {
      type: "BROADCAST_ANNOUNCEMENT",
      payload: {
        message: message.trim(),
        timestamp: new Date().toISOString(),
        sender: "dispatcher",
      },
    };

    try {
      // Send via WebSocket if available
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify(broadcastData));
      } else {
        // Fallback: try HTTP endpoint
        const response = await fetch("http://localhost:8000/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(broadcastData.payload),
        });

        if (!response.ok) {
          throw new Error("Failed to send broadcast");
        }
      }

      setSuccess(true);
      onSend?.(broadcastData.payload);

      // Close after short delay on success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Broadcast error:", err);
      setError("Failed to send broadcast. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSendBroadcast();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📢 Broadcast Announcement</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: "16px" }}>
            <label style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "#64748b",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Message to All Volunteers
            </label>
            <textarea
              className="broadcast-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your announcement message..."
              rows={5}
              autoFocus
            />
            {error && (
              <p style={{
                color: "#ef4444",
                fontSize: "0.8125rem",
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}>
                ⚠️ {error}
              </p>
            )}
            {success && (
              <p style={{
                color: "#10b981",
                fontSize: "0.8125rem",
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}>
                ✓ Broadcast sent successfully!
              </p>
            )}
          </div>

          {/* Preview */}
          {message.trim() && (
            <div className="broadcast-preview">
              <small>Preview</small>
              <p style={{
                fontSize: "0.9375rem",
                color: "#1e293b",
                lineHeight: 1.5,
                margin: 0
              }}>
                {message.trim()}
              </p>
            </div>
          )}

          {/* Info */}
          <div style={{
            marginTop: "16px",
            padding: "12px 16px",
            background: "#eff6ff",
            borderRadius: "10px",
            border: "1px solid #bfdbfe"
          }}>
            <p style={{
              fontSize: "0.8125rem",
              color: "#0369a1",
              margin: 0,
              display: "flex",
              alignItems: "flex-start",
              gap: "8px"
            }}>
              ℹ️ This message will be sent to all connected volunteers immediately.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={isSending}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSendBroadcast}
            disabled={isSending || !message.trim() || success}
          >
            {isSending ? (
              <>
                <span className="animate-spin" style={{ display: "inline-block" }}>📡</span>
                Sending...
              </>
            ) : success ? (
              <>✓ Sent</>
            ) : (
              <>📢 Send Broadcast</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
