import React from "react";

/**
 * VolunteerPanel — Section 4.4
 * Lists available volunteers and their assignment status.
 */
export default function VolunteerPanel({ volunteers = [] }) {
  return (
    <div className="volunteer-panel">
      <h2>Volunteers</h2>
      <ul>
        {volunteers.map((v) => (
          <li key={v.id}>
            {v.name} — <em>{v.status}</em> ({v.distance ?? "?"} km away)
          </li>
        ))}
      </ul>
    </div>
  );
}
