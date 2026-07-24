import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Shield, FileText, CheckCircle, Cpu, Users, Activity, GitCommit } from 'lucide-react';
import Overview from './pages/Overview';
import Ledger from './pages/Ledger';
import Authorize from './pages/Authorize';
import Swarm from './pages/Swarm';
import Agents from './pages/Agents';

const MAIN_SHA = 'a908bbe';
const PENDING_SHA = 'f1eea272';
const VERSION = '0.3.0-alpha.0';

function TopBar() {
  const now = new Date();
  const ts = now.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <Shield size={18} color="var(--accent-light)" />
        <span>SecB</span>
        <span className="badge">Governance Command Center</span>
      </div>
      <div className="topbar-meta">
        <span className="sha">main @ <strong>{MAIN_SHA}</strong></span>
        <span>v{VERSION}</span>
        <span>{ts}</span>
        <span style={{ color: 'var(--status-pending)', fontWeight: 600 }}>
          ⏳ 2 gates pending
        </span>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="nav-section">Governance</div>
      <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <Activity className="icon" /> Overview
      </NavLink>
      <NavLink to="/authorize" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <CheckCircle className="icon" /> Authorize
        <span className="badge-count">2</span>
      </NavLink>
      <NavLink to="/ledger" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <FileText className="icon" /> Evidence Ledger
      </NavLink>
      <div className="nav-section">Command Center</div>
      <NavLink to="/swarm" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <Cpu className="icon" /> Ruflo Swarm
      </NavLink>
      <NavLink to="/agents" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <Users className="icon" /> Agent Registry
      </NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <TopBar />
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/authorize" element={<Authorize />} />
            <Route path="/swarm" element={<Swarm />} />
            <Route path="/agents" element={<Agents />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
