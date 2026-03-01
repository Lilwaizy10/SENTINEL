import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import VolunteerView from "./pages/VolunteerView";
import ClassifyTool from "./pages/ClassifyTool";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/volunteer/:id" element={<VolunteerView />} />
        <Route path="/classify" element={<ClassifyTool />} />
      </Routes>
    </Router>
  );
}

export default App;
